import { useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

// The account corner: everything about you, behind your own initials.
//
// Settings and Logout used to be two of seven items in the bar. They are the
// two that are about the person rather than the competition, and putting them
// where every other site puts them costs nothing to learn and takes two labels
// out of the row.

// One letter, or two for a name with a space in it.
//
// Deliberately not an image. There are no avatars to serve and nowhere to
// upload one, so a photo-shaped placeholder would be a promise the app does
// not keep. Initials are the honest version of the same affordance.
export const initialsFor = (name) => {
  const clean = String(name || "").trim();
  if (!clean) return "?";

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
};

const AccountMenu = ({ name, onLogout }) => {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const close = () => setAnchor(null);

  return (
    <>
      {/* The name is the accessible name, not "account" - a screen reader
          should hear whose account this is, which is also what the initials
          are saying visually. */}
      <Tooltip title={name || "Account"}>
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label={`Account: ${name || "signed in"}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? "account-menu" : undefined}
          sx={{ p: 0.5 }}
        >
          <Avatar
            sx={{
              width: 34,
              height: 34,
              fontSize: "0.85rem",
              fontWeight: 700,
              // White on the navy bar, rather than MUI's grey default, which
              // reads as a disabled control against this background.
              bgcolor: "#ffffff",
              color: "#003b91",
            }}
          >
            {initialsFor(name)}
          </Avatar>
        </IconButton>
      </Tooltip>

      {/* Same arrangement as the mobile menu: the row is the link, so the
          whole item is the target rather than just the word inside it. */}
      <Menu
        id="account-menu"
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ list: { onClick: close } }}
      >
        <MenuItem component={Link} to="/Settings">
          Settings
        </MenuItem>
        <MenuItem component={Link} to="/" onClick={onLogout}>
          Logout
        </MenuItem>
      </Menu>
    </>
  );
};

export default AccountMenu;
