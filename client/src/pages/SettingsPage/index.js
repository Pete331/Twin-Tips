import React, { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { useHistory } from "react-router";
import Loader from "../../components/Loader";
import AdminComponent from "../../components/AdminComponent";
import Container from "@material-ui/core/Container";
import API from "../../utils/TipsAPI";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";

const SettingsPage = () => {
  const { user, logout } = useContext(AuthContext);
  const history = useHistory();
  const [isLoading, setIsLoading] = useState(true);
  const [userDetails, setUserDetails] = useState();

  useEffect(() => {
    getUserDetailsFunction();
  }, []);

  useEffect(() => {
    if (userDetails) {
      loadingTimeout();
    }
  }, [userDetails]);

  function getUserDetailsFunction() {
    API.getUserDetails(user).then((results) => {
      const users = results.data;
      // console.log(users);
      setUserDetails(users);
    });
  }

  function deleteUser() {
    if (window.confirm("Are you sure you want to delete your account?")) {
      logout();
      API.deleteUser(user)
        .then((response) => {
          // console.log(response.data);
          if (response.data.status === 200) {
            history.go(0);
          } else {
            console.log(response.data.message);
          }
        })
        .catch((err) => console.log(err));
    }
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
                <h6>Favourite Team: {userDetails.teamDetail[0].name}</h6>
                <h6>Admin rights? {user.admin.toString()}</h6>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={deleteUser}
                >
                  Delete Account
                </Button>
              </div>
            ) : (
              ""
            )}
            {user.admin ? <AdminComponent /> : ""}
          </Box>
        </Container>
      )}
    </div>
  );
};

export default SettingsPage;
