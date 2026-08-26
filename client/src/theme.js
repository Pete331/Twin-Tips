import { createTheme } from "@mui/material/styles";

// The app's theme. Previously there was none, so every colour that was not a
// MUI default had been written into a component as an inline style or into
// global.css - which is how the page ended up a hand-picked `lightgray` behind
// panels painted `#fafafa`, two greys chosen at different times that never
// matched.
//
// One deliberate departure from the defaults: Material UI v5 changed
// background.default from #fafafa to #fff, so with the CSS overrides gone the
// page and the cards on it were both white and the cards read only by their
// shadow. A faint grey behind them is the classic Material arrangement - a
// tinted ground, white surfaces - and it means the panels do not need a colour
// of their own.
const theme = createTheme({
  palette: {
    background: {
      default: "#f4f5f7",
    },
  },
});

export default theme;
