import { useContext, useState, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  PageSkeleton,
  Panel,
  TitleSkeleton,
  FormSkeleton,
} from "../../components/Skeletons";
import LoadFailure from "../../components/LoadFailure";
import { describeRequestError } from "../../utils/http";
import AdminComponent from "../../components/AdminComponent";
import Alerts from "../../components/Alerts";
import Container from "@mui/material/Container";
import API from "../../utils/TipsAPI";
import AuthAPI from "../../utils/AuthAPI";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import PasswordField from "../../components/PasswordField";
import Select from "@mui/material/Select";
import { MENU_BELOW } from "../../utils/selectMenu";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import {
  validUsername,
  USERNAME_RULE,
} from "../../utils/ValidationHelpers";

const SettingsPage = () => {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const alertRef = useRef();

  // Saving something and being told so at the top of a long page meant the
  // message appeared where you were not looking. The toast lands in the same
  // corner whatever you just did.
  const say = (severity, message) =>
    alertRef.current && alertRef.current.createAlert(severity, message, true);

  const [isLoading, setIsLoading] = useState(true);
  const [userDetails, setUserDetails] = useState();

  const [teams, setTeams] = useState([]);
  const [favTeam, setFavTeam] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [usernameMessage, setUsernameMessage] = useState(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState(null);

  // Set when the account details cannot be fetched.
  const [loadError, setLoadError] = useState(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getUserDetailsFunction();
    API.getTeams()
      .then((results) => setTeams(results.data || []))
      // The team list only fills the favourite-team picker. An empty picker is
      // a poor experience but not a broken page, and the account details
      // failing is what actually stops this page working.
      .catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    if (userDetails) {
      setFavTeam(userDetails.favTeam);
      setIsLoading(false);
    }
  }, [userDetails]);

  function getUserDetailsFunction() {
    API.getUserDetails(user)
      .then((results) => {
        setUserDetails(results.data);
        setLoadError(null);
      })
      // The same hang the tips page had: isLoading is only cleared in the
      // effect that reacts to userDetails arriving, so a failure left this
      // page on its skeleton indefinitely and said nothing.
      .catch((err) => {
        setLoadError(describeRequestError(err));
        setIsLoading(false);
      });
  }

  function saveFavouriteTeam() {
    API.updateFavouriteTeam(favTeam)
      .then((res) => {
        say("success", res.data.message);
        getUserDetailsFunction();
      })
      .catch((err) => say("error", errorMessage(err, "Unable to save.")));
  }

  function changeUsername() {
    setUsernameMessage(null);

    // Checked here so an obvious mistake does not cost a round trip. The
    // server checks the same rule, and it is the only one that can say
    // whether the name is already taken.
    if (!validUsername(newUsername)) {
      setUsernameMessage(USERNAME_RULE);
      return;
    }

    AuthAPI.changeUsername({ username: newUsername })
      .then((res) => {
        say("success", res.data.message);
        setNewUsername("");
        // The navbar and every greeting read this, so the new name has to
        // reach the context rather than waiting for the next sign-in.
        setUser((current) => ({ ...current, name: res.data.username }));
        getUserDetailsFunction();
      })
      .catch((err) =>
        setUsernameMessage(errorMessage(err, "Unable to change your username."))
      );
  }

  function changePassword() {
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage("The new passwords do not match.");
      return;
    }

    AuthAPI.changePassword({ currentPassword, newPassword })
      .then((res) => {
        say("success", res.data.message);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((err) =>
        setPasswordMessage(errorMessage(err, "Unable to change your password."))
      );
  }

  // The old version called logout() first and then deleted, so the delete
  // request arrived with no session, came back 401, and the account survived.
  // It also checked response.data.status, which the endpoint has never
  // returned, so the success branch never ran. Delete first: the server ends
  // the session itself, leaving the client only to forget the user.
  // Confirmation is a dialog rather than window.confirm. The browser is free
  // to suppress a native confirm - Chrome's "prevent this page from creating
  // additional dialogs", sandboxed frames, background tabs - and a suppressed
  // confirm returns false, so the delete silently did nothing with no dialog
  // ever shown and no error to go on.
  function deleteUser() {
    setConfirmingDelete(false);
    setDeleting(true);
    API.deleteUser()
      .then((response) => {
        if (response.data && response.data.success) {
          setUser({
            isAuthenticated: false,
            name: null,
            id: null,
            admin: false,
          });
          navigate("/login");
        } else {
          say(
            "error",
            (response.data && response.data.message) ||
              "Unable to delete your account."
          );
        }
      })
      .catch((err) =>
        say("error", errorMessage(err, "Unable to delete your account."))
      )
      .finally(() => setDeleting(false));
  }

  function errorMessage(err, fallback) {
    return err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : fallback;
  }


  return (
    <div>
      {isLoading ? (
        <PageSkeleton maxWidth="sm">
          <TitleSkeleton />
          <Panel>
            <FormSkeleton fields={4} />
          </Panel>
        </PageSkeleton>
      ) : (
        <Container maxWidth="sm">
          {/* Matches the menu item that leads here. A link and the page it
              opens should agree on what the place is called, and "Settings"
              now belongs to the gear on the leaderboard, which is settings
              for a league rather than for you. */}
          <Typography variant="h5" component="h1" gutterBottom>
            Profile
          </Typography>
          <Alerts ref={alertRef} />

          {/* Where the account details should have been. Without it a failed
              fetch rendered the page with every field simply absent, which
              reads as an account holding nothing. */}
          {loadError ? (
            <LoadFailure message={loadError} onRetry={getUserDetailsFunction} />
          ) : null}

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            {userDetails ? (
              <div>
                <Typography>Username: {userDetails.username}</Typography>
                <Typography>
                  Name: {userDetails.firstName} {userDetails.lastName}
                </Typography>
                <Typography>Email: {userDetails.email}</Typography>
                <Typography>
                  Favourite Team:{" "}
                  {userDetails.teamDetail && userDetails.teamDetail[0]
                    ? userDetails.teamDetail[0].name
                    : "not set"}
                </Typography>
              </div>
            ) : (
              ""
            )}
          </Box>

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Change username
            </Typography>
            {/* The rule was spelled out here as well as in the validation
                message, so the same sentence appeared twice - once as
                instruction, once as failure. The validation says it when it
                matters. */}
            <p style={{ marginTop: 0 }}>
              This is the name shown on the leaderboard and the home page.
            </p>
            <TextField
              label="New username"
              variant="outlined"
              fullWidth
              id="new-username"
              name="new-username"
              autoComplete="username"
              // error + helperText, the same treatment every other form in the
              // app uses: small red text under the field it belongs to, rather
              // than a plain paragraph below the button.
              error={Boolean(usernameMessage)}
              helperText={usernameMessage}
              value={newUsername}
              onChange={(event) => {
                setNewUsername(event.target.value);
                // Cleared on the next keystroke, so a message about what you
                // typed does not outlive it.
                if (usernameMessage) setUsernameMessage(null);
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={changeUsername}
              disabled={!newUsername}
              sx={{ mt: 2 }}
            >
              Save
            </Button>
          </Box>

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Change favourite team
            </Typography>
            <FormControl style={{ minWidth: 200 }}>
              <InputLabel id="select-fav-team">Team</InputLabel>
              <Select
                MenuProps={MENU_BELOW}
                labelId="select-fav-team"
                label="Team"
                value={favTeam === undefined || favTeam === null ? "" : favTeam}
                onChange={(event) => setFavTeam(event.target.value)}
              >
                {teams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>{" "}
            <Button
              variant="contained"
              color="primary"
              onClick={saveFavouriteTeam}
              disabled={!favTeam}
            >
              Save
            </Button>
          </Box>

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Change password
            </Typography>
            <p style={{ marginTop: 0 }}>
              Minimum eight characters, with at least one letter and one number.
            </p>
            <PasswordField
              label="Current password"
              variant="outlined"
              margin="dense"
              fullWidth
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <PasswordField
              label="New password"
              variant="outlined"
              margin="dense"
              fullWidth
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            {/* The message hangs off the last field rather than sitting under
                the button as a paragraph, so it reads like every other
                validation failure in the app: small, red, and attached to the
                thing that was wrong. */}
            <PasswordField
              label="Confirm new password"
              variant="outlined"
              margin="dense"
              fullWidth
              error={Boolean(passwordMessage)}
              helperText={passwordMessage}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (passwordMessage) setPasswordMessage(null);
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={changePassword}
              disabled={!currentPassword || !newPassword || !confirmPassword}
              style={{ marginTop: "8px" }}
            >
              Change password
            </Button>
          </Box>

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Delete account
            </Typography>
            <p style={{ marginTop: 0 }}>
              This removes your account and every tip you have entered. It
              cannot be undone.
            </p>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => setConfirmingDelete(true)}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete account"}
            </Button>
          </Box>

          <Dialog
            open={confirmingDelete}
            onClose={() => setConfirmingDelete(false)}
            aria-labelledby="confirm-delete-title"
          >
            <DialogTitle id="confirm-delete-title">
              Delete your account?
            </DialogTitle>
            <DialogContent>
              <DialogContentText>
                This removes {user.name}'s account and every tip entered under
                it. It cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setConfirmingDelete(false)}
                color="primary"
                autoFocus
              >
                Cancel
              </Button>
              <Button onClick={deleteUser} color="secondary">
                Delete my account
              </Button>
            </DialogActions>
          </Dialog>

          {user.admin ? (
            <Box
              sx={{
                boxShadow: 3,
                p: 2,
                pt: 1,
                mb: 2,
                bgcolor: "background.paper"
              }}>
              <AdminComponent />
            </Box>
          ) : (
            ""
          )}
        </Container>
      )}
    </div>
  );
};

export default SettingsPage;
