import Typography from "@mui/material/Typography";

// One line under a table saying what its numbers are.
//
// The tables print "2 (4)", "Brisbane Lions (39)", "14.5 (517)" and "$100"
// with nothing to say that the half is a draw, that one bracket is the margin
// tipped and the other how far it missed, or that $100 is the pool won rather
// than profit (UX audit finding #13). A key under each says so where the
// numbers are, rather than on a Rules page nobody opens mid-round.
//
// Caption-sized and grey: it is read once and then known, so it should not
// compete with the table for the eye.
const TableKey = ({ children }) => (
  <Typography
    variant="caption"
    component="p"
    sx={{ display: "block", mt: 1, color: "text.secondary" }}
  >
    {children}
  </Typography>
);

export default TableKey;

// What the round tables' figures mean, worded once for both pages that draw
// a round - the leaderboard and Home - so the two cannot drift.
//
// Worded by the figures rather than the column names, because the phone
// layout of the leaderboard's round table puts them under different headings.
export const ROUND_KEY =
  "A number beside a team is the margin tipped on it. Beside the correct tips - a draw is ½ - is how far that margin missed, which splits a tie.";

// Only where a round pays.
export const WON_KEY =
  "Money is the share of the round's pool won, before their own buy-in.";

// A season ladder's totals: the site ladder and a Season Ladder league.
export const SEASON_KEY =
  "Correct tips across the season - a draw is ½ - and, in brackets, every round's margin miss added up, which splits a tie.";

// A Round Pool league's season: money in, money out.
export const MONEY_KEY =
  "Winnings are the pools won, in full. Balance is winnings less what was paid in.";

// The same, once the season is over and the balances are what is owed.
export const SETTLE_KEY =
  "Winnings are the pools won, in full. Settle up is winnings less what was paid in: who owes, and who is owed.";
