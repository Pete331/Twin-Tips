import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import useMediaQuery from "@mui/material/useMediaQuery";

import { visuallyHidden } from "@mui/utils";

// Placeholders shaped like the page that is coming.
//
// These replace a full-page CircularProgress at minHeight 100vh. That spinner
// sat inside <main>, below the header, so while a page loaded the content area
// collapsed to an empty viewport-tall box, the document grew taller than the
// window, a scrollbar appeared, and all of it snapped back when the data
// arrived. The page did not just look empty, it moved.
//
// The point of these is not decoration. It is that the frame is already the
// right shape and the right size, so nothing jumps when the content lands -
// which matters most on exactly the connections this was built for.
//
// What they cannot do is worth being clear about: they only exist once the
// bundle has downloaded and React is running. A cold start on a free instance
// is the browser waiting on a server that has not booted, with no HTML yet -
// nothing here helps with that.

// Every skeleton on the page is one decoration, announced once.
//
// The shapes are aria-hidden because they mean nothing read aloud: without it
// a screen reader wades through two dozen anonymous boxes. The container says
// "Loading" once, politely, and role="status" is what makes it heard when it
// appears rather than only when focus reaches it.
export const PageSkeleton = ({ maxWidth = "md", sx, children }) => (
  <Container maxWidth={maxWidth} sx={sx} role="status" aria-live="polite">
    <Box component="span" sx={visuallyHidden}>
      Loading
    </Box>
    <Box aria-hidden="true">{children}</Box>
  </Container>
);

// An animation that sweeps across the page is exactly what someone who asked
// for reduced motion asked not to see. MUI's Skeleton takes false, which keeps
// the shape and drops the movement.
const useAnimation = () =>
  useMediaQuery("(prefers-reduced-motion: reduce)") ? false : "wave";

const Line = ({ width, height = 24, sx }) => {
  const animation = useAnimation();
  return (
    <Skeleton
      variant="text"
      animation={animation}
      width={width}
      height={height}
      sx={sx}
    />
  );
};

const Block = ({ height, sx }) => {
  const animation = useAnimation();
  return (
    <Skeleton
      variant="rounded"
      animation={animation}
      height={height}
      sx={sx}
    />
  );
};

// The shadowed white box the pages put their content in. Same sx values as the
// real ones, so the skeleton occupies the same space to the pixel.
export const Panel = ({ children, sx }) => (
  <Box
    sx={{ boxShadow: 3, p: 2, mb: 2, bgcolor: "background.paper", ...sx }}
  >
    {children}
  </Box>
);

// A page title, and the secondary line under it where a page has one.
export const TitleSkeleton = ({ subtitle = false }) => (
  <>
    <Line width={220} height={32} />
    {subtitle ? <Line width={160} sx={{ mb: 2 }} /> : null}
  </>
);

// The round picker: a caption above a 44px pill. Sized to the real control so
// the panel below it does not shift when the real one renders.
export const PickerSkeleton = ({ width = 200 }) => (
  <Box sx={{ mb: 2 }}>
    <Line width={48} height={16} />
    <Block height={44} sx={{ width, borderRadius: 22 }} />
  </Box>
);

// A table: the header row, then body rows at the height MUI gives them.
//
// rows defaults to a number that looks like a full table rather than a nearly
// empty one - a skeleton shorter than the content still causes the jump it
// exists to prevent.
export const TableSkeleton = ({ rows = 7, columns = 3 }) => (
  <Box>
    <Box sx={{ display: "flex", gap: 2, py: 1 }}>
      {Array.from({ length: columns }, (_, i) => (
        <Line
          key={i}
          height={20}
          sx={{ flexGrow: i === 0 ? 2 : 1, maxWidth: i === 0 ? "none" : 80 }}
        />
      ))}
    </Box>
    {Array.from({ length: rows }, (_, r) => (
      <Box
        key={r}
        sx={{
          display: "flex",
          gap: 2,
          alignItems: "center",
          height: 53,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <Line
            key={i}
            height={20}
            sx={{ flexGrow: i === 0 ? 2 : 1, maxWidth: i === 0 ? "none" : 80 }}
          />
        ))}
      </Box>
    ))}
  </Box>
);

// Fixtures, grouped under a day heading exactly as the real list is.
//
// Two days of four and three: a Saturday and a Sunday, which is the shape of
// most rounds. The card height matches FixtureCard's, logo and all.
export const FixtureDaysSkeleton = ({ days = [4, 3] }) => (
  <>
    {days.map((count, d) => (
      <Box key={d} sx={{ mb: 2 }}>
        <Line width={180} height={28} sx={{ mb: 1 }} />
        {Array.from({ length: count }, (_, i) => (
          <Block key={i} height={112} sx={{ mb: 0.75 }} />
        ))}
      </Box>
    ))}
  </>
);

// A stack of form rows, for the settings page.
export const FormSkeleton = ({ fields = 4 }) => (
  <>
    {Array.from({ length: fields }, (_, i) => (
      <Box key={i} sx={{ mb: 2.5 }}>
        <Line width={110} height={16} />
        <Block height={40} />
      </Box>
    ))}
    <Block height={36} sx={{ width: 130 }} />
  </>
);

// A list of cards, for the leagues pages.
export const CardsSkeleton = ({ count = 3 }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <Panel key={i} sx={{ p: 2 }}>
        <Line width="60%" height={26} />
        <Line width="40%" height={18} />
      </Panel>
    ))}
  </>
);

export default PageSkeleton;
