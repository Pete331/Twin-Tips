// Makes a Select's list open below the control instead of on top of it.
//
// MUI's default anchors the menu over the Select so that the chosen item sits
// under the pointer. On a short list that means the list covers the control you
// just clicked, and the item now under your finger is the one you had already
// selected - so a click that felt like "open it" reads as "open and choose",
// and the menu appears to close again immediately.
//
// Anchoring to the bottom edge puts the list underneath. Nothing is ever under
// the pointer at the moment the menu opens, so opening and choosing stay two
// separate actions.
//
// Shared rather than repeated, so every picker in the app behaves the same way.
export const MENU_BELOW = {
  anchorOrigin: { vertical: "bottom", horizontal: "left" },
  transformOrigin: { vertical: "top", horizontal: "left" },
};

export default MENU_BELOW;
