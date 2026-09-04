import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LeagueAPI from "../../utils/LeagueAPI";
import Loader from "../../components/Loader";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import { Link } from "react-router-dom";

// Where an invite link lands: /join/<token>.
//
// It joins and redirects, so following a link from a group chat takes one tap
// and no decisions. Behind PrivateRoute, so someone who is not signed in is
// sent to sign in and returned here afterwards - which is why the token has to
// survive in the URL rather than being posted from a form.
const JoinLeague = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(null);

  // StrictMode mounts effects twice in development, and a double join would
  // otherwise show "you are already in this league" to someone who had just
  // joined for the first time.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    LeagueAPI.join({ token })
      .then((res) =>
        // The league named in the URL, so the ladder that opens is the one the
        // link was for. This used to land on /leagues - which redirects to the
        // leaderboard with no scope - and the picker then falls back to the
        // league you have been in longest. Following an invite put up a toast
        // naming the league you had just joined above a table of a different
        // one.
        navigate(`/leaderboard?league=${res.data.slug}`, {
          replace: true,
          state: {
            alert: {
              type: "success",
              message: res.data.alreadyMember
                ? `You are already in ${res.data.name}.`
                : `Joined ${res.data.name}.`,
              show: true,
            },
          },
        })
      )
      .catch((err) =>
        setFailed(
          (err.response && err.response.data && err.response.data.message) ||
            "That invite could not be used."
        )
      );
  }, [token, navigate]);

  if (!failed) return <Loader />;

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
};

export default JoinLeague;
