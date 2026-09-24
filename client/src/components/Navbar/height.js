// The height of the app bar, in a module of its own so that something which
// needs the number does not have to import the bar.
//
// The toasts need it, to sit just below the bar. Imported from the Navbar
// module itself, it moved the whole bar - logo, menus, MUI's AppBar - out of
// the entry chunk and into the one the toasts share with every page, for the
// sake of one number.
export const NAV_HEIGHT = 64;
