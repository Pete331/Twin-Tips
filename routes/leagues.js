const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const db = require("../models");
const { requireAuth } = require("../middleware/auth");
const {
  leagueCreateLimiter,
  joinLimiter,
} = require("../middleware/rateLimit");
const {
  slugify,
  normaliseJoinCode,
  newInviteToken,
  newJoinCode,
} = require("../utils/leagueCodes");
const seasonService = require("../services/season");
const { seasonLadder } = require("../services/leagueStandings");
const { weeklyStandings } = require("../services/leagueRounds");
const globalLadder = require("../services/globalLadder");

// Everything a league needs: creating, joining, reading, and the handful of
// things its admin can do.
//
// Two rules run through all of it. Membership gates reading, so the invite
// token lets someone in and never doubles as a way to read a league from
// outside it. And a league you are not in answers exactly as one that does not
// exist, so trying slugs tells you nothing.

// A live league by slug, or null. Soft-deleted leagues are not found here -
// deleting one closes it to everything except its own members' history.
const findLeague = (slug) =>
  db.League.findOne({ slug: String(slug || ""), deletedAt: null });

// Membership gates reading, not the invite token. The token exists to let
// someone join; it must not double as a way to read a league you are not in,
// and neither must guessing a slug.
const requireMembership = async (req, res, next) => {
  try {
    const league = await findLeague(req.params.slug);

    if (!league) {
      return res
        .status(404)
        .json({ success: false, message: "No such league." });
    }

    const membership = await db.LeagueMembership.findOne({
      league: league._id,
      user: req.user.id,
    });

    // Deliberately the same 404 as a league that does not exist. A different
    // response would confirm the league is real to anyone trying slugs.
    if (!membership) {
      return res
        .status(404)
        .json({ success: false, message: "No such league." });
    }

    req.league = league;
    next();
  } catch (err) {
    console.error("league lookup failed:", err.message);
    res.status(500).json({ success: false, message: "Unable to load league." });
  }
};

// Admin-only actions. Membership is checked first, so a non-member gets the
// same 404 as a stranger rather than a 403 confirming the league exists.
const requireAdminOfLeague = (req, res, next) => {
  if (String(req.league.admin) !== String(req.user.id)) {
    return res.status(403).json({
      success: false,
      message: "Only the league admin can do that.",
    });
  }
  next();
};

// The round a new league starts scoring from: the next one its members can
// still tip. A league created mid-round must not claim tips that were entered
// before it existed.
//
// When the current round is already locked, that is the round after it. When
// the season is over the number runs past the last home-and-away round, which
// is correct rather than a problem: the league scores nothing this season and
// starts from the first round of the next.
const openingRound = (state) => {
  if (state.currentRound === null || state.currentRound === undefined) return 0;
  return state.tippingOpen ? state.currentRound : state.currentRound + 1;
};

// @route  POST /api/leagues
// @desc   Create a league; the creator administers it and joins it
// @access Private
router.post("/", requireAuth, leagueCreateLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const type = String(req.body.type || "");
    const buyIn = Number(req.body.buyIn);

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Give the league a name." });
    }

    if (name.length > 60) {
      return res.status(400).json({
        success: false,
        message: "That name is too long - 60 characters at most.",
      });
    }

    if (type !== "season" && type !== "weekly") {
      return res.status(400).json({
        success: false,
        message: "Choose whether the league is scored per round or per season.",
      });
    }

    // Only a weekly league has a pool, so only a weekly league has a stake.
    // Whatever a client sends for a season ladder is ignored rather than
    // stored, so it cannot turn up later looking like it meant something.
    const weekly = type === "weekly";

    // Immutable once set, so it is worth refusing anything odd now rather than
    // discovering it in a pool a month later.
    if (weekly && (!Number.isInteger(buyIn) || buyIn < 1 || buyIn > 1000)) {
      return res.status(400).json({
        success: false,
        message: "The buy-in must be a whole number of dollars, from 1 to 1000.",
      });
    }

    const state = await seasonService.getSeasonState();

    const league = await db.League.create({
      name,
      slug: slugify(name),
      type,
      ...(weekly ? { buyIn } : {}),
      admin: req.user.id,
      createdSeason: state.season,
      startRound: openingRound(state),
    });

    // The creator is a member, not just an administrator of one.
    await db.LeagueMembership.create({
      league: league._id,
      user: req.user.id,
      joinedAtRound: league.startRound,
    });

    res.status(201).json({
      name: league.name,
      slug: league.slug,
      type: league.type,
      buyIn: league.buyIn,
      startRound: league.startRound,
      createdSeason: league.createdSeason,
      isAdmin: true,
      invite: { token: league.inviteToken, code: league.joinCode },
    });
  } catch (err) {
    console.error("league create failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to create the league." });
  }
});

// @route  POST /api/leagues/join
// @desc   Join by invite link or join code
// @access Private
router.post("/join", requireAuth, joinLimiter, async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const code = normaliseJoinCode(req.body.code);

    let league = null;

    if (token) {
      league = await db.League.findOne({ inviteToken: token, deletedAt: null });
    } else if (code) {
      // Join codes are short and not unique, so two live leagues could hold
      // the same one. More than one match is treated as no match rather than
      // guessing which was meant - the invite link is unambiguous and is what
      // gets shared.
      const matches = await db.League.find({ deletedAt: null }).select(
        "joinCode"
      );
      const hits = matches.filter((l) => normaliseJoinCode(l.joinCode) === code);
      if (hits.length === 1) {
        league = await db.League.findById(hits[0]._id);
      }
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Enter an invite link or code." });
    }

    if (!league) {
      return res.status(404).json({
        success: false,
        message: "That invite is not valid. Ask for a new link.",
      });
    }

    const existing = await db.LeagueMembership.findOne({
      league: league._id,
      user: req.user.id,
    });

    // Already in it. Clicking the same link twice is not an error, and saying
    // so beats an error that makes someone think it failed.
    if (!existing) {
      const state = await seasonService.getSeasonState();
      await db.LeagueMembership.create({
        league: league._id,
        user: req.user.id,
        joinedAtRound: state.currentRound,
      });
    }

    res.status(200).json({
      name: league.name,
      slug: league.slug,
      type: league.type,
      buyIn: league.buyIn,
      alreadyMember: Boolean(existing),
    });
  } catch (err) {
    console.error("league join failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to join that league." });
  }
});

// @route  GET /api/leagues/mine
// @desc   The leagues the signed-in user belongs to
// @access Private
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const memberships = await db.LeagueMembership.find({ user: req.user.id })
      .populate({
        path: "league",
        select: "name slug type buyIn admin deletedAt",
      })
      .sort({ joinedAt: 1 });

    const leagues = memberships
      .map((m) => m.league)
      .filter((league) => league && !league.deletedAt)
      .map((league) => ({
        name: league.name,
        slug: league.slug,
        type: league.type,
        buyIn: league.buyIn,
        isAdmin: String(league.admin) === String(req.user.id),
      }));

    res.status(200).json({ leagues });
  } catch (err) {
    console.error("leagues/mine failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to load your leagues." });
  }
});

// @route  GET /api/leagues/rankings
// @desc   Where the signed-in user sits in each of their leagues, and globally
// @access Private
//
// Declared above /:slug. Express takes the first route that matches, and
// "rankings" is a perfectly good slug as far as that pattern is concerned - so
// below it this would be read as a request for a league nobody has, and
// answered with a 403 from requireMembership.
//
// One standings computation per league, which is the honest cost of the
// answer: a place only means anything relative to everyone else in that
// league, so there is no shortcut to it that does not work the table out.
// Leagues are small and a member belongs to a handful. The global ladder is
// the exception and is already cached in Mongo.
router.get("/rankings", requireAuth, async (req, res) => {
  try {
    const requested = Number(req.query.season);
    const season = Number.isInteger(requested)
      ? requested
      : (await seasonService.getSeasonState()).season;

    const memberships = await db.LeagueMembership.find({ user: req.user.id })
      .populate({ path: "league", select: "name slug type buyIn deletedAt" })
      .sort({ joinedAt: 1 });

    const leagues = memberships
      .map((m) => m.league)
      .filter((league) => league && !league.deletedAt);

    // A row carries the user either as an id or as a populated document - the
    // global ladder populates it to get the username, the league tables do not
    // - so both shapes are unwrapped. Compared as strings, because two
    // ObjectIds for the same user are never ===.
    const placeOf = (standings) => {
      const row = standings.find(
        (entry) =>
          String(entry.user && (entry.user._id || entry.user)) ===
          String(req.user.id)
      );
      return {
        // null rather than a guess, for a table this user is somehow not in.
        rank: row ? row.rank : null,
        tied: row ? Boolean(row.tied) : false,
        of: standings.length,
      };
    };

    const rankings = [];

    // Sequential rather than Promise.all: each of these runs several queries
    // of its own, and firing every league's at once buys little on a list this
    // short while making the load spikier.
    for (const league of leagues) {
      const ladder =
        league.type === "weekly"
          ? await weeklyStandings(league, season)
          : await seasonLadder(league, season);

      rankings.push({
        name: league.name,
        slug: league.slug,
        type: league.type,
        ...placeOf(ladder.standings),
      });
    }

    // Last, and always there. Everyone is in it whether they have joined a
    // league or not, so a member with no leagues still has somewhere to stand.
    const global = await globalLadder.get(season);
    rankings.push({
      name: "Global Ladder",
      slug: null,
      type: "global",
      ...placeOf(global.standings),
    });

    res.status(200).json({ season, rankings });
  } catch (err) {
    console.error("league rankings failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to load your rankings." });
  }
});

// @route  GET /api/leagues/:slug
// @desc   One league's detail
// @access Private, members only
router.get("/:slug", requireAuth, requireMembership, async (req, res) => {
  const league = req.league;
  const isAdmin = String(league.admin) === String(req.user.id);

  // The list rather than a count: the admin needs names to hand the league
  // over or remove someone, and every member is entitled to see who they are
  // playing against.
  const memberships = await db.LeagueMembership.find({ league: league._id })
    .populate({ path: "user", select: "username" })
    .sort({ joinedAt: 1 });

  const members = memberships
    // A membership whose user has deleted their account.
    .filter((m) => m.user)
    .map((m) => ({
      id: m.user._id,
      username: m.user.username,
      joinedAtRound: m.joinedAtRound,
      isAdmin: String(m.user._id) === String(league.admin),
      isYou: String(m.user._id) === String(req.user.id),
    }));

  res.status(200).json({
    name: league.name,
    slug: league.slug,
    type: league.type,
    buyIn: league.buyIn,
    createdSeason: league.createdSeason,
    startRound: league.startRound,
    members,
    memberCount: members.length,
    isAdmin,
    // Only the admin needs the credential, and only they can act on it.
    invite: isAdmin
      ? { token: league.inviteToken, code: league.joinCode }
      : undefined,
  });
});

// @route  GET /api/leagues/:slug/standings
// @desc   The league's table for a season
// @access Private, members only
router.get(
  "/:slug/standings",
  requireAuth,
  requireMembership,
  async (req, res) => {
    try {
      const league = req.league;

      // Defaults to the season the app is in, so the client does not have to
      // know which year it is.
      const requested = Number(req.query.season);
      const season = Number.isInteger(requested)
        ? requested
        : (await seasonService.getSeasonState()).season;

      // Two different tables, and deliberately not one component with a flag:
      // a season ladder ranks on tips and margin, a weekly league on what
      // people have won. They share the ranking rule underneath and nothing
      // above it.
      const ladder =
        league.type === "weekly"
          ? await weeklyStandings(league, season)
          : await seasonLadder(league, season);

      res.status(200).json({
        league: { name: league.name, slug: league.slug, type: league.type },
        // The buy-in travels with the standings. Two leagues on one page can
        // charge different amounts, so the multiplier cannot live in the
        // client the way it used to.
        buyIn: league.buyIn,
        ...ladder,
      });
    } catch (err) {
      console.error("league standings failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load standings." });
    }
  }
);

// @route  PATCH /api/leagues/:slug
// @desc   Rename, hand over admin, or roll the invite
// @access Private, admin only
router.patch(
  "/:slug",
  requireAuth,
  requireMembership,
  requireAdminOfLeague,
  async (req, res) => {
    try {
      const league = req.league;
      const update = {};

      // Refused rather than ignored. Silently dropping it would leave the
      // admin believing the buy-in had changed, and every past round was
      // scored against the old one.
      if (req.body.buyIn !== undefined) {
        return res.status(400).json({
          success: false,
          message:
            "The buy-in is fixed when a league is created - past rounds were scored against it.",
        });
      }

      // Same reasoning: a league's type decides how every round it has ever
      // played was settled.
      if (req.body.type !== undefined) {
        return res.status(400).json({
          success: false,
          message: "A league's scoring cannot change once it has been created.",
        });
      }

      if (req.body.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name || name.length > 60) {
          return res.status(400).json({
            success: false,
            message: "A name is required, up to 60 characters.",
          });
        }
        // The slug deliberately does not follow the name. Every invite link
        // already in a group chat points at the old one.
        update.name = name;
      }

      if (req.body.admin !== undefined) {
        // Checked before the query, because an id that is not an id makes
        // Mongoose throw on the cast - which came back as a 500 and told the
        // admin nothing about what was wrong.
        const successor = mongoose.isValidObjectId(req.body.admin)
          ? await db.LeagueMembership.findOne({
              league: league._id,
              user: String(req.body.admin),
            })
          : null;

        if (!successor) {
          return res.status(400).json({
            success: false,
            message: "You can only hand the league to one of its members.",
          });
        }

        update.admin = successor.user;
      }

      // Rolling the invite is how a removed member is kept out, and how a link
      // that has been shared too widely is taken back.
      if (req.body.regenerateInvite) {
        update.inviteToken = newInviteToken();
        update.joinCode = newJoinCode();
      }

      if (!Object.keys(update).length) {
        return res
          .status(400)
          .json({ success: false, message: "Nothing to change." });
      }

      // returnDocument: "after" rather than the deprecated new: true, so the
      // response carries the league as it now stands.
      const updated = await db.League.findByIdAndUpdate(
        league._id,
        { $set: update },
        { returnDocument: "after" }
      );

      res.status(200).json({
        name: updated.name,
        slug: updated.slug,
        type: updated.type,
        buyIn: updated.buyIn,
        isAdmin: String(updated.admin) === String(req.user.id),
        invite:
          String(updated.admin) === String(req.user.id)
            ? { token: updated.inviteToken, code: updated.joinCode }
            : undefined,
      });
    } catch (err) {
      console.error("league update failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to update the league." });
    }
  }
);

// @route  DELETE /api/leagues/:slug
// @desc   Close a league
// @access Private, admin only
router.delete(
  "/:slug",
  requireAuth,
  requireMembership,
  requireAdminOfLeague,
  async (req, res) => {
    try {
      // Soft. A hard delete would take its members' history with it, and
      // leagues get deleted by accident.
      await db.League.updateOne(
        { _id: req.league._id },
        { $set: { deletedAt: new Date() } }
      );

      res
        .status(200)
        .json({ success: true, message: `${req.league.name} has been closed.` });
    } catch (err) {
      console.error("league delete failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to close the league." });
    }
  }
);

// @route  DELETE /api/leagues/:slug/members/:userId
// @desc   Leave a league, or remove someone from it
// @access Private; members may remove themselves, the admin may remove others
router.delete(
  "/:slug/members/:userId",
  requireAuth,
  requireMembership,
  async (req, res) => {
    try {
      const league = req.league;
      const target = String(req.params.userId);
      const self = target === String(req.user.id);
      const isAdmin = String(league.admin) === String(req.user.id);

      if (!self && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only the league admin can remove someone else.",
        });
      }

      // A league without an admin cannot be administered back into existence,
      // so the way out is to hand it over first. Enforced here rather than by
      // hiding a button, because this same route serves both leaving and being
      // removed.
      if (self && isAdmin) {
        return res.status(400).json({
          success: false,
          message:
            "Hand the league to another member before you leave it.",
        });
      }

      const removed = await db.LeagueMembership.deleteOne({
        league: league._id,
        user: target,
      });

      if (!removed.deletedCount) {
        return res
          .status(404)
          .json({ success: false, message: "They are not in this league." });
      }

      // Their results stay. The league's history is a record of rounds that
      // were played, and removing someone does not unplay them.
      res.status(200).json({
        success: true,
        message: self ? `You have left ${league.name}.` : "Member removed.",
      });
    } catch (err) {
      console.error("league membership removal failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to update membership." });
    }
  }
);

module.exports = router;
