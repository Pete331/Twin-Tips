import React from "react";
import Grid from "@material-ui/core/Grid";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";

const DashboardCurrentRoundSelections = ({
  currentRound,
  currentRoundSelections,
}) => {
  return (
    <div>
      {currentRoundSelections ? (
        <div>
          <h6>Round {currentRound} Tips</h6>
          <h6>
            Top 8 Selection: {currentRoundSelections.topEightSelection}{" "}
            {currentRoundSelections.marginTopEight ? (
              <span>({currentRoundSelections.marginTopEight})</span>
            ) : (
              ""
            )}
          </h6>
          <h6>
            Bottom 10 Selection: {currentRoundSelections.bottomTenSelection}{" "}
            {currentRoundSelections.marginBottomTen ? (
              <span>({currentRoundSelections.marginBottomTen})</span>
            ) : (
              ""
            )}
          </h6>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default DashboardCurrentRoundSelections;
