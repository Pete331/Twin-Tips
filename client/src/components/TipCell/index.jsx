// One selection in a results table: the team, the margin if it was put on this
// one, and whether it came off.
//
// Shared because two tables now show the same thing - the round results on the
// dashboard and a league's round on the leaderboard - and the note in
// utils/resultTint applies to the whole cell rather than only its colour: the
// same rendering written into two files is how two files end up disagreeing.

import Box from "@mui/material/Box";
import TableCell from "@mui/material/TableCell";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import { visuallyHidden } from "@mui/utils";
import { GREEN, BLUE, RED } from "../../utils/resultTint";

// What a selection scored, as a background. 1 is a win, 0.5 a draw, 0 a loss;
// null is a game not yet played and stays uncoloured.
//
// These were booleans until draws began counting half a win, so the checks were
// === true and === false.
export const selectionTint = (points) =>
  points === 1 ? GREEN : points === 0.5 ? BLUE : points === 0 ? RED : "";

// The same three states as a shape, because colour on its own does not carry
// this. Red against green is the pair most people with colour blindness cannot
// separate, and it was the only thing saying whether a tip came off. A tick, a
// cross and a dash say it without the colour, and the hidden word says it to a
// screen reader - which until then was read the team name and nothing else.
export const SelectionMark = ({ points }) => {
  if (points !== 1 && points !== 0.5 && points !== 0) return null;

  const [Icon, colour, word] =
    points === 1
      ? [CheckCircleIcon, "success.main", "Correct"]
      : points === 0.5
        ? [RemoveCircleIcon, "info.main", "Draw"]
        : [CancelIcon, "error.main", "Incorrect"];

  return (
    <>
      <Icon sx={{ fontSize: 16, color: colour, flex: "0 0 auto" }} />
      <Box component="span" sx={visuallyHidden}>
        {word}
      </Box>
    </>
  );
};

// The margin is shown against whichever selection it was put on, and only one
// of the two ever carries it - the tips page enforces that, and POST /api/tips
// enforces it again. Zero is not a margin: a margin of zero would be predicting
// a draw, which the competition does not offer, so it reads as no prediction.
const TipCell = ({ team, margin, points }) => (
  <TableCell
    align="right"
    style={{
      borderLeft: "1px solid lightGrey",
      paddingLeft: "5px",
      paddingRight: "5px",
      backgroundColor: selectionTint(points),
    }}
  >
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 0.75,
      }}
    >
      <span>
        {team || "-"} {margin ? "(" + margin + ")" : ""}
      </span>
      <SelectionMark points={points} />
    </Box>
  </TableCell>
);

export default TipCell;
