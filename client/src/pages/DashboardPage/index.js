import React, { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { Link } from "react-router-dom";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";
import AdminComponent from "../../components/AdminComponent";
import Button from "@material-ui/core/Button";

const Dashboard = () => {
  const { user } = useContext(AuthContext);

  const isInitialMount = useRef(true);

  const [currentRound, setCurrentRound] = useState();
  const [lastRoundResults, setLastRoundResults] = useState();

  // run these functions on page load
  useEffect(() => {
    currentRoundFunction();
  }, []);

  // added initial mount so that isnt called on mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      LastRoundResult({ user: user.id, previousRound: currentRound - 1 });
    }
  }, [currentRound]);

  function currentRoundFunction() {
    API.getCurrentRound()
      .then((results) => {
        console.log(results.data.round);
        setCurrentRound(results.data.round);
      })
      .catch((err) => console.log(err));
  }

  function LastRoundResult(data) {
    API.getLastRoundResult(data)
      .then((results) => {
        console.log(results.data);
        setLastRoundResults(results.data);
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
        <Link to={{ pathname: "/TipsPage" }}>
          <Button variant="contained" color="primary">
            Enter Round {currentRound} Tips
          </Button>
        </Link>
        {user.admin ? <AdminComponent /> : ""}
      </Container>
      <Footer />
    </div>
  );
};

export default Dashboard;
