import { useContext, useState, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { useNavigate } from "react-router-dom";
import Loader from "../../components/Loader";
import AdminComponent from "../../components/AdminComponent";
import Container from "@mui/material/Container";
import API from "../../utils/TipsAPI";
import AuthAPI from "../../utils/AuthAPI";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import PasswordField from "../../components/PasswordField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";

const SettingsPage = () => {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [userDetails, setUserDetails] = useState();

  const [teams, setTeams] = useState([]);
  const [favTeam, setFavTeam] = useState("");
  const [teamMessage, setTeamMessage] = useState(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState(null);

  const [deleteMessage, setDeleteMessage] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getUserDetailsFunction();
    API.getTeams()
      .then((results) => setTeams(results.data || []))
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
    if (userDetails) {
      setFavTeam(userDetails.favTeam);
      loadingTimeout();
    }
  }, [userDetails]);

  function getUserDetailsFunction() {
    API.getUserDetails(user)
      .then((results) => setUserDetails(results.data))
      .catch((err) => console.log(err));
  }

  function saveFavouriteTeam() {
    setTeamMessage(null);
    API.updateFavouriteTeam(favTeam)
      .then((res) => {
        setTeamMessage(res.data.message);
        getUserDetailsFunction();
      })
      .catch((err) => setTeamMessage(errorMessage(err, "Unable to save.")));
  }

  function changePassword() {
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage("The new passwords do not match.");
      return;
    }

    AuthAPI.changePassword({ currentPassword, newPassword })
      .then((res) => {
        setPasswordMessage(res.data.message);
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
    setDeleteMessage(null);
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
          setDeleteMessage(
            (response.data && response.data.message) ||
              "Unable to delete your account."
          );
        }
      })
      .catch((err) =>
        setDeleteMessage(errorMessage(err, "Unable to delete your account."))
      )
      .finally(() => setDeleting(false));
  }

  function errorMessage(err, fallback) {
    return err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : fallback;
  }

  // Held in a ref so it can actually be cancelled. This used to call
  // clearTimeout(this), where `this` is not the timer handle and the call
  // does nothing - leaving a timer that fires after the component has gone
  // and sets state on it.
  const loadingTimer = useRef();

  useEffect(() => () => clearTimeout(loadingTimer.current), []);

  const loadingTimeout = () => {
    clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setIsLoading(false), 100);
  };

  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container maxWidth="sm">
          <h4>Settings</h4>

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
                <h6>Name: {user.name}</h6>
                <h6>Email: {userDetails.email}</h6>
                <h6>
                  Favourite Team:{" "}
                  {userDetails.teamDetail && userDetails.teamDetail[0]
                    ? userDetails.teamDetail[0].name
                    : "not set"}
                </h6>
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
            <h6>Change favourite team</h6>
            <FormControl style={{ minWidth: 200 }}>
              <InputLabel id="select-fav-team">Team</InputLabel>
              <Select
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
            {teamMessage ? <p>{teamMessage}</p> : ""}
          </Box>

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <h6>Change password</h6>
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
            <PasswordField
              label="Confirm new password"
              variant="outlined"
              margin="dense"
              fullWidth
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
            {passwordMessage ? <p>{passwordMessage}</p> : ""}
          </Box>

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              pt: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <h6>Delete account</h6>
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
              {deleting ? "Deleting..." : "Delete Account"}
            </Button>
            {deleteMessage ? <p>{deleteMessage}</p> : ""}
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
