// Works out which season and round the competition is in, and whether tipping
// can run at all.
//
// Twin Tips asks you to pick one team from the top 8 of the ladder and one from
// the bottom 10. That only makes sense during the home-and-away season: in
// finals just the top eight play, and from the semi-finals onward the teams are
// not even known yet. So finals rounds are reported with tipping closed rather
// than shown as an empty round.

const db = require("../models");
const devClock = require("../utils/devClock");
// Only for the fallback case below. standings.js reads models and nothing
// else, so this does not close a cycle.
const standings = require("./standings");

// Squiggle names home-and-away rounds "Round N" and everything else
// descriptively - "Wildcard Finals", "Finals Week 1", "Semi-Finals",
// "Preliminary Finals", "Grand Final".
const isFinalsRoundName = (roundname) =>
  Boolean(roundname) && /final/i.test(roundname);

// is_final is a finals-type code, not a flag: 0 for home-and-away, and 2-7 for
// the various finals. Any non-zero value counts. roundname is kept as a
// fallback for fixtures stored before roundname was persisted.
const isFinalsFixture = (fixture) => {
  if (!fixture) return false;
  if (Number(fixture.is_final) > 0) return true;
  return isFinalsRoundName(fixture.roundname);
};

// The earliest kick-off among a round.s fixtures, or null if none of them
// carry a date. Pure, and exported, because the whole countdown hangs off this
// one value: get it wrong and the app tells people they have time they do not.
//
// Not simply roundFixtures[0].date. The caller happens to pass a list sorted by
// date, but that is the caller.s business - a round whose fixtures arrived in
// another order would otherwise silently produce a lockout at the wrong game.
const firstFixtureDate = (roundFixtures) => {
  const dates = roundFixtures
    .map((f) => f.date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  return dates.length ? dates[0] : null;
};

// How long after a round's last kick-off we stop believing our own data about
// it. No game lasts a day, so a round still reading as unfinished after this
// means the sync has stopped, not that the match is still going. Past it the
// checks below give up and let tipping through rather than holding a whole
// competition shut on a broken cron.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// The round being played right now: the earliest one that has started and has
// not finished.
//
// Not the same as the round of the next unplayed fixture, which is what this
// used to rely on. That moves the moment the last game of a round bounces, so
// for the two or three hours that game was being played the app had already
// moved on to the round after it - naming the wrong round, and worse, opening
// tipping for it. See the note on ladderReady in getSeasonState.
//
// Pure, and takes `now`, so the handful of hours this is about can be tested
// without waiting for a Sunday afternoon.
const roundInProgress = (fixtures, now) => {
  const byRound = new Map();
  for (const fixture of fixtures) {
    if (!byRound.has(fixture.round)) byRound.set(fixture.round, []);
    byRound.get(fixture.round).push(fixture);
  }

  for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
    const games = byRound.get(round);
    if (!games.some((g) => g.date && g.date <= now)) continue;
    if (games.every((g) => Number(g.complete) === 100)) continue;

    // A round that started long enough ago and still is not complete is stale
    // data rather than a long afternoon.
    const lastBounce = games
      .map((g) => g.date)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];
    if (lastBounce && now - lastBounce > STALE_AFTER_MS) continue;

    return round;
  }

  return null;
};

// The season to show: the most recent year we hold fixtures for. Deliberately
// derived from the data rather than the clock, so the app keeps working through
// the off-season instead of pointing at a year that has no fixtures yet.
const resolveSeason = async (requested) => {
  if (requested !== undefined && requested !== null && requested !== "") {
    const year = Number(requested);
    if (Number.isInteger(year)) return year;
  }

  const latest = await db.Fixture.findOne({}).sort({ year: -1 }).select("year");
  return latest ? latest.year : new Date().getFullYear();
};

// `now` is injectable so the mid-season paths can be tested without waiting for
// a season to come round.
// now defaults to the dev clock rather than new Date(), so every caller that
// asks what round it is agrees - the season route, and resolveSeason in
// api-routes, which decides the year a tip is filed under. They would
// otherwise disagree under an override, and the UI would show one round while
// tips went to another. Outside development devClock.now() is new Date().
//
// Still injectable, which is how the tests reach the mid-season paths.
// A season's fixtures, briefly cached.
//
// This function runs on every page load - SeasonContext asks for it before
// anything else renders - and its first act was to read every fixture of the
// season, about 207 documents, and sort them. Nothing about that changes more
// than once an hour: the scheduled sync writes fixtures, and the live-score
// refresh writes scores, and both are minutes apart at their busiest.
//
// Only the fixtures are cached. Everything derived from them - which round is
// current, whether it has started, whether tipping is open - is recomputed on
// every call against the clock passed in. That distinction is the whole point:
// caching the finished state would mean a round could read as open for up to
// the cache's lifetime after the first bounce, which is the one rule in this
// app that must not be even slightly late.
//
// Thirty seconds, which is short enough that a score written mid-round shows up
// on the next refresh but one, and long enough to take the read off almost
// every request.
const FIXTURE_CACHE_MS = 30 * 1000;
const fixtureCache = new Map();

const fixturesForSeason = async (season) => {
  const cached = fixtureCache.get(season);
  if (cached && Date.now() < cached.expires) return cached.fixtures;

  const fixtures = await db.Fixture.find({ year: season }).sort({ date: 1 });
  fixtureCache.set(season, {
    fixtures,
    expires: Date.now() + FIXTURE_CACHE_MS,
  });
  return fixtures;
};

// Called by anything that writes fixtures, so a sync's own follow-up reads see
// what it just wrote rather than what was there half a minute ago.
const forgetFixtures = (season) => {
  if (season === undefined) fixtureCache.clear();
  else fixtureCache.delete(season);
};

const getSeasonState = async (requestedSeason, now = devClock.now()) => {
  const season = await resolveSeason(requestedSeason);

  const fixtures = await fixturesForSeason(season);

  if (!fixtures.length) {
    return {
      season,
      hasFixtures: false,
      currentRound: null,
      roundName: null,
      isFinals: false,
      tippingOpen: false,
      // Not the reason tipping is shut here, and saying otherwise would put a
      // message about the ladder on a season that has no fixtures at all.
      ladderReady: true,
      // No fixtures, so no round to judge and no ladder to judge it on.
      ladderRound: null,
      ladderProvisional: false,
      ladderStale: false,
      homeAndAwayComplete: false,
      seasonComplete: false,
      lockout: true,
      // No fixtures, so nothing has bounced. lockout is true here for the
      // opposite reason - there is nothing to tip.
      roundStarted: false,
      lockoutAt: null,
      serverTime: now,
      timeTravelling: devClock.isActive(),
      firstRound: null,
      lastHomeAndAwayRound: null,
      roundNames: {},
      lastCompletedRound: null,
      rounds: [],
      message: `No fixtures loaded for ${season}.`,
    };
  }

  const homeAndAway = fixtures.filter((f) => !isFinalsFixture(f));

  const rounds = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b);
  const haRounds = [...new Set(homeAndAway.map((f) => f.round))].sort(
    (a, b) => a - b
  );

  // What Squiggle calls each round, by round number.
  //
  // roundName above names only the round we are on, which is all a heading
  // needs; a dropdown listing the whole season needs every one of them. The
  // client cannot work these out for itself - it holds the fixtures for one
  // round at a time - and it must not derive them from the number either,
  // because the numbering moves: the wildcard round added in 2026 pushed every
  // final up by one, so round 27 was the Preliminary Finals in 2025 and is the
  // Semi-Finals now.
  //
  // First one wins. A round can hold several is_final codes - Finals Week 1
  // carries both 2 and 3 - but every fixture in it agrees on the name.
  const roundNames = {};
  for (const fixture of fixtures) {
    if (fixture.roundname && roundNames[fixture.round] === undefined) {
      roundNames[fixture.round] = fixture.roundname;
    }
  }

  // Round 0 is a real round in some seasons (the "Opening Round"), so the first
  // round is whatever the data says rather than an assumed 1.
  const firstRound = rounds.length ? rounds[0] : null;
  const lastHomeAndAwayRound = haRounds.length ? haRounds[haRounds.length - 1] : null;

  // The most recent round where every game has been played. Not the same as
  // the current round: when a round is upcoming its fixtures exist with no
  // scores, so a results view opening on currentRound would show 0-0
  // throughout.
  const playedRounds = rounds.filter((round) =>
    fixtures
      .filter((f) => f.round === round)
      .every((f) => Number(f.complete) === 100)
  );
  const lastCompletedRound = playedRounds.length
    ? playedRounds[playedRounds.length - 1]
    : null;

  const nextFixture = fixtures.find((f) => f.date && f.date > now);
  const lastFixture = [...fixtures].reverse().find((f) => f.date && f.date <= now);

  const seasonComplete = !nextFixture;

  // A round still being played wins over the next unplayed fixture. Without
  // this the app rolled over on the last bounce of a round rather than its
  // last siren: for the length of that final game it named the round after,
  // and opened tipping for it.
  const playing = roundInProgress(fixtures, now);
  const nextUp = nextFixture || lastFixture;
  const currentFixture =
    playing !== null
      ? fixtures.find((f) => f.round === playing) || nextUp
      : nextUp;

  const currentRound = currentFixture ? currentFixture.round : lastHomeAndAwayRound;
  const roundName = currentFixture ? currentFixture.roundname || null : null;
  const isFinals = isFinalsFixture(currentFixture);

  const homeAndAwayComplete =
    lastHomeAndAwayRound === null ||
    !homeAndAway.some((f) => f.date && f.date > now);

  // Lockout means the current round has started, so selections are frozen.
  const roundFixtures = fixtures.filter((f) => f.round === currentRound);
  const roundStarted = roundFixtures.some((f) => f.date && f.date <= now);

  // The moment selections freeze: the first bounce of the current round.
  // Derived from the same fixtures as roundStarted just above, so a countdown
  // drawn from this can never disagree with the lockout it is counting toward.
  const lockoutAt = firstFixtureDate(roundFixtures);
  const lockout = seasonComplete || isFinals || roundStarted;

  // Tipping round N is judged against the ladder as it stood after round N-1
  // (services/standings.js). If that snapshot has not been written yet,
  // getLadderForRound falls back to the most recent one it has - round N-2, a
  // full round out of date - and then switches to N-1 the moment the sync
  // catches up. Two members tipping an hour apart were held to different
  // ladders, and a selection legal when it was made could be illegal by the
  // time anyone looked at it.
  //
  // Snapshots are only written for completed rounds, so waiting for one is
  // also what makes "the round is over" mean the last siren rather than the
  // last bounce.
  // Gated on the round actually existing, not just on its number being in
  // range. A season with a gap in its round numbering would otherwise wait
  // forever for a snapshot of a round that was never played.
  const previousRound = currentRound === null ? null : currentRound - 1;
  const needsLadder = previousRound !== null && rounds.includes(previousRound);

  const previousRoundLastBounce = needsLadder
    ? [...fixtures]
        .filter((f) => f.round === previousRound && f.date)
        .map((f) => f.date)
        .sort((a, b) => b - a)[0] || null
    : null;

  // The same giving-up rule as roundInProgress: a ladder still missing a day
  // after the round ended is a sync that has stopped, and holding tipping shut
  // all week is the worse failure.
  const ladderOverdue = Boolean(
    previousRoundLastBounce && now - previousRoundLastBounce > STALE_AFTER_MS
  );

  // Whether the snapshot this round is supposed to be judged against exists.
  // Kept separate from ladderReady, which is also satisfied by simply giving
  // up - and giving up is precisely the case worth telling somebody about.
  const haveExpectedLadder = needsLadder
    ? (await db.Standing.countDocuments({
        year: season,
        round: previousRound,
        rank: { $ne: null },
      })) > 0
    : false;

  const ladderReady = !needsLadder || ladderOverdue || haveExpectedLadder;

  // Which ladder the round is actually being judged against, and whether it was
  // taken before its round had finished.
  //
  // Normally this is previousRound and there is nothing to say. When that
  // snapshot is missing, getLadderForRound falls back to an older one without
  // a word, and the top 8 it reports is not the one the round is being played
  // on - a tip the real ladder allows gets refused, naming a team that is in
  // the top 8. The page can only warn about that if it is told.
  //
  // Only queried when the expected snapshot is absent, so the normal path pays
  // nothing for it.
  let ladderRound = haveExpectedLadder ? previousRound : null;
  let ladderProvisional = false;

  if (needsLadder) {
    const rows = haveExpectedLadder
      ? await db.Standing.find({ year: season, round: previousRound })
          .select("provisional")
          .limit(1)
      : await standings.getLadderForRound(season, currentRound);

    if (rows.length) {
      ladderProvisional = Boolean(rows[0].provisional);
      if (!haveExpectedLadder) ladderRound = rows[0].round;
    }
  }

  // True when the round is being judged on something older than it should be,
  // and that is worth saying.
  //
  // Gated on the competition actually running. Squiggle stops reporting a rank
  // once the finals begin, so from then on there is no snapshot for the
  // previous round and this is permanently, uninterestingly true - a warning
  // about the top 8 on a page that has already said tipping is over for the
  // year. The condition it exists to report is a home-and-away round being
  // played against the wrong ladder.
  const ladderStale =
    needsLadder &&
    ladderRound !== previousRound &&
    !isFinals &&
    !homeAndAwayComplete &&
    !seasonComplete;

  const tippingOpen =
    !seasonComplete &&
    !isFinals &&
    !homeAndAwayComplete &&
    !lockout &&
    ladderReady;

  let message = null;
  if (seasonComplete) {
    message = `The ${season} season is over.`;
  } else if (isFinals || homeAndAwayComplete) {
    message =
      `The ${season} home-and-away season has finished. ` +
      `Twin Tips returns next season.`;
  } else if (lockout) {
    message = `Round ${currentRound} has started - selections are locked.`;
  } else if (!ladderReady) {
    message =
      `Round ${previousRound} has finished, but the ladder it sets has not ` +
      `been updated yet. Tipping for round ${currentRound} opens as soon as ` +
      `it is - your top 8 and bottom 10 are read from it.`;
  }

  return {
    season,
    hasFixtures: true,
    currentRound,
    roundName,
    isFinals,
    tippingOpen,
    // False only in the gap between a round finishing and its ladder snapshot
    // being written. Sent so the client can say why tipping is shut when the
    // next round has plainly not started - "Round 13 has started" would be a
    // lie, and silence would look like a bug.
    ladderReady,
    // Which round's ladder this round is judged on, whether that snapshot was
    // taken before its round finished, and whether it is older than it should
    // be. The tips page says so when it is - the split between the top 8 and
    // the bottom 10 is the rule of the competition, and being judged on last
    // fortnight's is not something to leave anyone to work out from a refusal.
    ladderRound,
    ladderProvisional,
    ladderStale,
    homeAndAwayComplete,
    seasonComplete,
    lockout,
    // Whether the round we are on has actually bounced.
    //
    // Not the same as lockout, which is this OR the season being over OR the
    // finals being on - so lockout stays true for the whole of September,
    // including the days between one finals week and the next, when nothing has
    // started. A page asking "is there football on right now" has to ask this.
    roundStarted,
    lockoutAt,
    // The server clock, sent so the client can correct for a device whose own
    // clock is wrong. Without it a phone running ten minutes fast shows time
    // remaining on a round the server has already locked - the tip is refused
    // and the app looks broken rather than the clock.
    serverTime: now,
    // Only ever true on a development machine - devClock refuses to start in
    // production. The client renders a banner off this, so nobody spends ten
    // minutes puzzled by a round that does not match the calendar.
    timeTravelling: devClock.isActive(),
    firstRound,
    lastHomeAndAwayRound,
    lastCompletedRound,
    roundNames,
    // Every round the season holds, finals included, so a results view can
    // offer them all rather than guessing at a range.
    rounds,
    message,
  };
};

// Which seasons the app holds data for, newest first - drives the leaderboard's
// season picker instead of a hardcoded list.
const getAvailableSeasons = async () => {
  const years = await db.Fixture.distinct("year");
  return years.filter((y) => Number.isInteger(y)).sort((a, b) => b - a);
};

module.exports = {
  firstFixtureDate,
  roundInProgress,
  getSeasonState,
  getAvailableSeasons,
  isFinalsRoundName,
  isFinalsFixture,
  forgetFixtures,
  FIXTURE_CACHE_MS,
};
