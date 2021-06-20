import API from "./TipsAPI";

export default function calcResults(roundCalculation) {
  API.getCalcResults(roundCalculation)
    .then((results) => {
      const fixtures = results.data.data.fixture;
      const tips = results.data.data.tips;
      // console.log(fixtures);
      // console.log(tips);
      // if no tips then stop calculation
      if (tips.length === 0) {
        return;
      }
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
            awayteam: fixture.ateam,
            margin: Math.abs(fixture.hscore - fixture.ascore),
          },
        ]);
      });

      console.log(winnersData);

      tips.map((weeklyTips) => {
        let topEightCorrect = null;
        let topEightCalculatedMargin = null;
        let bottomTenCorrect = null;
        let bottomTenCalculatedMargin = null;

        // console.log(winnersData);

        // I think need to check for draw before each cycle and do calc before checking further

        winnersData.forEach((game) => {
          // sets true if correct tip
          if (game[0].winner !== null) {
            if (weeklyTips.topEightSelection === game[0].winner) {
              topEightCorrect = true;
              if (weeklyTips.marginTopEight) {
                topEightCalculatedMargin = Math.abs(
                  game[0].margin - weeklyTips.marginTopEight
                );
              }
            } else if (weeklyTips.topEightSelection === game[0].loser) {
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
            } else if (weeklyTips.bottomTenSelection === game[0].loser) {
              bottomTenCorrect = false;
              if (weeklyTips.marginBottomTen) {
                bottomTenCalculatedMargin =
                  game[0].margin + weeklyTips.marginBottomTen;
              }
            }
          } else {
            // deal with drawn game
            console.log("we have a draw");
            if (
              weeklyTips.topEightSelection === game[0].hometeam ||
              weeklyTips.topEightSelection === game[0].awayteam
            ) {
              topEightCorrect = false;
              if (weeklyTips.marginTopEight) {
                topEightCalculatedMargin =
                  game[0].margin + weeklyTips.marginTopEight;
              }
            } else if (
              weeklyTips.bottomTenSelection === game[0].hometeam ||
              weeklyTips.bottomTenSelection === game[0].awayteam
            ) {
              bottomTenCorrect = false;
              if (weeklyTips.marginBottomTen) {
                bottomTenCalculatedMargin =
                  game[0].margin + weeklyTips.marginBottomTen;
              }
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
        // console.log(results.data.data.tips);

        let roundResults = results.data.data.tips;
        let roundEntrants = null;

        // check if round is finished - only add winnings(round entrants if complete)
        for (let index = 0; index < roundResults.length; index++) {
          if (
            roundResults[index].bottomTenCorrect === null ||
            roundResults[index].topEightCorrect === null
          ) {
            // console.log("we havnt finished the round yet");
            return;
          } else {
            roundEntrants = roundResults.length;
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
        if (!filtered.length) {
          filtered = roundResults.filter((filter) => {
            return filter.correctTips === 0;
          });
        }
        console.log("users with highest number of tips ");
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
              filtered[i].topEightDifference || filtered[i].bottomTenDifference;
          } else if (
            (filtered[i].topEightDifference ||
              filtered[i].bottomTenDifference) === lowestMargin
          ) {
            // more than one user with the lowest difference so add this one to the array
            lowestMarginUser.push(filtered[i].user);
          }
        }

        console.log(lowestMarginUser + " " + lowestMargin);
        // console.log(lowestMarginUser.length);
        // console.log(roundEntrants/lowestMarginUser.length);
        API.postRoundWinner({
          user: lowestMarginUser,
          round: roundCalculation,
          winnings: roundEntrants / lowestMarginUser.length,
        });
      });
    })
    .catch((err) => console.log(err));
}
