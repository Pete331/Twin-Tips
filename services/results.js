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

// Scoring, unchanged from the original: a correct tip scores the distance
// between the real margin and the predicted one, a wrong tip is penalised by
// their sum.
const scoreSelection = (selection, predictedMargin, games) => {
  if (!selection) return { correct: null, difference: null };

  const game = games.find(
    (g) => g.hteam === selection || g.ateam === selection
  );
  if (!game) return { correct: null, difference: null };

  const margin = Math.abs(Number(game.hscore) - Number(game.ascore));
  const predicted = Number(predictedMargin) || 0;

  // A draw has no winner, and counts against whoever picked either side.
  if (!game.winner) {
    return {
      correct: false,
      difference: predicted ? margin + predicted : null,
    };
  }

  const correct = game.winner === selection;
  if (!predicted) return { correct, difference: null };

  return {
    correct,
    difference: correct
      ? Math.abs(margin - predicted)
      : margin + predicted,
  };
};

// The margin that actually counts for a tip. Exactly one of the two selections
// carries a prediction, so use that one's difference rather than picking
// whichever value happens to be truthy.
const marginDifference = (tip) => {
  const onTopEight = Number(tip.marginTopEight) > 0;
  const difference = onTopEight
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

  return {
    topEightCorrect: top.correct,
    bottomTenCorrect: bottom.correct,
    topEightDifference: top.difference,
    bottomTenDifference: bottom.difference,
    correctTips: (top.correct ? 1 : 0) + (bottom.correct ? 1 : 0),
  };
};

// The round goes to whoever got the most tips right, and among those, to the
// closest margin. Everyone on the same footing splits it.
const pickWinners = (scored) => {
  if (!scored.length) return [];

  const best = Math.max(...scored.map((s) => s.correctTips));
  const contenders = scored.filter((s) => s.correctTips === best);

  const withMargin = contenders
    .map((s) => ({ ...s, margin: marginDifference(s) }))
    .filter((s) => s.margin !== null);

  // Nobody predicted a margin, so the tip count alone decides it.
  if (!withMargin.length) return contenders.map((s) => s.user);

  const closest = Math.min(...withMargin.map((s) => s.margin));
  return withMargin.filter((s) => s.margin === closest).map((s) => s.user);
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
            winnings: winners.includes(s.user) ? winnings : 0,
          },
        }
      )
    )
  );

  return { year, round, scored: scored.length, winners, winnings, complete: true };
};

// Scores every completed round of a season. Safe to re-run: scoring is derived
// entirely from fixtures and tips, so it lands on the same answer each time.
const calculateSeason = async (year) => {
  const rounds = await db.Fixture.distinct("round", { year });
  rounds.sort((a, b) => a - b);

  const results = [];
  for (const round of rounds) {
    const result = await calculateRound(year, round);
    if (result.complete && result.scored) results.push(result);
  }

  return {
    year,
    rounds: results.length,
    scored: results.reduce((n, r) => n + r.scored, 0),
  };
};

module.exports = {
  calculateRound,
  calculateSeason,
  scoreTip,
  scoreSelection,
  pickWinners,
  marginDifference,
};
