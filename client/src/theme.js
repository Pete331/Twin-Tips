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
  components: {
    MuiTypography: {
      // subtitle1 and subtitle2 map to <h6> by default, which is how nine
      // empty headings appeared on the tips page: a subtitle holding a
      // winner that has not been decided yet renders <h6></h6>, and a
      // heading with no text is one a screen reader announces as an empty
      // level-6 heading. None of these are headings - they are dates,
      // venues and results - so they become paragraphs.
      defaultProps: {
        variantMapping: { subtitle1: "p", subtitle2: "p" },
      },
    },
    MuiCssBaseline: {
      // The function form so this reads the palette rather than repeating a
      // colour. Plain react-router Links render bare anchors, which would
      // otherwise be browser-blue and underlined. This used to live in
      // global.css as a hardcoded #3f51b5, where it also landed on the
      // navbar's links and turned them indigo against the navy bar. Anything
      // that wants to opt out - the navbar, the footer - says color: inherit
      // and takes its surface's colour instead.
      styleOverrides: (themeParam) => ({
        a: {
          color: themeParam.palette.primary.main,
          textDecoration: "inherit",
        },
      }),
    },
  },
});

export default theme;
