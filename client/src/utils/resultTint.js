// The three backgrounds a cell takes when it is saying something about a
// result, in one place because three different screens use them and the same
// colours written into three files is how three files end up with six.
//
// Named for the colour rather than a meaning, because the meaning is not the
// same in all three places and a name like GOOD would be wrong in one of them:
//
//   round results   green a tip that came off, red one that did not,
//                   blue a draw, which counts half a win
//   pool balances   green ahead on the money, red behind
//   fixture cards   green a team in the top eight, red one in the bottom ten -
//                   a category rather than a verdict, since which half of the
//                   ladder a side sits in is the thing being tipped on
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
export const tintBySign = (amount) => (amount > 0 ? GREEN : amount < 0 ? RED : "");
