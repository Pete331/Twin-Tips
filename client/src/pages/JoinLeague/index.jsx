import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import LeagueAPI from "../../utils/LeagueAPI";
import Loader from "../../components/Loader";
import LeaguePreview from "../../components/LeaguePreview";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";

// Where an invite link lands: /join/<token>.
//
// It shows the league and asks, rather than joining on arrival. Following a
// link from a group chat used to put you in the league at once - a Round Pool
// at $5 a round included - without your ever seeing the buy-in (UX audit
// finding #4). One tap more, on a button that says what it does.
//
// Behind PrivateRoute, so someone who is not signed in is sent to sign in, or
// to register, and returned here afterwards - which is why the token lives in
// the URL rather than in a form.
const JoinLeague = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [failed, setFailed] = useState(null);
  const [joining, setJoining] = useState(false);

  // Looking is safe to repeat, so StrictMode's second run in development costs
  // a request and nothing else.
  useEffect(() => {
    let current = true;
    LeagueAPI.preview({ token })
      .then((res) => current && setLeague(res.data))
      .catch(
        (err) =>
          current &&
          setFailed(
            (err.response && err.response.data && err.response.data.message) ||
              "That invite could not be used."
          )
      );
    return () => {
      current = false;
    };
  }, [token]);

  // The league named in the URL, so the ladder that opens is the one the link
  // was for.
  const openLadder = (slug, message, type = "success") =>
    navigate(`/leaderboard?league=${slug}`, {
      replace: true,
      state: { alert: { type, message, show: true } },
    });

  const join = () => {
    if (joining) return;
    setJoining(true);
    LeagueAPI.join({ token })
      .then((res) =>
        openLadder(
          res.data.slug,
          res.data.alreadyMember
            ? `You are already in ${res.data.name}.`
            : `Joined ${res.data.name}.`,
          res.data.alreadyMember ? "info" : "success"
        )
      )
      .catch((err) => {
        setJoining(false);
        setFailed(
          (err.response && err.response.data && err.response.data.message) ||
            "That invite could not be used."
        );
      });
  };

  if (failed) {
    return (
      <Container maxWidth="sm">
        <Typography variant="h5" component="h1" gutterBottom>
          That invite did not work
        </Typography>
        <p>{failed}</p>
        <p>
          Invite links stop working when the league admin creates a new one. Ask
          for the current link, or{" "}
          <MuiLink component={Link} to="/leagues">
            enter a join code
          </MuiLink>
          .
        </p>
      </Container>
    );
  }

  if (!league) return <Loader />;

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          boxShadow: 3,
          p: 3,
          bgcolor: "background.paper",
          display: "grid",
          gap: 2,
        }}
      >
        <Typography sx={{ color: "text.secondary" }}>
          {league.alreadyMember
            ? "You are already in this league."
            : "You have been invited to join"}
        </Typography>

        <LeaguePreview league={league} headingComponent="h1" />

        {league.alreadyMember ? (
          <Box>
            <Button
              variant="contained"
              onClick={() =>
                openLadder(
                  league.slug,
                  `You are already in ${league.name}.`,
                  "info"
                )
              }
            >
              See the ladder
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" onClick={join} disabled={joining}>
              {joining ? "Joining" : `Join ${league.name}`}
            </Button>
            <Button component={Link} to="/home">
              Not now
            </Button>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default JoinLeague;
