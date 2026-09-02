import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import LeagueAPI from "../../utils/LeagueAPI";
import { MENU_BELOW } from "../../utils/selectMenu";
import { typeName, typeBlurb } from "../../utils/leagueTypes";
import { describeRequestError } from "../../utils/http";

// Joining and creating, under the table rather than on a page of their own.
//
// These were the whole of the Leagues page, which existed mostly to hold them:
// its third panel listed the leagues you are in, and the leaderboard's own
// picker is that list. Reaching a table through a page that only pointed at the
// table was a step with nothing in it.
//
// Folded away by default, because someone checking where they came in the
// round is not looking to start a competition. Open when you are in none,
// which is the one time it is the point of the page.
const LeagueSetup = ({ startOpen = false, onJoined, say }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(startOpen);

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
        // The picker above has a new entry in it, so the page that owns the
        // list refreshes and switches to what was just joined.
        if (onJoined) onJoined(res.data.slug);
      })
      .catch((err) => say("error", describeRequestError(err)))
      .finally(() => setJoining(false));
  }

  return (
    <Accordion
      expanded={open}
      onChange={() => setOpen((was) => !was)}
      disableGutters
      sx={{ mt: 2, boxShadow: 3, "&::before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>Join or create a league</Typography>
      </AccordionSummary>

      <AccordionDetails>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Join a league
          </Typography>
          <Typography sx={{ mt: 0, mb: 2, color: "text.secondary" }}>
            Enter the code you were given, or open the invite link someone sent
            you.
          </Typography>
          <form onSubmit={joinLeague}>
            <TextField
              label="Join code"
              variant="outlined"
              fullWidth
              value={code}
              placeholder="TWIN-4F9K"
              onChange={(event) => setCode(event.target.value)}
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
        </Box>

        <Box>
          <Typography variant="h6" component="h2" gutterBottom>
            Create a league
          </Typography>
          <form onSubmit={createLeague}>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField
                  label="League name"
                  variant="outlined"
                  fullWidth
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
                  {/* Spelled out under the picker rather than left to the
                      name. Paying in every round is the unusual half of this -
                      everywhere else a tipping pool is one pot for the season,
                      funded once up front. */}
                  <FormHelperText>{typeBlurb(type, buyIn || 0)}</FormHelperText>
                </FormControl>
              </Grid>
              {/* Only a pool has a stake. A season ladder is decided on tips
                  and margin, so asking for a buy-in would be asking a question
                  with no consequence. */}
              {weekly ? (
                <Grid size={{ xs: 12, sm: 5 }}>
                  <TextField
                    label="Buy-in per round"
                    variant="outlined"
                    fullWidth
                    type="number"
                    value={buyIn}
                    onChange={(event) => setBuyIn(event.target.value)}
                    // The prefix rather than the label carrying it, so the unit
                    // stays visible while the field has a value in it.
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">$</InputAdornment>
                        ),
                      },
                    }}
                    // Fixed at creation on the server, so say so before someone
                    // picks a number they meant to change later.
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
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default LeagueSetup;
