// The three backgrounds a cell takes when it is saying something about a
// result, in one place because more than one screen uses them and the same
// colours written into several files is how those files end up with twice as
// many.
//
// Named for the colour rather than a meaning, because the meaning is not quite
// the same in the two places and a name like GOOD would be wrong in one of them:
//
//   round results   green a tip that came off, red one that did not,
//                   blue a draw, which counts half a win
//   pool balances   green ahead on the money, red behind
//
// The fixture cards used green and red for the two halves of the ladder too,
// so a bottom-ten side sat on the colour of a wrong answer. The halves have
// their own pair now, in utils/ladderHalves (UX audit finding #27).
//
// What is shared is the palette, so that is what this exports.
//
// Tints rather than the saturated fills they replace, and not for contrast:
// the leaderboard's #50c878 and #FF4D4D measured 7.6:1 and 4.9:1 against the
// text, so both already cleared AA. It is about weight. A table where a third
// of the cells are fully saturated reads as a warning rather than a result, and
// the fill ends up louder than the figure it describes. These sit near 14:1 and
// stay behind the text instead of competing with it.
//
// Opaque, deliberately. Several of the fills these replace carried alpha, and
// on the round results that let the gold on a winner's row show through - so
// green and red became a darker green and an orange, and the person who won
// the round got the two colours nobody else had. Nothing here composites with
// anything.
export const GREEN = "#e8f5e9";
export const BLUE = "#e8f0f8";
export const RED = "#fdecea";

// A signed number as a background: ahead, behind, or nothing.
//
// Zero takes no fill rather than the blue. Somebody who has not entered a round
// is not level on the money, they are simply absent from it, and a colour would
// say they had a result.
export const tintBySign = (amount) =>
  amount > 0 ? GREEN : amount < 0 ? RED : "";
