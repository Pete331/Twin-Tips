import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LeagueAPI from "../../utils/LeagueAPI";
import Loader from "../../components/Loader";
import Alert from "../../components/Alerts";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import { MENU_BELOW } from "../../utils/selectMenu";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";

// The leagues you are in, and the two ways to get into another one.
//
// A league is a scoring scope over the tips you already submit - joining a
// second one does not mean tipping twice. That is worth saying on the page,
// because it is the thing people assume otherwise.
const LeaguesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);

  const [name, setName] = useState("");
  const [type, setType] = useState("weekly");
  const [buyIn, setBuyIn] = useState("5");
  const [creating, setCreating] = useState(false);

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Only a pool has a stake, so the buy-in field only belongs on a weekly
  // league.
  const weekly = type === "weekly";

  const load = () =>
    LeagueAPI.mine()
      .then((res) => setLeagues(res.data.leagues || []))
      .catch(() => setLeagues([]))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    load();
  }, []);

  // A message handed over by the join route, which redirects here after using
  // an invite link.
  useEffect(() => {
    const passed = location.state && location.state.alert;
    if (passed && alertRef.current) {
      alertRef.current.createAlert(passed.type, passed.message, true);
    }
  }, [location.state]);

  const problem = (err, fallback) =>
    (err.response && err.response.data && err.response.data.message) || fallback;

  function createLeague(event) {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    LeagueAPI.create({ name, type, ...(weekly ? { buyIn: Number(buyIn) } : {}) })
      .then((res) =>
        // Straight to the new league, where the invite link is. Creating one
        // and then having to find it in a list is a step that exists only
        // because the page did not do it for you.
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
      .catch((err) =>
        alertRef.current.createAlert(
          "error",
          problem(err, "Unable to create the league."),
          true
        )
      )
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
        alertRef.current.createAlert(
          res.data.alreadyMember ? "info" : "success",
          res.data.alreadyMember
            ? `You are already in .`
            : `Joined .`,
          true
        );
        setCode("");
        return load();
      })
      .catch((err) =>
        alertRef.current.createAlert(
          "error",
          problem(err, "Unable to join that league."),
          true
        )
      )
      .finally(() => setJoining(false));
  }

  const panel = {
    boxShadow: 3,
    p: 2,
    mb: 2,
    bgcolor: "background.paper",
  };

  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container maxWidth="sm">
          <Typography variant="h5" component="h1" gutterBottom>
            Leagues
          </Typography>
          <Alert ref={alertRef} />

          <Box sx={panel}>
            <Typography variant="h6" component="h2" gutterBottom>
              Your leagues
            </Typography>

            {leagues.length ? (
              leagues.map((league) => (
                <Box
                  key={league.slug}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 1,
                    py: 1,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <MuiLink
                    component={Link}
                    to={`/leagues/${league.slug}`}
                    sx={{ fontWeight: 700 }}
                  >
                    {league.name}
                  </MuiLink>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {league.type === "weekly"
                      ? `$${league.buyIn} a round`
                      : "season ladder"}
                    {league.isAdmin ? " · you are admin" : ""}
                  </Typography>
                </Box>
              ))
            ) : (
              <p>
                You are not in a league yet. Join one with a code below, or
                create your own.
              </p>
            )}
          </Box>

          <Box sx={panel}>
            <Typography variant="h6" component="h2" gutterBottom>
              Join a league
            </Typography>
            <p style={{ marginTop: 0 }}>
              Enter the code you were given, or open the invite link someone
              sent you.
            </p>
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

          <Box sx={panel}>
            <Typography variant="h6" component="h2" gutterBottom>
              Start a league
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
                      <MenuItem value="weekly">
                        A pool every round
                      </MenuItem>
                      <MenuItem value="season">
                        One ladder for the season
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                {/* Only a pool has a stake. A season ladder is decided on
                    tips and margin, so asking for a buy-in would be asking a
                    question with no consequence. */}
                {weekly ? (
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <TextField
                      label="Buy-in per round"
                      variant="outlined"
                      fullWidth
                      type="number"
                      value={buyIn}
                      onChange={(event) => setBuyIn(event.target.value)}
                      // The prefix rather than the label carrying it, so the
                      // unit stays visible while the field has a value in it.
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">$</InputAdornment>
                          ),
                        },
                      }}
                      // Fixed at creation on the server, so say so before
                      // someone picks a number they meant to change later.
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
        </Container>
      )}
    </div>
  );
};

export default LeaguesPage;
