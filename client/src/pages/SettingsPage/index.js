import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";

const RulesPage = () => {
  const { user } = useContext(AuthContext);
  return (
    <div>
      <Navbar />
      <Container>
        <div>
          <h4>Settings</h4>
          <h6>Name: {user.name}</h6>
          <h6>Email: {user.email}</h6>
          <h6>ID: {user.id}</h6>
          <h6>Favourite Team: On the todo list...</h6>
          <h6>Admin rights? {user.admin.toString()}</h6>
        </div>
      </Container>
      <Footer />
    </div>
  );
};

export default RulesPage;
