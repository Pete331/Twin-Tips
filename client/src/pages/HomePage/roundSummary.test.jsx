// What the round column says about one league.
//
// It is the only place the home page can name a winner for a league. A round is
// won league by league - the same tips crown different people in two leagues,
// because a winner is decided among that league's members - and the table of
// everyone's tips below has no league to decide one within. It used to gild the
// site-wide winner instead, which is nobody's league winner in particular:
// round 23 of the real season crowned somebody who was not even a member of the
// league whose round it was.
//
// Two labelled lines rather than a sentence, because the column is 142px wide
// and a sentence wrapped wherever it ran out - "samples won, you 3rd" then
// "of 5", with the count orphaned from its number.
//
// A note instead, where the league has nothing to say: those are sentences
// rather than pairs of facts, and there is no label that would help.

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

// The pairs, as "Label: value", which is how they read on the page.
const linesOf = (summary) =>
  (summary.lines || []).map(({ label, value }) => `${label}: ${value}`);

describe("a round the league actually ran", () => {
  test("who won it, and where you came", () => {
    expect(linesOf(roundSummary(detail()))).toEqual([
      "Winner: seeds",
      "You: 3rd of 5",
    ]);
  });

  // Winning is first by definition, so the amount is the thing worth the
  // second line - and it carries the pool size anyway, since $75 at a $15
  // buy-in can only be five entrants.
  test("winning names you and the amount", () => {
    expect(
      linesOf(
        roundSummary(
          detail({ winners: ["you"], you: { status: "entered", rank: 1, winnings: 5 } })
        )
      )
    ).toEqual(["Winner: You!", "Winnings: $75"]);
  });

  // Winnings are stored in buy-in units, so every figure is a multiplication.
  test("a different buy-in gives a different amount for the same pool", () => {
    expect(
      linesOf(
        roundSummary(
          detail({
            buyIn: 10,
            entrants: 3,
            winners: ["you"],
            you: { status: "entered", rank: 1, winnings: 3 },
          })
        )
      )
    ).toEqual(["Winner: You!", "Winnings: $30"]);
  });

  test("a shared place is marked", () => {
    expect(
      linesOf(roundSummary(detail({ you: { status: "entered", rank: 3, tied: true } })))
    ).toContain("You: =3rd of 5");
  });

  test("two winners are both named", () => {
    expect(linesOf(roundSummary(detail({ winners: ["seeds", "dummyd"] })))).toContain(
      "Winner: seeds and dummyd"
    );
  });
});

// Missing a round is a free pass in this competition - nothing goes in, nothing
// can be won - so it must not read as having come last.
test("not entering is said, not shown as a placing", () => {
  const lines = linesOf(
    roundSummary(detail({ you: { status: "noTip", rank: null, winnings: 0 } }))
  );

  expect(lines).toEqual(["Winner: seeds", "You: did not enter"]);
  expect(lines.join(" ")).not.toMatch(/of 5/);
});

describe("a round the league has nothing to say about", () => {
  // The league did not exist yet, or the round is one it never runs at all - a
  // finals round, in a home-and-away competition.
  test("a league that started later says when it started", () => {
    expect(
      roundSummary(detail({ status: "beforeLeague", startRound: 26, you: null })).note
    ).toBe("This league started at round 26");
  });

  // A different thing from the league not existing, and the difference matters
  // to whoever is reading it.
  test("joining late says when you joined", () => {
    expect(
      roundSummary(
        detail({ you: { status: "beforeYou", joinedAtRound: 15, rank: null } })
      ).note
    ).toBe("You joined at round 15");
  });

  test("a round nobody entered is not a round anyone lost", () => {
    expect(
      roundSummary(
        detail({ status: "noEntries", entrants: 0, winners: [], you: { status: "noTip" } })
      ).note
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
// performance and no pool, so naming a winner would imply a payout - and
// "Round winner: samples" measures 145px against 142px of column anyway.
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

  test("says who was best, not who won", () => {
    const lines = linesOf(roundSummary(seasonLeague()));

    expect(lines).toEqual(["Best: ann", "You: 2nd of 2"]);
    expect(lines.join(" ")).not.toMatch(/Winner|won/);
  });

  test("joint best are both named", () => {
    expect(
      linesOf(
        roundSummary(
          seasonLeague({
            standings: [
              { username: "ann", rank: 1 },
              { username: "bob", rank: 1 },
            ],
            you: { status: "entered", rank: 1, tied: true },
          })
        )
      )
    ).toEqual(["Best: ann and bob", "You: =1st of 2"]);
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
    expect(linesOf(siteRoundSummary(results, "u2"))).toEqual([
      "Winner: ann",
      "You: 2nd of 3",
    ]);
  });

  // There is a site-wide pool, so this row does say winner.
  test("winning it names you", () => {
    expect(linesOf(siteRoundSummary(results, "u1"))).toEqual([
      "Winner: You!",
      "You: 1st of 3",
    ]);
  });

  test("somebody who did not tip is not placed in it", () => {
    expect(linesOf(siteRoundSummary(results, "nobody"))).toEqual([
      "Winner: ann",
      "You: did not enter",
    ]);
  });

  test("a round nobody entered says so", () => {
    expect(siteRoundSummary([], "u1").note).toBe("Nobody entered this round");
    expect(siteRoundSummary(undefined, "u1").note).toBe("Nobody entered this round");
  });

  test("two winners are both named", () => {
    const shared = [row("ann", 3, "u1"), row("bob", 3, "u2"), row("cat", 0, "u3")];
    expect(linesOf(siteRoundSummary(shared, "u3"))).toEqual([
      "Winner: ann and bob",
      "You: 3rd of 3",
    ]);
  });

  // A round with no result yet - nobody has been paid. The placing still holds.
  test("no winner yet still says where you came", () => {
    const unscored = [row("ann", 0, "u1"), row("bob", 0, "u2")];
    expect(linesOf(siteRoundSummary(unscored, "u1"))).toEqual(["You: 1st of 2"]);
  });
});
