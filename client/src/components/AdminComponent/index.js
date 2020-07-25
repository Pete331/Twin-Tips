import React from "react";
import Button from "@material-ui/core/Button";
import API from "../../utils/TipsAPI";

const resultRound = { round: 5 };

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
          // sets loser team
          let loser = {};
          if (fixture.winner !== fixture.hteam) {
            loser = fixture.hteam;
          } else {
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
          let topEightCorrect = false;
          let topEightCalculatedMargin = null;
          let bottomTenCorrect = false;
          let bottomTenCalculatedMargin = null;

          console.log(winnersData);

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

          console.log(
            `Top 8 Selection: ${weeklyTips.topEightSelection} Correct: ${topEightCorrect} margin: ${topEightCalculatedMargin}`
          );
          console.log(
            `Bottom 10 Selection: ${weeklyTips.bottomTenSelection} Correct: ${bottomTenCorrect} margin: ${bottomTenCalculatedMargin}`
          );

          return API.postCalcResults({
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
