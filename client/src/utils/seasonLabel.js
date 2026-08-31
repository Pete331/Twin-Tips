// Whether to name the round the AFL is up to, and what to say instead.
//
// Twin Tips is a home-and-away competition: you pick one team from the top 8
// and one from the bottom 10, and finals have neither. So once the last
// home-and-away round is played, Twin Tips is finished for the year - whatever
// the AFL calendar goes on to do.
//
// Naming the rounds that follow is worse than saying nothing. "2026 - Finals
// Week 1" reads as though the app were following the finals, invites the
// question of whether they can be tipped, and sat directly above a paragraph
// saying the season had finished and Twin Tips returns next year. One of those
// two was wrong and it was not the paragraph.
//
// homeAndAwayComplete is the right gate rather than seasonComplete: the latter
// only turns true once no fixture at all is left, which during September is a
// month after Twin Tips has finished. It is also implied by seasonComplete -
// if no fixture is in the future then no home-and-away fixture is either - so
// this one test covers both.
export const namesRound = (state) => Boolean(state) && !state.homeAndAwayComplete;

// Deliberately not "The 2026 season is over". The AFL season is not over while
// finals are being played, and claiming otherwise is the opposite mistake to
// the one above.
export const seasonOverLabel = (season) =>
  `The ${season} Twin Tips season is over`;
