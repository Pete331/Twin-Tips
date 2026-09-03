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

// One letter from the first name and one from the last.
//
// Deliberately not an image. There are no avatars to serve and nowhere to
// upload one, so a photo-shaped placeholder would be a promise the app does
// not keep. Initials are the honest version of the same affordance.
//
// The username is only the fallback, and only ever gives one letter. It is a
// single word - "testt", "pete331" - so its second character is not an initial
// of anything: taking two letters from it produced "TE", which looks like a
// pair of initials and is not one.
export const initialsFor = ({ firstName, lastName, username } = {}) => {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();

  const letters = (first[0] || "") + (last[0] || "");
  if (letters) return letters.toUpperCase();

  const fallback = String(username || "").trim();
  return fallback ? fallback[0].toUpperCase() : "?";
};

const AccountMenu = ({ user, onLogout }) => {
  // The username is what the app calls you everywhere else - the leaderboard,
  // the greeting - so it is what the tooltip and the accessible name say, even
  // though the circle shows your real initials.
  const name = user.name;
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
            {initialsFor({ ...user, username: user.name })}
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
        {/* "Profile", not "Settings". The page is your username, your
            password, your favourite team and deleting your account - all
            about you rather than about the app - and the word now has to
            carry that on its own, since the gear on the leaderboard is
            settings for a league. Two things called Settings, one meaning
            you and one meaning a league, is the ambiguity worth avoiding.
            The route keeps its name; only the label changed. */}
        <MenuItem component={Link} to="/Settings">
          Profile
        </MenuItem>
        <MenuItem component={Link} to="/" onClick={onLogout}>
          Logout
        </MenuItem>
      </Menu>
    </>
  );
};

export default AccountMenu;
