import React, { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Loader from "../../components/Loader";
import AdminComponent from "../../components/AdminComponent";
import Container from "@material-ui/core/Container";
import API from "../../utils/TipsAPI";
import Box from "@material-ui/core/Box";

const SettingsPage = () => {
  const { user } = useContext(AuthContext);

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
