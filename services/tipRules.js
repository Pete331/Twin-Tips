// The rules a tip has to satisfy, checked on the server.
//
// All of this was enforced in the browser only, by which teams got a checkbox
// and which were disabled. That is fine as a convenience and worthless as a
// rule: anything posting directly to /api/tips could pick a bottom-10 team as
// its top-8 selection, pick the same team twice, pick both sides of one game,
// or repeat last round's pick. Scoring would then read a tip it cannot make
// sense of.
//
// Deliberately pure. It takes plain data - the round's fixtures, the ladder as
// a Map, the previous round's tip - and returns a message or null. No database
// access, so the rules can be tested directly, which is the same reason
// services/results.js is shaped this way.

// Which teams are playing this round, and who each is playing. Built once
// rather than scanning the fixture list per question.
const teamsPlaying = (fixtures) => {
  const playing = new Map();

  (fixtures || []).forEach((game) => {
    // Finals fixtures exist before the sides are known and carry empty names.
    if (game.hteam) {
      playing.set(game.hteam, { id: game.hteamid, opponent: game.ateam });
    }
    if (game.ateam) {
      playing.set(game.ateam, { id: game.ateamid, opponent: game.hteam });
    }
  });

  return playing;
};

const rankOf = (ladder, teamId) => {
  const row = ladder && ladder.get ? ladder.get(teamId) : null;
  if (!row || row.rank === null || row.rank === undefined) return null;
  return Number(row.rank);
};

// Returns null when the tip is legal, or a message to send back.
//
// Order matters: each check assumes the ones above it have passed, and the
// messages are more useful the more specific the failure. "Adelaide is not in
// the top 8" beats "invalid selection".
const validateSelections = ({
  topEightSelection,
  bottomTenSelection,
  fixtures,
  ladder,
  previousTip,
}) => {
  if (topEightSelection === bottomTenSelection) {
    return "Pick two different teams.";
  }

  const playing = teamsPlaying(fixtures);

  const top = playing.get(topEightSelection);
  if (!top) return `${topEightSelection} is not playing this round.`;

  const bottom = playing.get(bottomTenSelection);
  if (!bottom) return `${bottomTenSelection} is not playing this round.`;

  // Both sides of one game means one of them is certain to lose, which is not
  // a tip. The browser clears both selections when it notices; the server has
  // to say so rather than storing it.
  if (top.opponent === bottomTenSelection) {
    return "Those two teams are playing each other. Pick from different games.";
  }

  const topRank = rankOf(ladder, top.id);
  const bottomRank = rankOf(ladder, bottom.id);

  // Without ranks there is no top 8 and no bottom 10 to check against. Refuse
  // rather than accept something unverifiable - the tips page shows the same
  // round as untippable for the same reason.
  if (topRank === null || bottomRank === null) {
    return "The ladder for this round is unavailable, so selections can't be checked.";
  }

  if (topRank > 8) {
    return `${topEightSelection} is not in the top 8.`;
  }

  if (bottomRank <= 8) {
    return `${bottomTenSelection} is not in the bottom 10.`;
  }

  // The rule reads "you can't pick the same team in consecutive rounds", and
  // it does not care which group the team was picked in last time.
  if (previousTip) {
    const used = [previousTip.topEightSelection, previousTip.bottomTenSelection];

    if (used.includes(topEightSelection)) {
      return `You picked ${topEightSelection} last round.`;
    }
    if (used.includes(bottomTenSelection)) {
      return `You picked ${bottomTenSelection} last round.`;
    }
  }

  return null;
};

module.exports = { validateSelections, teamsPlaying };
