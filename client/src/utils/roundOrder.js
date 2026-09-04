// The order a round's results should be read in.
//
// Rows arrive in the order Mongo stored them, which is the order people first
// tipped that round - so the winner landed wherever they happened to sit, and
// the gold on their row was the only way to find them. Sorted by what actually
// decided the round, the winner is simply the first row.

// How far off the margin was.
//
// Only one of the two games carries a margin, so whichever is set is the one
// that counts. Number.isFinite rather than `||`, because being exactly right is
// a difference of 0 and `||` reads that as absent - which would sort a perfect
// margin last instead of first.
export const marginError = (row) =>
  Number.isFinite(row.topEightDifference)
    ? row.topEightDifference
    : Number.isFinite(row.bottomTenDifference)
    ? row.bottomTenDifference
    : null;

// Most correct tips first, then the closest margin.
//
// Anything unscored sorts last rather than first: a round in progress has no
// result to rank, and a row with no tips counted should not lead a table of
// people who did. Sort is stable, so those keep the order they arrived in.
export const byResult = (a, b) => {
  const tips = (row) => (Number.isFinite(row.correctTips) ? row.correctTips : -1);
  if (tips(a) !== tips(b)) return tips(b) - tips(a);

  const am = marginError(a);
  const bm = marginError(b);
  if (am === null && bm === null) return 0;
  if (am === null) return 1;
  if (bm === null) return -1;
  return am - bm;
};
