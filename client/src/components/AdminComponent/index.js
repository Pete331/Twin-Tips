import React, { useState } from "react";
import Button from "@material-ui/core/Button";
import API from "../../utils/TipsAPI";
import TextField from "@material-ui/core/TextField";

const AdminComponent = () => {
  const [roundCalculation, setRoundCalculation] = useState();

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

  function handleRoundChangeForDowload(event) {
    setRoundCalculation({ round: Number(event.target.value) });
  }

  // function that retrieves selections from database and calculates if got tips correct and the margin
  function calcResults() {
    API.getCalcResults(roundCalculation)
      .then((results) => {
        const fixtures = results.data.data.fixture;
        const tips = results.data.data.tips;
        // console.log(fixtures);
        // console.log(tips);
        const winnersData = [];
        fixtures.map((fixture) => {
          // sets loser team
          let loser = {};
          if (fixture.winner !== fixture.hteam && fixture.winner !== null) {
            loser = fixture.hteam;
          } else if (
            fixture.winner === fixture.hteam &&
            fixture.winner !== null
          ) {
            loser = fixture.ateam;
          }

          return winnersData.push([
            {
              winner: fixture.winner,
              loser: loser,
              hometeam: fixture.hteam,
              margin: Math.abs(fixture.hscore - fixture.ascore),
            },
          ]);
        });

        // console.log(winnersData);

        tips.map((weeklyTips) => {
          let topEightCorrect = null;
          let topEightCalculatedMargin = null;
          let bottomTenCorrect = null;
          let bottomTenCalculatedMargin = null;

          // console.log(winnersData);

          winnersData.map((game) => {
            // sets true if correct tip
            if (weeklyTips.topEightSelection === game[0].winner) {
              topEightCorrect = true;
              if (weeklyTips.marginTopEight) {
                topEightCalculatedMargin = Math.abs(
                  game[0].margin - weeklyTips.marginTopEight
                );
              }
            }
            if (weeklyTips.topEightSelection === game[0].loser) {
              topEightCorrect = false;
              if (weeklyTips.marginTopEight) {
                topEightCalculatedMargin =
                  game[0].margin + weeklyTips.marginTopEight;
              }
            }

            if (weeklyTips.bottomTenSelection === game[0].winner) {
              bottomTenCorrect = true;
              if (weeklyTips.marginBottomTen) {
                bottomTenCalculatedMargin = Math.abs(
                  game[0].margin - weeklyTips.marginBottomTen
                );
              }
            }
            if (weeklyTips.bottomTenSelection === game[0].loser) {
              bottomTenCorrect = false;
              if (weeklyTips.marginBottomTen) {
                bottomTenCalculatedMargin =
                  game[0].margin + weeklyTips.marginBottomTen;
              }
            }
          });

          // console.log(
          //   `Top 8 Selection: ${weeklyTips.topEightSelection} Correct: ${topEightCorrect} margin: ${topEightCalculatedMargin}`
          // );
          // console.log(
          //   `Bottom 10 Selection: ${weeklyTips.bottomTenSelection} Correct: ${bottomTenCorrect} margin: ${bottomTenCalculatedMargin}`
          // );

          let correctTips = 0;
          if (topEightCorrect) {
            ++correctTips;
          }
          if (bottomTenCorrect) {
            ++correctTips;
          }
          // console.log(correctTips);

          return API.postCalcResults({
            correctTips: correctTips,
            topEightCorrect: topEightCorrect,
            bottomTenCorrect: bottomTenCorrect,
            topEightDifference: topEightCalculatedMargin,
            bottomTenDifference: bottomTenCalculatedMargin,
            round: weeklyTips.round,
            user: weeklyTips.user,
          });
        });
        // retreive the tips that wev've just put into the database to calcualte the winner and then put that on the database
        API.getCalcResults(roundCalculation).then((results) => {
          console.log(results.data.data.tips);

          let roundResults = results.data.data.tips;
          let roundEntrants = null;

          // check if round is finished - only add winnings(round entrants if complete)
          for (let index = 0; index < roundResults.length; index++) {
            if (
              roundResults[index].bottomTenCorrect === null ||
              roundResults[index].topEightCorrect === null
            ) {
              console.log("we havnt finished the round yet");
              return;
            } else {
              roundEntrants = roundResults[index].length;
            }
          }

          // number of entrants to calculate winnings
          let filtered = roundResults.filter((filter) => {
            return filter.correctTips === 2;
          });
          if (!filtered.length) {
            filtered = roundResults.filter((filter) => {
              return filter.correctTips === 1;
            });
          }
          console.log(filtered);

          let lowestMargin = 200;
          let lowestMarginUser = [];

          for (var i = 0; i < filtered.length; i++) {
            if (
              (filtered[i].topEightDifference ||
                filtered[i].bottomTenDifference) < lowestMargin
            ) {
              // new high score so start a new array with this user in it
              lowestMarginUser = [filtered[i].user];
              lowestMargin =
                filtered[i].topEightDifference ||
                filtered[i].bottomTenDifference;
            } else if (
              (filtered[i].topEightDifference ||
                filtered[i].bottomTenDifference) === lowestMargin
            ) {
              // more than one user with the lowest difference so add this one to the array
              lowestMarginUser.push(filtered[i].user);
            }
          }

          console.log(lowestMarginUser + " " + lowestMargin);
          API.postRoundWinner({
            user: lowestMarginUser,
            round: roundCalculation,
            winnings: roundEntrants,
          });
        });
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
      <h3>Admin Tools</h3>
      <p>Manually download fixtures/results</p>
      <Button variant="contained" color="primary" onClick={getFixture}>
        Download Fixtures
      </Button>
      <p>function run after the completion of each round</p>
      <Button variant="contained" color="primary" onClick={getStandings}>
        Download Standings
      </Button>
      <p>function that calculates tipsters results for the round</p>
      <Button
        variant="contained"
        color="primary"
        onClick={() => calcResults(roundCalculation)}
      >
        Calculate Results
      </Button>{" "}
      <TextField
        label="Round"
        variant="outlined"
        type="number"
        onChange={handleRoundChangeForDowload}
        inputProps={{
          min: 0,
          max: 22,
          style: { textAlign: "center" },
        }}
        style={{ width: 80 }}
      />
      <p>Only required once - Downloads team information(logos, names etc)</p>
      <Button variant="contained" color="primary" onClick={getTeams}>
        Download Teams
      </Button>
    </div>
  );
};

export default AdminComponent;
