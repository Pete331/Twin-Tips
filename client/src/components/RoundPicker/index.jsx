import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
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

const RoundPicker = ({
  id,
  label,
  value,
  options = [],
  getOptionLabel = defaultLabel,
  onChange,
  minWidth = 140,
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

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, m: 1 }}>
      {stepping ? (
        <IconButton
          onClick={step(previous)}
          disabled={previous === null}
          aria-label={describe("Previous", previous)}
          sx={{ width: TOUCH, height: TOUCH }}
        >
          <ChevronLeftIcon />
        </IconButton>
      ) : null}

      <FormControl sx={{ minWidth }}>
        <InputLabel id={`${id}-label`}>{label}</InputLabel>
        <Select
          MenuProps={MENU_BELOW}
          labelId={`${id}-label`}
          id={id}
          label={label}
          value={value === undefined || value === null ? "" : value}
          onChange={(event) => onChange && onChange(event.target.value)}
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
          sx={{ width: TOUCH, height: TOUCH }}
        >
          <ChevronRightIcon />
        </IconButton>
      ) : null}
    </Box>
  );
};

export default RoundPicker;
