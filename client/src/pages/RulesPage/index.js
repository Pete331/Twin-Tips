import React from "react";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";
import Box from "@material-ui/core/Box";

const RulesPage = () => {
  const bullet = { listStyleType: "circle" };

  return (
    <div>
      <Navbar />
      <Container className="container" maxWidth="md">
        <Box boxShadow={3} pl={5} pt={1} pb={1} mb={2} mt={5} className="Box">
          <div>
            <h4>How to play</h4>
            <ul>
              <li style={bullet}>Tip 2 teams to win per round.</li>
              <li style={bullet}>
                One team must be from the Top Eight & the other team from the
                Bottom Ten (Based from the end of the previous rounds ladder
                position).
              </li>
              <li style={bullet}>
                Select the winning margin in the game of your choice (Either
                from the Top 8 team selection or the Bottom 10 team selection –
                Not both).
              </li>
              <li style={bullet}>
                You cannot pick the same team in consecutive weeks.
              </li>

              <li style={bullet}>
                A drawn match is equivalent to half a win. (1 win and a draw
                will always beat 1 win).
              </li>
            </ul>
            <ul>
              <h4>Weekly Results</h4>
              <li style={bullet}>
                The weekly winner is the person who selects the most number of
                winning tips AND has the smallest margin.
              </li>
              <li style={bullet}>
                Players pay 5 points per round to play; this goes into the
                weekly points pool (If ten people in your league submit their
                tips, the weekly pool will have 50 points in it).
              </li>
              <li style={bullet}>
                The weekly winner accumulates all the points in the weekly pool.
              </li>
              <li style={bullet}>
                In the case of a tied round. Points are split evenly.
              </li>
            </ul>
          </div>
        </Box>
        <Box mb={2}>
          <br></br>
        </Box>
      </Container>
      <Footer />
    </div>
  );
};

export default RulesPage;
