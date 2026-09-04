import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import LeagueAPI from "../../utils/LeagueAPI";
import { MENU_BELOW } from "../../utils/selectMenu";
import { typeName, typeBlurb } from "../../utils/leagueTypes";
import { describeRequestError } from "../../utils/http";

// Joining and creating, opened from the ladder picker rather than parked under
// the table.
//
// These were the whole of the Leagues page, which existed mostly to hold them,
// and then an accordion below the standings. The accordion was the problem: on
// a phone a full ladder is taller than the screen, so the one route to a second
// league sat below everything you had come to read. You had to scroll past the
// answer to find the door.
//
// The picker is where it belongs. You open that menu when you are thinking
// about leagues - which one am I looking at - and adding one is the same
// thought. It is how a workspace switcher works, and it costs no space on a
// screen whose job is a table.
//
// `mode` is "create", "join", or null for closed. The caller owns it, because
// the caller is the menu that opens it.
const LeagueSetup = ({ mode, onClose, onJoined, say }) => {
  const navigate = useNavigate();
  const theme = useTheme();

  // A sheet on a phone, a dialog on anything larger. Same body either way -
  // what changes is where it comes from, because a centred box on a phone
  // covers the page while a sheet reads as a drawer over the bottom of it.
  const phone = useMediaQuery(theme.breakpoints.down("sm"));

  const [name, setName] = useState("");
  const [type, setType] = useState("weekly");
  const [buyIn, setBuyIn] = useState("5");
  const [creating, setCreating] = useState(false);

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Only a pool has a stake, so the buy-in field only belongs on a weekly
  // league.
  const weekly = type === "weekly";

  function createLeague(event) {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    LeagueAPI.create({ name, type, ...(weekly ? { buyIn: Number(buyIn) } : {}) })
      .then((res) =>
        // Straight to the new league, where the invite link is. Creating one
        // and then having to find it is a step that exists only because the
        // page did not do it for you.
        navigate(`/leagues/${res.data.slug}`, {
          state: {
            alert: {
              type: "success",
              message: `${res.data.name} created. Share the invite below.`,
              show: true,
            },
          },
        })
      )
      .catch((err) => say("error", describeRequestError(err)))
      .finally(() => setCreating(false));
  }

  function joinLeague(event) {
    event.preventDefault();
    if (joining) return;

    setJoining(true);
    LeagueAPI.join({ code })
      .then((res) => {
        // Not a success - nothing changed. Blue with an information icon
        // rather than green with a tick.
        say(
          res.data.alreadyMember ? "info" : "success",
          res.data.alreadyMember
            ? `You are already in ${res.data.name}.`
            : `Joined ${res.data.name}.`
        );
        setCode("");
        onClose();
        // The picker that opened this has a new entry in it, so the page that
        // owns the list refreshes and switches to what was just joined.
        if (onJoined) onJoined(res.data.slug);
      })
      .catch((err) => say("error", describeRequestError(err)))
      .finally(() => setJoining(false));
  }

  const join = (
    <form onSubmit={joinLeague}>
      <Typography sx={{ mb: 2, color: "text.secondary" }}>
        Enter the code you were given, or open the invite link someone sent you.
      </Typography>
      <TextField
        label="Join code"
        variant="outlined"
        fullWidth
        value={code}
        placeholder="TWIN-4F9K"
        onChange={(event) => setCode(event.target.value)}
        // The field someone came here to fill. Focusing it saves a tap on a
        // phone and brings the keyboard up with the sheet.
        autoFocus
      />
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={!code || joining}
        sx={{ mt: 2 }}
      >
        {joining ? "Joining" : "Join"}
      </Button>
    </form>
  );

  const create = (
    <form onSubmit={createLeague}>
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField
            label="League name"
            variant="outlined"
            fullWidth
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Grid>
        <Grid size={{ xs: 12, sm: weekly ? 7 : 12 }}>
          <FormControl fullWidth>
            <InputLabel id="league-type">Scoring</InputLabel>
            <Select
              MenuProps={MENU_BELOW}
              labelId="league-type"
              label="Scoring"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <MenuItem value="weekly">{typeName("weekly")}</MenuItem>
              <MenuItem value="season">{typeName("season")}</MenuItem>
            </Select>
            {/* Spelled out under the picker rather than left to the name.
                Paying in every round is the unusual half of this - everywhere
                else a tipping pool is one pot for the season, funded once up
                front. */}
            <FormHelperText>{typeBlurb(type, buyIn || 0)}</FormHelperText>
          </FormControl>
        </Grid>
        {/* Only a pool has a stake. A season ladder is decided on tips and
            margin, so asking for a buy-in would be asking a question with no
            consequence. */}
        {weekly ? (
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              label="Buy-in per round"
              variant="outlined"
              fullWidth
              type="number"
              value={buyIn}
              onChange={(event) => setBuyIn(event.target.value)}
              // The prefix rather than the label carrying it, so the unit stays
              // visible while the field has a value in it.
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                },
              }}
              // Fixed at creation on the server, so say so before someone picks
              // a number they meant to change later.
              helperText="Fixed once the league exists"
            />
          </Grid>
        ) : null}
      </Grid>
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={!name || creating}
        sx={{ mt: 2 }}
      >
        {creating ? "Creating" : "Create league"}
      </Button>
    </form>
  );

  const body = (
    <Box sx={{ p: 3, pt: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography variant="h6" component="h2">
          {mode === "create" ? "Create a league" : "Join a league"}
        </Typography>
        {/* A sheet can be dismissed by tapping the page behind it, but that is
            a thing you have to know. The close button is the half that says so
            out loud. */}
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {mode === "create" ? create : join}
    </Box>
  );

  // Rendered only while open, so the fields start empty each time rather than
  // holding whatever was half-typed and abandoned on the last visit.
  if (!mode) return null;

  return phone ? (
    <Drawer
      anchor="bottom"
      open
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            // Taller than this and it stops reading as a sheet over the page;
            // the create form scrolls inside it instead.
            maxHeight: "90vh",
            // The keyboard pushes the sheet up on a phone, and the home
            // indicator sits over its bottom edge.
            pb: "env(safe-area-inset-bottom)",
          },
        },
      }}
    >
      {body}
    </Drawer>
  ) : (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      {body}
    </Dialog>
  );
};

export default LeagueSetup;
