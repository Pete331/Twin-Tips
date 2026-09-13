import Box from "@mui/material/Box";

// The first thing in the tab order, and invisible until it has focus.
//
// Without it a keyboard user tabs the logo, three navigation items, the help
// icon and the account menu before reaching the page - on every page, every
// time. A screen reader user has landmarks to jump by; somebody using a
// keyboard without one has nothing.
//
// Moved out of the way with a transform rather than display:none or
// visibility:hidden, either of which would take it out of the tab order and
// make it unreachable by the only people who need it.
const SkipLink = () => (
  <Box
    component="a"
    href="#main"
    sx={{
      position: "fixed",
      top: 8,
      left: 8,
      // Above the app bar, which is fixed and would otherwise cover it.
      zIndex: (theme) => theme.zIndex.tooltip + 1,
      px: 2,
      py: 1,
      borderRadius: 1,
      boxShadow: 3,
      bgcolor: "background.paper",
      color: "primary.main",
      textDecoration: "underline",
      transform: "translateY(-300%)",
      "&:focus": { transform: "translateY(0)" },
      // The move is instant for anyone who has asked for that.
      transition: "transform 120ms",
      "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    }}
  >
    Skip to content
  </Box>
);

export default SkipLink;
