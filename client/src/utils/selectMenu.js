// How every Select in the app opens its list.
//
// Two problems, and the second is the one that actually bites.
//
// MUI anchors a Select's menu so the chosen item sits under the pointer. On a
// short list that puts the item you already had directly under your finger the
// moment it opens, so a click reads as "open and choose" rather than "open".
// Anchoring to the bottom edge puts the list underneath instead.
//
// But anchorOrigin is only a starting position. A Popover that will not fit on
// screen is moved until it does, so a list long enough - the eighteen clubs,
// say - is dragged back up over the control regardless, and lands with an
// arbitrary item under the pointer again. Measured on the sign-up page: the
// menu opened at y=80 and ran to y=678 in a 694px window, covering a control
// sitting at 474.
//
// Capping the height is what fixes that. A list this size scrolls rather than
// spanning the window, so it fits below the control and nothing is ever under
// the pointer when it appears.
//
// 240px is five rows. 320 was still too tall: on the sign-up form, where the
// team picker sits near the bottom of a long page, there was 253px below the
// control and MUI dragged the menu back up over it again. Five rows fits, and
// a list that scrolls is a smaller cost than a list that steals your click.
//
// This is a height that fits in the usual case, not a guarantee. A control
// close enough to the bottom of a short window leaves no room for any menu,
// and MUI will move it over the control again.
const ROW = 48; // a MenuItem at the default density
const DEFAULT_ROWS = 5;

// The cap is a parameter because five is right for a form field and wrong for a
// menu that ends in things to do.
//
// A Select's list is all one kind of thing, so where it stops scrolling costs
// nothing but a scroll. The ladder menu ends with Create and Join below a
// divider, and a cap that hides them puts the two actions behind a gesture
// rather than in the list - which is the problem this menu was built to fix.
//
// The default stays at five. It is not a round number someone liked: 320 was
// tried and was still too tall, because the team picker on the sign-up page
// sits near the bottom of a long form with 253px under it, and MUI dragged the
// menu back up over the control. Anything raising this for one menu should
// raise it for that menu only.
export const menuBelow = (rows = DEFAULT_ROWS) => ({
  anchorOrigin: { vertical: "bottom", horizontal: "left" },
  transformOrigin: { vertical: "top", horizontal: "left" },
  slotProps: {
    paper: { sx: { maxHeight: rows * ROW } },
  },
});

export const MENU_BELOW = menuBelow();

export default MENU_BELOW;
