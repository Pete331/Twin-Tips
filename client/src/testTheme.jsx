// The theme the app renders under, so tests render under it too.
//
// index.jsx wraps the whole app in ThemeProvider and the tests did not, which
// meant every test was looking at MUI's stock defaults rather than at this
// app's. Most of the difference does not show: the sentence-case buttons are
// CSS, and the palette only reaches the page through CssBaseline, which no test
// renders.
//
// One part does show, and it caught a test out. theme.js maps subtitle1 and
// subtitle2 to <p>; MUI's default maps them to <h6>. So a subtitle is a
// paragraph in the app and a heading in a test, and an assertion asking for one
// by heading role passed while describing markup nobody is ever served. A green
// test asserting the wrong thing is worse than no test, because it reads as
// cover.
//
// Applied per render rather than globally: there is no shared render to hook,
// each file builds its own tree of providers, and this belongs outside all of
// them - which is where index.jsx puts it.

import { ThemeProvider } from "@mui/material/styles";

import theme from "./theme";

export const withTheme = (ui) => (
  <ThemeProvider theme={theme}>{ui}</ThemeProvider>
);
