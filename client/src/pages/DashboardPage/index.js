import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Footer from "../../components/Footer";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/container";

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
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
        <button className="btn btn-primary" onClick={getFixture}>
          Download Fixtures
        </button>
        <button onClick={getTeams} className="btn btn-primary">
          Download Teams
        </button>
        <button onClick={getStandings} className="btn btn-primary">
          Download Standings
        </button>
        <button className="btn btn-primary">Winning Teams</button>
        <button onClick={getDetails} className="btn btn-primary">
          Fixtures with team details
        </button>
      </Container>
      <Footer />
    </div>
  );
};

export default Dashboard;
