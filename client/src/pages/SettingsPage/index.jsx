import React, { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { useHistory } from "react-router";
import Loader from "../../components/Loader";
import AdminComponent from "../../components/AdminComponent";
import Container from "@material-ui/core/Container";
import API from "../../utils/TipsAPI";
import AuthAPI from "../../utils/AuthAPI";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import InputLabel from "@material-ui/core/InputLabel";
import FormControl from "@material-ui/core/FormControl";

const SettingsPage = () => {
  const { user, setUser } = useContext(AuthContext);
  const history = useHistory();
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
  function deleteUser() {
    if (!window.confirm("Are you sure you want to delete your account?")) {
      return;
    }

    setDeleteMessage(null);
    API.deleteUser()
      .then((response) => {
        if (response.data && response.data.success) {
          setUser({
            isAuthenticated: false,
            name: null,
            id: null,
            admin: false,
          });
          history.push("/login");
        } else {
          setDeleteMessage(
            (response.data && response.data.message) ||
              "Unable to delete your account."
          );
        }
      })
      .catch((err) =>
        setDeleteMessage(errorMessage(err, "Unable to delete your account."))
      );
  }

  function errorMessage(err, fallback) {
    return err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : fallback;
  }

  const loadingTimeout = () => {
    setTimeout(() => {
      setIsLoading(false);
      clearTimeout(this);
    }, 100);
  };

  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container className="container" maxWidth="sm">
          <h4>Settings</h4>

          <Box boxShadow={3} p={2} pt={1} mb={2} className="Box">
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

          <Box boxShadow={3} p={2} pt={1} mb={2} className="Box">
            <h6>Change favourite team</h6>
            <FormControl style={{ minWidth: 200 }}>
              <InputLabel id="select-fav-team">Team</InputLabel>
              <Select
                labelId="select-fav-team"
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

          <Box boxShadow={3} p={2} pt={1} mb={2} className="Box">
            <h6>Change password</h6>
            <p style={{ marginTop: 0 }}>
              Minimum eight characters, with at least one letter and one number.
            </p>
            <TextField
              label="Current password"
              type="password"
              variant="outlined"
              margin="dense"
              fullWidth
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <TextField
              label="New password"
              type="password"
              variant="outlined"
              margin="dense"
              fullWidth
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <TextField
              label="Confirm new password"
              type="password"
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

          <Box boxShadow={3} p={2} pt={1} mb={2} className="Box">
            <h6>Delete account</h6>
            <p style={{ marginTop: 0 }}>
              This removes your account and every tip you have entered. It
              cannot be undone.
            </p>
            <Button variant="contained" color="secondary" onClick={deleteUser}>
              Delete Account
            </Button>
            {deleteMessage ? <p>{deleteMessage}</p> : ""}
          </Box>

          {user.admin ? (
            <Box boxShadow={3} p={2} pt={1} mb={2} className="Box">
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
