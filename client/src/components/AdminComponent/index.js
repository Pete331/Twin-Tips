import React from "react";
import Button from "@material-ui/core/Button";
import API from "../../utils/TipsAPI";

const resultRound = { round: 7 };

const AdminComponent = () => {
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

  // function that retrieves selections from database and calculates if got tips correct and the margin
  function calcResults() {
    API.getCalcResults(resultRound)
      .then((results) => {
        const fixtures = results.data.data.fixture;
        const tips = results.data.data.tips;
        // console.log(fixtures);
        // console.log(tips);
        const winnersData = [];
        fixtures.map((fixture) => {
          winnersData.push([
            {
              winner: fixture.winner,
              hometeam: fixture.hteam,
              margin: fixture.hscore - fixture.ascore,
            },
          ]);
        });
        tips.map((weeklyTips) => {
          let topEightCorrect = false;
          let gameMargin = null;
          let topEightCalculatedMargin = null;
          let bottomTenCorrect = false;
          let bottomTenCalculatedMargin = null;

          // console.log(winnersData);
          winnersData.forEach((game) => {
            // console.log(game[0].margin);
            if (game[0].hometeam === game[0].winner) {
              gameMargin = game[0].margin;
            } else {
              gameMargin = Math.abs(game[0].margin);
            }
            // console.log(gameMargin);

            if (weeklyTips.topEightSelection === game[0].winner) {
              topEightCorrect = true;
            }
            if (weeklyTips.bottomTenSelection === game[0].winner) {
              bottomTenCorrect = true;
            }
          });
          console.log(
            `Top 8 Selection: ${weeklyTips.topEightSelection} Correct: ${topEightCorrect}`
          );
          console.log(
            `Top 8 Selection: ${weeklyTips.bottomTenSelection} Correct: ${bottomTenCorrect}`
          );
          if (weeklyTips.marginTopEight && topEightCorrect) {
            topEightCalculatedMargin = gameMargin - weeklyTips.marginTopEight;
            console.log(
              `Calculated difference for top 8 selection: ${topEightCalculatedMargin}`
            );
          }
          if (weeklyTips.marginTopEight && !topEightCorrect) {
            topEightCalculatedMargin = gameMargin + weeklyTips.marginTopEight;
            console.log(
              `Calculated difference for top 8 selection: ${topEightCalculatedMargin}`
            );
          }
          if (weeklyTips.marginBottomTen && bottomTenCorrect) {
            bottomTenCalculatedMargin = gameMargin - weeklyTips.marginBottomTen;
            console.log(
              `Calculated difference for bottom 10 selection: ${bottomTenCalculatedMargin}`
            );
          }
          if (weeklyTips.marginBottomTen && !bottomTenCorrect) {
            bottomTenCalculatedMargin = gameMargin + weeklyTips.marginBottomTen;
            console.log(
              `Calculated difference for bottom 10 selection: ${bottomTenCalculatedMargin}`
            );
          }
          API.postCalcResults({
            topEightCorrect: topEightCorrect,
            bottomTenCorrect: bottomTenCorrect,
            topEightDifference: topEightCalculatedMargin,
            bottomTenDifference: bottomTenCalculatedMargin,
            round: weeklyTips.round,
            user: weeklyTips.user,
          });
        });
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
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
      <Button
        variant="contained"
        color="primary"
        onClick={() => calcResults(resultRound)}
      >
        Calculate Results
      </Button>
    </div>
  );
};

export default AdminComponent;
