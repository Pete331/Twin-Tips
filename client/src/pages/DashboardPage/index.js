import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
// import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";
import AdminComponent from "../../components/AdminComponent";
// import Button from "@material-ui/core/Button";

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  //   useEffect(() => {
  //     getOdds();
  //   }, []);

  return (
    <div>
      <Navbar />
      <Container>
        <div>
          <h1>Welcome {user.name}!</h1>
          <h1>ID: {user.id}</h1>
        </div>
        {user.admin ? (<AdminComponent />):""}
      </Container>
      <Footer />
    </div>
  );
};

export default Dashboard;
