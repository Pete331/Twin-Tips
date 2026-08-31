import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { MENU_BELOW } from "../../utils/selectMenu";

// A round dropdown with a step either side of it.
//
// Moving one round used to mean opening a list of twenty-odd and finding the
// neighbour of the round you were already on, which is the most common thing
// anyone does here and was the slowest.
//
// The dropdown in the middle is an ordinary MUI Select, unchanged. Rebuilding
// it as a button opening a Menu would have cost the label association, the
// keyboard type-ahead a native select gives free, and the menu height cap that
// stops a long list opening under the pointer and taking the click that opened
// it (utils/selectMenu). The arrows are additive.

// 0 is a real round in seasons with an Opening Round, so it is named rather
// than numbered. Both pages defined this separately; it lives here now.
const defaultLabel = (round) =>
  round === 0 ? "Opening Round" : `Round ${round}`;

// 40px is MUI's default and two of them side by side on a phone is a miss
// waiting to happen.
const TOUCH = 44;

// Fixed, not a minimum. A width that follows its contents makes the whole
// control breathe in and out as you step - Round 9 to Round 10 to Opening
// Round - and the arrows move with it, so the button you are pressing walks
// out from under your finger.
//
// 112 because "Opening Round" measures 109px at the app's 16px Roboto, and it
// is the longest label any picker actually shows today. Everything else is
// "Round N" at 59-68px, so most of the time this is generous. Anything longer
// ellipsises rather than widening the control: the results picker would do
// that if finals rounds are ever named properly rather than numbered
// ("Preliminary Finals" needs 127).
const WIDTH = 112;

const RoundPicker = ({
  id,
  label,
  value,
  options = [],
  getOptionLabel = defaultLabel,
  onChange,
  width = WIDTH,
}) => {
  // Stepping by position in the list, never by round + 1. The options come
  // from the season's own data - the tipping picker runs from the first round
  // to the current one, the results picker holds every round including finals
  // - so a number one higher is not guaranteed to be in the list. Landing on
  // a value the Select has no item for renders it blank.
  const index = options.indexOf(value);
  const previous = index > 0 ? options[index - 1] : null;
  const next =
    index >= 0 && index < options.length - 1 ? options[index + 1] : null;

  // Nothing to step between: off-season the list is empty, and early in a
  // season it can hold one round. Two dead arrows say less than none.
  const stepping = options.length > 1;

  // Named with where they go, because pressing one leaves focus on the button
  // while the value changes in a Select nobody is focused on - so a screen
  // reader would otherwise get silence. "Next round, Round 13" says what
  // happened before it happens.
  const describe = (direction, round) =>
    round === null
      ? `${direction} round`
      : `${direction} round, ${getOptionLabel(round)}`;

  const step = (round) => () => {
    if (round !== null && onChange) onChange(round);
  };

  // One bordered, rounded shell with the arrows inside it, so the three parts
  // read as a single control rather than as a dropdown that happens to have
  // two buttons near it.
  //
  // The label moves out of the field and sits above as a caption. A floating
  // InputLabel needs the notch cut into the outline it floats over, and the
  // outline here belongs to the shell rather than to the Select - so the label
  // had nothing to sit in and crossed the shell's own border. Above the
  // control it is also just easier to read, and the tips page needs it: two of
  // these sit on that page and "Results" against "Round" is the only thing
  // telling them apart.
  const arrowStyle = {
    width: TOUCH,
    height: TOUCH,
    borderRadius: 0,
    color: "text.secondary",
    // Nothing to press, so it should not look pressable. MUI fades a disabled
    // icon button but keeps its hover; killing the hover as well is what makes
    // the end of the list feel like the end of the list.
    "&.Mui-disabled": { color: "action.disabled" },
  };

  return (
    <Box sx={{ display: "inline-block", m: 1 }}>
      <Typography
        id={`${id}-label`}
        variant="caption"
        component="div"
        sx={{ color: "text.secondary", pl: 0.5, pb: 0.25 }}
      >
        {label}
      </Typography>

      <Box
        sx={{
          display: "inline-flex",
          alignItems: "stretch",
          border: "1px solid",
          borderColor: "divider",
          // Fully rounded, as on the control this copies. overflow hidden so
          // the square arrow buttons are clipped back to the curve rather than
          // poking out of the corners.
          borderRadius: 999,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        {stepping ? (
          <IconButton
            onClick={step(previous)}
            disabled={previous === null}
            aria-label={describe("Previous", previous)}
            sx={arrowStyle}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        ) : null}

        <FormControl variant="standard" sx={{ width, justifyContent: "center" }}>
          <Select
            MenuProps={MENU_BELOW}
            disableUnderline
            // labelId, not a hand-written aria-labelledby. The element
            // carrying role="combobox" is one MUI renders inside the Select,
            // and it builds its own aria-labelledby from labelId - so an
            // attribute passed in from outside was dropped and the control had
            // no accessible name at all. labelId only needs an element with
            // that id to point at; it does not have to be an InputLabel.
            labelId={`${id}-label`}
            id={id}
            value={value === undefined || value === null ? "" : value}
            onChange={(event) => onChange && onChange(event.target.value)}
            // No caret. The arrows either side already say this is something
            // you move through, and the control being copied has none - the
            // caret only added width to a component that was too long. It
            // still opens on a click, and still reports itself as a combobox,
            // so nothing but the drawn triangle has gone.
            IconComponent={() => null}
            sx={{
              // The standard variant's underline is two pseudo-elements rather
              // than a border, and they sit inside the shell where they read
              // as a stray line under the value.
              "&:before, &:after": { display: "none" },
              "& .MuiSelect-select": {
                py: 1,
                textAlign: "center",
                // Both important: MUI reserves 24px on the right for the icon
                // that is no longer there, and its own selector beats a plain
                // sx entry here.
                pl: 0,
                pr: "0 !important",
              },
            }}
          >
            {options.map((round) => (
              <MenuItem key={round} value={round}>
                {getOptionLabel(round)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {stepping ? (
          <IconButton
            onClick={step(next)}
            disabled={next === null}
            aria-label={describe("Next", next)}
            sx={arrowStyle}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Box>
    </Box>
  );
};

export default RoundPicker;
