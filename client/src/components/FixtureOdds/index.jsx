import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { formatPrice, priceDetail, freshness } from "../../utils/odds";

// One side's price, beside the prediction on a fixture card.
//
// The best price on the board and who is offering it. The average, the spread
// and how many books it is across sit behind it rather than on the card: this
// column is about a sixth of half a fixture row, which is roughly 60px on a
// desktop and less on a phone, and two numbers side by side there would be
// unreadable in both places.
//
// These are prices, not predictions. Squiggle's percentage between them is a
// model's opinion; this is what someone will actually pay you. Nothing here
// feeds tipping, scoring or the ladder.

// Whether to print the bookmaker's name on the card.
//
// One switch, deliberately, because it may have to be turned off. The
// Interactive Gambling Amendment (Gambling Reform) Bill 2026 takes effect on
// 1 January 2027 and restricts gambling advertising; whether naming a
// bookmaker beside a price counts is a question for someone qualified, not for
// this file. Storing the name is unaffected either way - it is already in the
// database, and turning this off changes only what is drawn.
const NAME_THE_BOOKMAKER = true;

const FixtureOdds = ({ side, fetchedAt, teamName, align = "center" }) => {
  const price = formatPrice(side?.best);

  // Nothing at all where there is no price - not a dash, not a zero, not an
  // empty box holding space open. A round the books have not opened yet should
  // look like a card without odds, which is what it is.
  if (!price) return null;

  const detail = priceDetail(side);
  const seen = freshness(fetchedAt);

  const tooltip = [
    teamName ? `${teamName} to win` : null,
    detail,
    // Named here rather than only on the card, so the source is available even
    // when the card itself is not printing it.
    side.bookmaker ? `Best with ${side.bookmaker}` : null,
    seen ? `Prices seen ${seen}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Tooltip title={tooltip} enterTouchDelay={0} arrow>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: align,
          lineHeight: 1.1,
          // The tooltip is the only way to the detail, so it has to be
          // reachable without a mouse.
          cursor: "help",
        }}
      >
        <Typography
          variant="body2"
          component="span"
          sx={{
            fontWeight: 600,
            // Prices sit at either end of a row and are read against each
            // other. Lining figures keep the two columns the same width
            // whatever the digits are.
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {price}
        </Typography>

        {NAME_THE_BOOKMAKER && side.bookmaker ? (
          <Typography
            variant="caption"
            component="span"
            sx={{
              color: "text.secondary",
              // Bookmaker names run long - "Neds", but also "TABtouch" and
              // "PointsBet". Below sm there is no room for any of them beside
              // a price, so the name drops and the tooltip carries it.
              display: { xs: "none", sm: "block" },
              fontSize: "0.65rem",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {side.bookmaker}
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
};

export default FixtureOdds;
