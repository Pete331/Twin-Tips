import React, { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";
import API from "../../utils/TipsAPI";

const SettingsPage = () => {
  const { user } = useContext(AuthContext);

  const [userDetails, setUserDetails] = useState();

  useEffect(() => {
    getUserDetailsFunction();
  }, []);

  function getUserDetailsFunction() {
    API.getUserDetails(user).then((results) => {
      const users = results.data;
      // console.log(users);
      setUserDetails(users);
    });
  }

  return (
    <div>
      <Navbar />
      <Container>
        {userDetails ? (
          <div>
            <h4>Settings</h4>
            <h6>Name: {user.name}</h6>
            <h6>Email: {userDetails.email}</h6>
            <h6>Favourite Team: {userDetails.teamDetail[0].name}</h6>
            <h6>Admin rights? {user.admin.toString()}</h6>
          </div>
        ) : (
          ""
        )}
      </Container>
      <Footer />
    </div>
  );
};

export default SettingsPage;
