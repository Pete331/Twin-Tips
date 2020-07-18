import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Footer from "../../components/Footer";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/container";
import Button from "@material-ui/core/button";

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  //   useEffect(() => {
  //     getOdds();
  //   }, []);

  function getFixture() {
    API.getFixture()
      .then((results) => {
        console.log(results.data);
        API.postFixture(results.data);
      })
      .catch((err) => console.log(err));
  }

  function getTeams() {
    API.getTeams()
      .then((results) => {
        console.log(results.data);
        API.postTeams(results.data);
      })
      .catch((err) => console.log(err));
  }

  function getStandings() {
    API.getStandings()
      .then((results) => {
        console.log(results.data);
        API.postStandings(results.data);
      })
      .catch((err) => console.log(err));
  }

  function getDetails() {
    API.getDetails()
      .then((results) => {
        console.log(results.data);
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
      <Navbar />
      <Container>
        <div>
          <h1>Welcome {user.name}!</h1>
          <h1>ID: {user.id}</h1>
        </div>
        <Button variant="contained" color="primary" onClick={getFixture}>
          Download Fixtures
        </Button>
        <Button variant="contained" color="primary" onClick={getTeams}>
          Download Teams
        </Button>
        <Button variant="contained" color="primary" onClick={getStandings}>
          Download Standings
        </Button>
        <Button variant="contained" color="primary" onClick={getDetails}>
          Fixtures with team details
        </Button>
      </Container>
      <Footer />
    </div>
  );
};

export default Dashboard;
