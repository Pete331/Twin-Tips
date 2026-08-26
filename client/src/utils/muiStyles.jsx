import React from "react";
import { css } from "@emotion/css";
import { useTheme } from "@mui/material/styles";

// makeStyles and withStyles in the shape Material-UI v4 had them.
//
// MUI removed both when it moved from JSS to emotion. @mui/material/styles
// still exports a makeStyles, but it is a stub that throws "makeStyles is no
// longer exported from @mui/material/styles" the moment it is called - which
// is easy to mistake for the real thing, since it type-checks as a function.
//
// The styling here is a set of plain rule objects keyed by name, consumed as
// classes.something across 27 components. Rebuilding that as styled components
// or sx props would touch every one of them; this keeps the call shape and
// swaps the engine underneath, so only the style files themselves changed.
// Converting to sx properly is worth doing, but as its own piece of work.

const toClasses = (stylesOrFn, theme) => {
  const styles =
    typeof stylesOrFn === "function" ? stylesOrFn(theme) : stylesOrFn;
  const classes = {};
  for (const key of Object.keys(styles)) {
    classes[key] = css(styles[key]);
  }
  return classes;
};

export const makeStyles = (stylesOrFn) => {
  return function useStyles() {
    const theme = useTheme();
    return toClasses(stylesOrFn, theme);
  };
};

export const withStyles = (stylesOrFn) => (Component) => {
  const WithStyles = (props) => {
    const theme = useTheme();
    return <Component {...props} classes={toClasses(stylesOrFn, theme)} />;
  };
  WithStyles.displayName = `withStyles(${
    Component.displayName || Component.name || "Component"
  })`;
  return WithStyles;
};

export default makeStyles;
