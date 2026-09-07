// The line under a league's name saying what the selected round did there.
//
// It is the only place the home page can name a winner for a league. A round is
// won league by league - the same tips crown different people in two leagues,
// because a winner is decided among that league's members - and the table of
// everyone's tips below has no league to decide one within. It used to gild the
// site-wide winner instead, which is nobody's league winner in particular:
// round 23 of the real season crowned somebody who was not even a member of the
// league whose round it was.
//
// A string rather than a component, so the branching can be held to account
// without rendering the page around it.

import { describe, test, expect } from "vitest";

import { roundSummary, siteRoundSummary } from "./index";

// A weekly league that ran the round, with the reader third of five.
const detail = (over = {}) => ({
  league: "pool",
  name: "Twin Tips Original",
  type: "weekly",
  round: 23,
  status: "scored",
  startRound: 0,
  pays: true,
  buyIn: 15,
  entrants: 5,
  share: 5,
  winners: ["seeds"],
  standings: [],
  you: { status: "entered", rank: 3, tied: false, winnings: 0, joinedAtRound: 0 },
  ...over,
});

describe("a round the league actually ran", () => {
  test("who won it, and where you came", () => {
    expect(roundSummary(detail())).toBe("seeds won, you 3rd of 5");
  });

  // Winnings are stored in buy-in units - a pool of five entrants is a 5 - so
  // every figure has to be multiplied before it is shown.
  test("winning says so, as money rather than as units", () => {
    const line = roundSummary(
      detail({ winners: ["you"], you: { status: "entered", rank: 1, winnings: 5 } })
    );

    expect(line).toBe("you won, you 1st of 5, won $75");
    expect(line).not.toMatch(/won 5$/);
  });

  test("a different buy-in gives a different amount for the same pool", () => {
    expect(
      roundSummary(
        detail({
          buyIn: 10,
          entrants: 3,
          winners: ["ann"],
          you: { status: "entered", rank: 1, winnings: 3 },
        })
      )
    ).toBe("ann won, you 1st of 3, won $30");
  });

  // A weekly league always has a buy-in, but the detail is upserted and an
  // older league could be missing one. Better to say where they came than to
  // print "$NaN" beside it.
  test("no buy-in to multiply by says the place and nothing more", () => {
    expect(
      roundSummary(
        detail({
          buyIn: undefined,
          winners: ["you"],
          you: { status: "entered", rank: 1, winnings: 5 },
        })
      )
    ).toBe("you won, you 1st of 5");
  });

  test("a shared place reads as shared", () => {
    expect(
      roundSummary(detail({ you: { status: "entered", rank: 3, tied: true } }))
    ).toBe("seeds won, you equal 3rd of 5");
  });

  test("two winners are both named", () => {
    expect(roundSummary(detail({ winners: ["seeds", "dummyd"] }))).toBe(
      "seeds and dummyd won, you 3rd of 5"
    );
  });
});

// Missing a round is a free pass in this competition - nothing goes in, nothing
// can be won - so it must not read as having come last.
test("not entering is said plainly, not shown as a placing", () => {
  const line = roundSummary(
    detail({ you: { status: "noTip", rank: null, winnings: 0 } })
  );

  expect(line).toBe("seeds won, you did not enter");
  expect(line).not.toMatch(/of 5/);
});

describe("a round the league has nothing to say about", () => {
  // The league did not exist yet, or the round is one it never runs at all - a
  // finals round, in a home-and-away competition.
  test("a league that started later says when it started", () => {
    expect(
      roundSummary(detail({ status: "beforeLeague", startRound: 26, you: null }))
    ).toBe("This league started at round 26");
  });

  // A different thing from the league not existing, and the difference matters
  // to whoever is reading it.
  test("joining late says when you joined", () => {
    expect(
      roundSummary(
        detail({ you: { status: "beforeYou", joinedAtRound: 15, rank: null } })
      )
    ).toBe("You joined at round 15");
  });

  test("a round nobody entered is not a round anyone lost", () => {
    expect(
      roundSummary(
        detail({ status: "noEntries", entrants: 0, winners: [], you: { status: "noTip" } })
      )
    ).toBe("Nobody entered this round");
  });

  // No detail at all - the league request failed, or has not landed. The row
  // still has a standing to show, so it must not empty the table.
  test("no detail at all says nothing rather than breaking the row", () => {
    expect(roundSummary(undefined)).toBe(null);
    expect(roundSummary(null)).toBe(null);
  });
});

// A season league is one contest running all year. Its rounds have a best
// performance and no pool, so naming a winner would invent a payout.
describe("a season league", () => {
  const seasonLeague = (over) =>
    detail({
      name: "the oasis1",
      type: "season",
      pays: false,
      winners: [],
      share: 0,
      entrants: 2,
      standings: [
        { username: "ann", rank: 1 },
        { username: "bob", rank: 2 },
      ],
      you: { status: "entered", rank: 2, winnings: 0 },
      ...over,
    });

  test("reports who led, not who won", () => {
    const line = roundSummary(seasonLeague());

    expect(line).toBe("ann led, you 2nd of 2");
    expect(line).not.toMatch(/won/);
  });

  test("joint leaders are both named", () => {
    expect(
      roundSummary(
        seasonLeague({
          standings: [
            { username: "ann", rank: 1 },
            { username: "bob", rank: 1 },
          ],
          you: { status: "entered", rank: 1, tied: true },
        })
      )
    ).toBe("ann and bob led, you equal 1st of 2");
  });
});

// The Overall Site Ladder row, which has no league and so no league detail.
// Worked out from the round's own tips, which the page already holds for the
// table below it.
describe("the site-wide round", () => {
  const row = (username, winnings, id) => ({
    user: id,
    winnings,
    userDetail: [{ username }],
  });

  // Already in finishing order: this is the list the tips table is drawn from,
  // sorted by how the round was decided.
  const results = [row("ann", 6, "u1"), row("bob", 0, "u2"), row("cat", 0, "u3")];

  test("names the site winner and where you came", () => {
    expect(siteRoundSummary(results, "u2")).toBe("ann won, you 2nd of 3");
  });

  test("somebody who did not tip is not placed in it", () => {
    expect(siteRoundSummary(results, "nobody")).toBe("ann won, you did not enter");
  });

  test("a round nobody entered says so", () => {
    expect(siteRoundSummary([], "u1")).toBe("Nobody entered this round");
    expect(siteRoundSummary(undefined, "u1")).toBe("Nobody entered this round");
  });

  // Scoring splits a round between everyone level at the top.
  test("two winners are both named", () => {
    const shared = [row("ann", 3, "u1"), row("bob", 3, "u2"), row("cat", 0, "u3")];
    expect(siteRoundSummary(shared, "u3")).toBe("ann and bob won, you 3rd of 3");
  });

  // A round with no result yet - nobody has been paid. The placing still holds.
  test("no winner yet still says where you came", () => {
    const unscored = [row("ann", 0, "u1"), row("bob", 0, "u2")];
    expect(siteRoundSummary(unscored, "u1")).toBe("you 1st of 2");
  });
});
