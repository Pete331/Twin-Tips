import Box from "@mui/material/Box";

// Marks content that is being replaced.
//
// The problem this exists for: changing the round updates the picker
// immediately and leaves the fixtures below it untouched until the response
// lands. Measured locally at 73ms for the label against 228ms for the content,
// and every one of those requests is a full round trip in production - so for
// several hundred milliseconds the page showed one round's games under another
// round's name, with nothing to say it was working.
//
// A skeleton is the wrong tool here. There is already something on screen, it
// is the right shape, and only the numbers are changing - clearing it to draw
// grey boxes would be a flash and a loss. Fading says the same thing without
// throwing the content away, and the eye stays where it was.
//
// The first load is the other case and keeps its skeleton: there is nothing to
// fade when there is nothing there yet.
const Updating = ({ busy = false, children, sx }) => (
  <Box
    aria-busy={busy || undefined}
    sx={{
      opacity: busy ? 0.4 : 1,
      // Not just dimmed - inert. On the tips page this is correctness rather
      // than polish: without it the checkboxes belonging to the round you have
      // just left stay live for as long as the new one takes to arrive, and a
      // tip can be aimed at a fixture that is on its way off the screen.
      pointerEvents: busy ? "none" : undefined,
      transition: "opacity 150ms ease",
      "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      ...sx,
    }}
  >
    {children}
  </Box>
);

export default Updating;
