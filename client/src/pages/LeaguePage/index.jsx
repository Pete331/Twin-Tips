import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import LeagueAPI from "../../utils/LeagueAPI";
import {
  PageSkeleton,
  Panel,
  TitleSkeleton,
  TableSkeleton,
} from "../../components/Skeletons";
import Alert from "../../components/Alerts";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import { MENU_BELOW } from "../../utils/selectMenu";
import { typeName, typeBlurb } from "../../utils/leagueTypes";
import MuiLink from "@mui/material/Link";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";

// One league: who is in it, how to get others in, and what its admin can do.
const LeaguePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [league, setLeague] = useState(null);
  const [missing, setMissing] = useState(false);

  const [name, setName] = useState("");
  const [successor, setSuccessor] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  // The member an admin is about to remove, or null. Holding the member rather
  // than a boolean lets the dialog name them.
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  const problem = (err, fallback) =>
    (err.response && err.response.data && err.response.data.message) || fallback;

  const say = (type, message) =>
    alertRef.current && alertRef.current.createAlert(type, message, true);

  const load = () =>
    LeagueAPI.detail(slug)
      .then((res) => {
        setLeague(res.data);
        setName(res.data.name);
      })
      .catch(() => setMissing(true))
      .finally(() => setIsLoading(false));

  // Keyed on the slug alone. load is rebuilt every render, so listing it here
  // would refetch on every render instead of when the league changes.
  useEffect(() => {
    load();
  }, [slug]);

  // The link people actually share. Built from the browser's own origin so it
  // is right in development and in production without being told which.
  const inviteLink =
    league && league.invite
      ? `${window.location.origin}/join/${league.invite.token}`
      : null;

  const copy = (text, what) => {
    // The clipboard API needs a secure context, which plain http on a phone
    // is not. Falling back to selecting the field is better than a button
    // that silently does nothing.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => say("success", `${what} copied.`))
        .catch(() => say("error", `Copy it by hand: ${text}`));
    } else {
      say("success", `Copy it by hand: ${text}`);
    }
  };

  const act = (promise, onDone) => {
    if (busy) return;
    setBusy(true);
    promise
      .then(onDone)
      .catch((err) => say("error", problem(err, "That did not work.")))
      .finally(() => setBusy(false));
  };

  if (missing) {
    return (
      <Container maxWidth="sm">
        <Typography variant="h5" component="h1" gutterBottom>
          League not found
        </Typography>
        <p>
          It may have been closed, or you may not be a member.{" "}
          <MuiLink component={Link} to="/leagues">
            Back to your leagues
          </MuiLink>
          .
        </p>
      </Container>
    );
  }

  const panel = { boxShadow: 3, p: 2, mb: 2, bgcolor: "background.paper" };
  const others = league
    ? league.members.filter((m) => !m.isYou)
    : [];

  return (
    <div>
      {isLoading || !league ? (
        <PageSkeleton maxWidth="sm">
          <TitleSkeleton subtitle />
          <Panel>
            <TableSkeleton rows={5} columns={3} />
          </Panel>
        </PageSkeleton>
      ) : (
        <Container maxWidth="sm">
          <Typography variant="h5" component="h1" gutterBottom>
            {league.name}
          </Typography>
          <Alert ref={alertRef} />

          <Box sx={panel}>
            <Typography sx={{ fontWeight: 700 }}>
              {typeName(league.type)}
            </Typography>
            {/* The mechanic in full under the name. A name cannot carry the
                round-by-round buy-in on its own, and that is the half people
                get wrong. */}
            <Typography sx={{ color: "text.secondary" }}>
              {typeBlurb(league.type, league.buyIn)}
            </Typography>
            <Typography sx={{ color: "text.secondary" }}>
              Scoring from round {league.startRound} of {league.createdSeason}.
            </Typography>
            {/* Carries the league, so the leaderboard opens on this one rather
                than on whichever it would have defaulted to. */}
            <MuiLink component={Link} to={`/leaderboard?league=${league.slug}`}>
              See the standings
            </MuiLink>
          </Box>

          {league.invite ? (
            <Box sx={panel}>
              <Typography variant="h6" component="h2" gutterBottom>
                Invite people
              </Typography>
              <p style={{ marginTop: 0 }}>
                Anyone with this link can join. The code is the same invite for
                someone who cannot open a link.
              </p>
              <TextField
                label="Invite link"
                variant="outlined"
                fullWidth
                value={inviteLink}
                slotProps={{ input: { readOnly: true } }}
              />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => copy(inviteLink, "Link")}
                >
                  Copy link
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => copy(league.invite.code, "Code")}
                >
                  Copy code {league.invite.code}
                </Button>
                {/* The remedy for a link that has gone too far, and for
                    someone who keeps rejoining after being removed. */}
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={busy}
                  onClick={() =>
                    act(
                      LeagueAPI.update(slug, { regenerateInvite: true }),
                      () => {
                        say("success", "New invite created. The old link no longer works.");
                        return load();
                      }
                    )
                  }
                >
                  New link
                </Button>
              </Box>
            </Box>
          ) : null}

          <Box sx={panel}>
            <Typography variant="h6" component="h2" gutterBottom>
              Members ({league.memberCount})
            </Typography>
            {league.members.map((member) => (
              <Box
                key={String(member.id)}
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 1,
                  py: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography sx={{ flexGrow: 1 }}>
                  {member.username}
                  {member.isAdmin ? " · admin" : ""}
                  {member.isYou ? " · you" : ""}
                </Typography>

                {league.isAdmin && !member.isYou ? (
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    onClick={() => setConfirmRemove(member)}
                  >
                    Remove
                  </Button>
                ) : null}
              </Box>
            ))}
          </Box>

          {league.isAdmin ? (
            <Box sx={panel}>
              <Typography variant="h6" component="h2" gutterBottom>
                Rename
              </Typography>
              <TextField
                label="League name"
                variant="outlined"
                fullWidth
                value={name}
                onChange={(event) => setName(event.target.value)}
                helperText="Invite links already shared keep working."
              />
              <Button
                variant="contained"
                sx={{ mt: 2 }}
                disabled={busy || !name || name === league.name}
                onClick={() =>
                  act(LeagueAPI.update(slug, { name }), () => {
                    say("success", "Renamed.");
                    return load();
                  })
                }
              >
                Save
              </Button>
            </Box>
          ) : null}

          {league.isAdmin && others.length ? (
            <Box sx={panel}>
              <Typography variant="h6" component="h2" gutterBottom>
                Hand over the league
              </Typography>
              <p style={{ marginTop: 0 }}>
                You cannot leave a league you run. Give it to someone else
                first.
              </p>
              <FormControl fullWidth>
                <InputLabel id="successor">New admin</InputLabel>
                <Select
                  MenuProps={MENU_BELOW}
                  labelId="successor"
                  label="New admin"
                  value={successor}
                  onChange={(event) => setSuccessor(event.target.value)}
                >
                  {others.map((member) => (
                    <MenuItem key={String(member.id)} value={String(member.id)}>
                      {member.username}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="warning"
                sx={{ mt: 2 }}
                disabled={busy || !successor}
                onClick={() =>
                  act(LeagueAPI.update(slug, { admin: successor }), () => {
                    say("success", "The league has a new admin.");
                    setSuccessor("");
                    return load();
                  })
                }
              >
                Hand over
              </Button>
            </Box>
          ) : null}

          <Box sx={panel}>
            <Typography variant="h6" component="h2" gutterBottom>
              {league.isAdmin ? "Close this league" : "Leave this league"}
            </Typography>

            {league.isAdmin ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Closing hides it from everyone. Past rounds are kept.
                </p>
                <Button
                  variant="contained"
                  color="error"
                  disabled={busy}
                  onClick={() => setConfirmClose(true)}
                >
                  Close league
                </Button>
              </>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>
                  Your tips stay where they are - you simply stop being scored
                  in this league.
                </p>
                <Button
                  variant="contained"
                  color="error"
                  disabled={busy}
                  onClick={() => setConfirmLeave(true)}
                >
                  Leave
                </Button>
              </>
            )}
          </Box>

          <Dialog open={confirmClose} onClose={() => setConfirmClose(false)}>
            <DialogTitle>Close {league.name}?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                It disappears for all {league.memberCount} members. Its rounds
                and results are kept, so this can be undone by hand if you ask.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmClose(false)}>Keep it</Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() =>
                  act(LeagueAPI.close(slug), () =>
                    navigate("/leagues", {
                      state: {
                        alert: {
                          type: "success",
                          message: `${league.name} has been closed.`,
                          show: true,
                        },
                      },
                    })
                  )
                }
              >
                Close it
              </Button>
            </DialogActions>
          </Dialog>

          {/* Removing someone and leaving are both one click away from being
              irreversible for the person it happens to, so both say what
              actually follows rather than asking "are you sure?". */}
          <Dialog
            open={Boolean(confirmRemove)}
            onClose={() => setConfirmRemove(null)}
          >
            <DialogTitle>
              Remove {confirmRemove ? confirmRemove.username : ""}?
            </DialogTitle>
            <DialogContent>
              <DialogContentText>
                They stop being scored in {league.name} from the next round.
                Rounds they have already played stay on the ladder, so the
                history does not change.
                {league.invite
                  ? " They can rejoin with the current invite link - use New link if you want to stop that."
                  : ""}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmRemove(null)}>Keep them</Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() => {
                  const member = confirmRemove;
                  setConfirmRemove(null);
                  act(LeagueAPI.removeMember(slug, member.id), () => {
                    say("success", `${member.username} removed.`);
                    return load();
                  });
                }}
              >
                Remove
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)}>
            <DialogTitle>Leave {league.name}?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                You stop being scored in this league from the next round. Your
                tips are unaffected - you keep tipping as normal, and every
                other league you are in still scores them. Rounds you have
                already played stay on the ladder.
                <br />
                <br />
                You will need an invite link or the join code to come back.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmLeave(false)}>Stay</Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() => {
                  setConfirmLeave(false);
                  act(
                    LeagueAPI.removeMember(
                      slug,
                      league.members.find((m) => m.isYou).id
                    ),
                    () =>
                      navigate("/leagues", {
                        state: {
                          alert: {
                            type: "success",
                            message: `You have left ${league.name}.`,
                            show: true,
                          },
                        },
                      })
                  );
                }}
              >
                Leave
              </Button>
            </DialogActions>
          </Dialog>
        </Container>
      )}
    </div>
  );
};

export default LeaguePage;
