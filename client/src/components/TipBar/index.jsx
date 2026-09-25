// The tip being entered, pinned to the foot of the screen while the round's
// games scroll past above it.
//
// Picks are made on the fixture cards. What you had picked, both margins and
// Submit used to sit below the last of nine cards - on a phone a long scroll
// from where you picked, with nothing on screen saying what you had chosen in
// between (review finding #14). Now they travel with you.
//
// Sticky rather than fixed. It stays in view while the games are on screen and
// settles at the end of the page once they are not, so it never covers the
// last card. On a phone it sits on top of the bottom navigation, which is
// fixed there; from sm up there is none and it sits on the edge. That only
// works because nothing above it sets overflow - see the note in App.
//
// Two margin fields, one per pick, as before rather than one field and a
// choice of where it goes: typing in one clears the other, which is the rule
// ("a margin on one of them, not both") and what people already know.

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { BOTTOM_NAV_HEIGHT } from "../BottomNav";

// Which pick is which: the words, and the colours the page's instructions use
// for them ("Top 8 (green)... Bottom 10 (red)").
const Pick = ({ label, colour, team }) => (
  <Box sx={{ borderLeft: 4, borderColor: colour, pl: 1, minWidth: 0 }}>
    <Typography
      variant="caption"
      component="div"
      sx={{ color: "text.secondary", lineHeight: 1.2 }}
    >
      {label}
    </Typography>
    {/* Wraps rather than truncating. At 375px this column is about 145px,
        which "Western Bulldogs" fills and "Greater Western Sydney" does not
        fit - and a pick you cannot read in full is the one thing this bar is
        for. A second line costs a few pixels of height. */}
    <Typography
      variant="body2"
      component="div"
      sx={{
        fontWeight: team ? 600 : 400,
        color: team ? "text.primary" : "text.secondary",
        lineHeight: 1.25,
      }}
    >
      {team || "Pick a team"}
    </Typography>
  </Box>
);

// Both are labelled "Margin", so each is named for the pick it belongs to - and
// for the team once there is one.
const MarginField = ({ id, value, onChange, name }) => (
  <TextField
    id={id}
    label="Margin"
    size="small"
    type="number"
    value={value || ""}
    onChange={onChange}
    slotProps={{
      // Always on the border, as it is once a number is in. Resting inside an
      // empty field this narrow it was cut to "Mar...", and the two fields
      // looked different for no reason but which one held the margin.
      inputLabel: { shrink: true },
      htmlInput: {
        min: 0,
        max: 200,
        // A phone's number pad rather than its full keyboard.
        inputMode: "numeric",
        style: { textAlign: "center" },
        "aria-label": name,
      },
    }}
    // Three digits at most, and the label fits in this. Every pixel spared
    // here goes to the team names beside it.
    sx={{ width: 68 }}
  />
);

// Where the tip stands, in one line above the picks: in, changed but not
// saved, or not in at all - with when it can still be changed.
//
// The bar showed your picks whether or not they were saved, and nothing said
// which: change one and it read exactly as a saved tip did, so a change could
// be walked away from unsaved (UX audit finding #6).
const tipStatus = ({ saved, changed, closes }) => {
  if (changed) {
    return {
      text: "Not saved yet - press Update tips to keep these changes",
      colour: "warning.dark",
    };
  }
  if (saved) {
    return {
      text: `Your tip is in${closes ? ` · you can change it until ${closes}` : ""}`,
      colour: "success.dark",
    };
  }
  return {
    text: `Not tipped yet${closes ? ` · tips close ${closes}` : ""}`,
    colour: "text.secondary",
  };
};

const TipBar = ({
  topEightSelection,
  bottomTenSelection,
  marginTopEight,
  marginBottomTen,
  onChangeTopEight,
  onChangeBottomTen,
  onSubmit,
  saved = false,
  changed = false,
  closes = "",
}) => {
  const status = tipStatus({ saved, changed, closes });

  return (
    <Box
      component="section"
      aria-label="Your tips"
      sx={{
        position: "sticky",
        bottom: {
          xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
          sm: 0,
        },
        // Over the cards scrolling beneath it; under the app bar, menus and the
        // alerts, which are all far higher.
        zIndex: 2,
        mt: 2,
        p: 1.5,
        bgcolor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        // Cast upwards, since what it floats over is above it.
        boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.15)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto",
        columnGap: 1,
        rowGap: 1.5,
        alignItems: "center",
      }}
    >
      {/* Polite, so a screen reader hears "Not saved yet" when a pick changes
        without being interrupted mid-sentence. */}
      <Typography
        variant="body2"
        role="status"
        sx={{
          gridColumn: "1 / -1",
          gridRow: 1,
          color: status.colour,
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {status.text}
      </Typography>
      <Pick label="Top 8" colour="success.main" team={topEightSelection} />
      <MarginField
        id="top8input"
        value={marginTopEight}
        onChange={onChangeTopEight}
        name={
          topEightSelection
            ? `Margin for ${topEightSelection}`
            : "Margin for your top 8 tip"
        }
      />
      <Button
        variant="contained"
        color="primary"
        onClick={onSubmit}
        sx={{ gridColumn: 3, gridRow: "2 / span 2", alignSelf: "stretch" }}
      >
        {saved ? "Update tips" : "Submit tips"}
      </Button>
      <Pick label="Bottom 10" colour="error.main" team={bottomTenSelection} />
      <MarginField
        id="bottom10input"
        value={marginBottomTen}
        onChange={onChangeBottomTen}
        name={
          bottomTenSelection
            ? `Margin for ${bottomTenSelection}`
            : "Margin for your bottom 10 tip"
        }
      />
    </Box>
  );
};

export default TipBar;
