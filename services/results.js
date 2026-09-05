// Scores a round's tips and works out who won it.
//
// This used to run in the browser (client/src/utils/roundResultCalc.js),
// triggered from the dashboard on every load, and wrote results for every user
// in the competition. Three things were wrong with that beyond it being a
// privileged write driven by whoever happened to visit:
//
//   - It fired the per-user writes without awaiting them and then immediately
//     re-read the round to pick a winner, so the winner could be decided from
//     data that had not landed yet.
//   - It compared margins with `topEightDifference || bottomTenDifference`.
//     A difference of 0 - an exact margin prediction, the best possible - is
//     falsy, so the strongest tip in the round was discarded.
//   - Nothing was scoped by season. Tips, results and winnings all keyed on
//     user and round alone, so scoring round 5 of one season would overwrite
//     round 5 of another.

const db = require("../models");

// What a selection is worth. null is distinct from zero: it means there is
// nothing to score yet - no selection, or no game found for it - where zero
// means the pick lost.
const WIN = 1;
const DRAW = 0.5;
const LOSS = 0;

// Scoring: a correct tip scores the distance between the real margin and the
// predicted one, a wrong tip is penalised by their sum.
//
// The draw used to score nothing. The rules have always said a drawn match is
// half a win - "1 win and a draw will always beat 1 win" - and the code did
// not implement it, so a round with a draw in it could go to the wrong
// tipster. AFL draws are rare enough that this may never have decided one, but
// rare is not never.
const scoreSelection = (selection, predictedMargin, games) => {
  if (!selection) return { points: null, difference: null };

  const game = games.find(
    (g) => g.hteam === selection || g.ateam === selection
  );
  if (!game) return { points: null, difference: null };

  const margin = Math.abs(Number(game.hscore) - Number(game.ascore));
  const predicted = Number(predictedMargin) || 0;

  // Half a win to whoever picked either side. The margin in a drawn game is 0,
  // so margin + predicted and |margin - predicted| come to the same number
  // here: how far the prediction was from the nothing that happened.
  if (!game.winner) {
    return {
      points: DRAW,
      difference: predicted ? margin + predicted : null,
    };
  }

  const won = game.winner === selection;
  const points = won ? WIN : LOSS;
  if (!predicted) return { points, difference: null };

  return {
    points,
    difference: won ? Math.abs(margin - predicted) : margin + predicted,
  };
};

// Which of the two selections the tipster put their margin on.
//
// Zero is deliberately not a prediction: the tips page treats 0 and "0" as an
// empty field and refuses to submit when both are, POST /api/tips enforces the
// same rule, and this is the test that reads it back. A margin of zero would
// mean predicting a draw, which the competition does not offer.
//
// The consequence to keep in mind when changing this: if both fields somehow
// carry a margin, the top-eight one wins and the other is ignored.
const marginIsOn = (margin) => Number(margin) > 0;

// The margin that actually counts for a tip.
//
// Computed inside scoreTip rather than read off the result afterwards: doing it
// afterwards needs marginTopEight, and a caller that forgets to carry that
// field through silently gets bottomTenDifference for everyone - which drops
// every tipster who put their margin on the top-8 pick out of contention.
const marginDifference = (tip) => {
  const difference = marginIsOn(tip.marginTopEight)
    ? tip.topEightDifference
    : tip.bottomTenDifference;
  return difference === null || difference === undefined ? null : difference;
};

const scoreTip = (tip, games) => {
  const top = scoreSelection(tip.topEightSelection, tip.marginTopEight, games);
  const bottom = scoreSelection(
    tip.bottomTenSelection,
    tip.marginBottomTen,
    games
  );

  // Same helper the exported marginDifference uses, so the rule for which
  // selection carries the margin has one definition. It was written out twice,
  // and this is the exact rule whose earlier mishandling sent round 19 to the
  // wrong tipster - two copies is how that comes back looking reviewed.
  const counted = marginIsOn(tip.marginTopEight)
    ? top.difference
    : bottom.difference;

  return {
    // 1, 0.5 or 0 rather than true/false, so a draw can be worth half. Still
    // null where there is nothing to score, which the dashboard relies on to
    // leave a cell uncoloured rather than marking it wrong.
    topEightCorrect: top.points,
    bottomTenCorrect: bottom.points,
    topEightDifference: top.difference,
    bottomTenDifference: bottom.difference,
    // null contributes nothing, the same as it did when these were booleans.
    correctTips: (top.points || 0) + (bottom.points || 0),
    // The difference the round is decided on.
    countedDifference: counted === undefined ? null : counted,
  };
};

// The round goes to whoever got the most tips right, and among those, to the
// closest margin. Everyone on the same footing splits it.
const pickWinners = (scored) => {
  if (!scored.length) return [];

  const best = Math.max(...scored.map((s) => s.correctTips));
  const contenders = scored.filter((s) => s.correctTips === best);

  // countedDifference comes from scoreTip, which knows which selection the
  // margin was put on.
  const withMargin = contenders.filter(
    (s) => s.countedDifference !== null && s.countedDifference !== undefined
  );

  // Nobody predicted a margin, so the tip count alone decides it.
  if (!withMargin.length) return contenders.map((s) => s.user);

  const closest = Math.min(...withMargin.map((s) => s.countedDifference));
  return withMargin
    .filter((s) => s.countedDifference === closest)
    .map((s) => s.user);
};

// A round can only be scored once every game in it has been played.
const isRoundComplete = (games) =>
  games.length > 0 && games.every((g) => Number(g.complete) === 100);

const calculateRound = async (year, round) => {
  const games = await db.Fixture.find({ year, round });
  if (!isRoundComplete(games)) {
    return { year, round, scored: 0, winners: [], complete: false };
  }

  const tips = await db.Tip.find({ round, season: year });
  if (!tips.length) {
    return { year, round, scored: 0, winners: [], complete: true };
  }

  const scored = tips.map((tip) => ({
    user: tip.user,
    ...scoreTip(tip, games),
  }));

  const winners = pickWinners(scored);
  // Entrants split between them, matching the original payout.
  const winnings = winners.length ? tips.length / winners.length : 0;

  // Compared as strings, not with includes(). A tip's user is an ObjectId, and
  // two ObjectId instances for the same id are never ===, so includes() would
  // match nobody and every round would pay out zero. It worked only while the
  // field was stored as a string, and the tests below use string users - so
  // they would have kept passing while production quietly stopped paying.
  const won = new Set(winners.map(String));

  // Awaited, unlike the version this replaces, so the winnings below are never
  // written against half-applied scores.
  await Promise.all(
    scored.map((s) =>
      db.Tip.updateOne(
        { user: s.user, round, season: year },
        {
          $set: {
            topEightCorrect: s.topEightCorrect,
            bottomTenCorrect: s.bottomTenCorrect,
            topEightDifference: s.topEightDifference,
            bottomTenDifference: s.bottomTenDifference,
            correctTips: s.correctTips,
            winnings: won.has(String(s.user)) ? winnings : 0,
          },
        }
      )
    )
  );

  return { year, round, scored: scored.length, winners, winnings, complete: true };
};

// How far back a routine re-score reaches.
//
// This runs hourly all year, and re-scoring the whole season each time means
// the rounds played in March are recomputed a few thousand times before
// September, to the same answer every time, because nothing about them changes.
// Measured on a real season: 25 rounds and 126 writes an hour, growing with
// players times rounds.
//
// Four rounds is about a month, which is far longer than a result stays open to
// correction - Squiggle publishes a final score within hours of the siren, and
// nobody revisits one weeks later. Recent rounds keep being re-scored, so a
// correction still lands; that is the behaviour worth protecting and it has a
// test.
const RESCORE_RECENT_ROUNDS = 4;

// Scores the completed rounds of a season. Safe to re-run: scoring is derived
// entirely from fixtures and tips, so it lands on the same answer each time.
//
// Bounded rather than exhaustive, but never at the cost of leaving a round
// unscored - which is what the two conditions below are for.
const calculateSeason = async (
  year,
  { recentRounds = RESCORE_RECENT_ROUNDS } = {}
) => {
  const rounds = await db.Fixture.distinct("round", { year });
  rounds.sort((a, b) => a - b);

  // What "recent" counts back from: the latest round with any football played
  // in it, not the last one on the calendar. In March the calendar runs to
  // round 30, so counting back from there would step over every round actually
  // being played.
  const played = await db.Fixture.distinct("round", { year, complete: 100 });
  const latest = played.length ? Math.max(...played) : null;
  const from = latest === null ? -Infinity : latest - recentRounds;

  // Rounds holding a tip that has never been scored. The window must not hide
  // one of these: if the sync were broken for a month, the rounds it missed
  // have to be picked up whenever it comes back, however old they are by then -
  // and those are precisely the rounds a window would step over.
  const unscored = new Set(
    await db.Tip.distinct("round", {
      season: year,
      correctTips: { $exists: false },
    })
  );

  const results = [];
  let skipped = 0;

  for (const round of rounds) {
    if (round < from && !unscored.has(round)) {
      skipped += 1;
      continue;
    }

    const result = await calculateRound(year, round);
    if (result.complete && result.scored) results.push(result);
  }

  return {
    year,
    rounds: results.length,
    scored: results.reduce((n, r) => n + r.scored, 0),
    skipped,
  };
};

module.exports = {
  calculateRound,
  calculateSeason,
  scoreTip,
  scoreSelection,
  pickWinners,
  marginDifference,
  // Exported so the league scoring in leagueRounds.js reaches back the same
  // distance rather than keeping a second copy of the number. Both halves run
  // in the same hourly job; there is no reason for them to disagree.
  RESCORE_RECENT_ROUNDS,
};
