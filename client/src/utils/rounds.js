// The rounds Twin Tips has anything to say about.
//
// From the season's first round - 0 where there is an Opening Round, which is
// why this is read from the data rather than assumed to start at 1 - up to
// whichever comes first: the round being played, or the last home-and-away
// round.
//
// That cap is the point. currentRound follows the AFL calendar, so once the
// home-and-away season ends it keeps going into the finals: on the dashboard
// that offered Round 25 and Round 26, rounds nobody tipped and nobody could,
// whose results table can only ever say there is nothing to show. Twin Tips
// stops when the home-and-away rounds do, and so should the list.
//
// Deliberately not the same list as the tips page's results view, which holds
// every round the season has including finals. Those are real games with real
// scores and worth looking at; it is only the tipping that stops.
export const twinTipsRounds = (seasonState) => {
  if (!seasonState) return [];

  const { firstRound, currentRound, lastHomeAndAwayRound } = seasonState;
  if (currentRound === null || currentRound === undefined) return [];

  const from = firstRound !== null && firstRound !== undefined ? firstRound : 1;

  // Only capped where there is a cap to apply. A season whose fixtures hold no
  // home-and-away rounds at all would otherwise produce an empty list rather
  // than falling back to the round we are on.
  const to =
    lastHomeAndAwayRound !== null && lastHomeAndAwayRound !== undefined
      ? Math.min(currentRound, lastHomeAndAwayRound)
      : currentRound;

  const rounds = [];
  for (let round = from; round <= to; round += 1) rounds.push(round);
  return rounds;
};

// The round a page should open on, held inside the list above.
//
// lastCompletedRound follows the AFL calendar like currentRound does, so once
// the finals start it names one of them - and a page that opens on a round the
// list no longer offers shows an empty picker with two dead arrows, because
// the value matches no item. Capping the list means capping what can be
// selected in it.
export const lastTwinTipsRound = (seasonState) => {
  const rounds = twinTipsRounds(seasonState);
  if (!rounds.length) return null;

  const { lastCompletedRound, currentRound } = seasonState;
  const wanted =
    lastCompletedRound !== null && lastCompletedRound !== undefined
      ? lastCompletedRound
      : currentRound;

  const last = rounds[rounds.length - 1];
  return wanted > last ? last : wanted;
};

// Squiggle names every round, and those names are what the app shows.
//
// Shortened only where the name will not fit. The round picker is 112px, sized
// to "Opening Round" at 109 - and "Preliminary Finals" needs 127, so it would
// ellipsise. This is a width fix, not a rewording: every other name is left
// exactly as the AFL puts it, and "Prelim Finals" is what anyone would say out
// loud anyway.
const ABBREVIATIONS = {
  "Preliminary Finals": "Prelim Finals",
};

// Falls back to numbering when there is no name to use - an older season
// stored before roundname was kept, or a season state that predates this. The
// fallback reproduces what Squiggle would have said for a home-and-away round,
// including "Opening Round" for round 0, which is Squiggle's own label rather
// than something we invented.
export const roundLabeller = (roundNames) => (round) => {
  const name = roundNames && roundNames[round];
  if (!name) return round === 0 ? "Opening Round" : `Round ${round}`;
  return ABBREVIATIONS[name] || name;
};

export default twinTipsRounds;

// The round the tips page opens on.
//
// Two reasons to open on the round we are on. Tipping being open is the
// obvious one: it is the round you came to tip. The round having bounced is
// the other, and it used to be missed - the page sat on last week's results
// while a game was on, which is the one time the current round is the
// interesting one.
//
// roundStarted rather than lockout, which is roundStarted OR the season being
// over OR the finals being on. Lockout stays true for the whole of September,
// so keying on it would open on next week's final - unplayed, 0-0 - on every
// day between one finals week and the next.
//
// Everything else is a results view, and opens on the last round actually
// played. That is what covers the gap after a round finishes while its ladder
// snapshot is still being written: currentRound has already rolled forward by
// then, and an unplayed round reading 0-0 in every game is not what someone
// who just watched the football came for.
//
// Falls back to currentRound when no round has been completed - the first
// round of a season has no last completed round to show.
export const defaultTipsRound = (seasonState) => {
  if (!seasonState) return undefined;

  const { tippingOpen, roundStarted, currentRound, lastCompletedRound } =
    seasonState;

  if (tippingOpen || roundStarted) return currentRound;

  return lastCompletedRound !== null && lastCompletedRound !== undefined
    ? lastCompletedRound
    : currentRound;
};
