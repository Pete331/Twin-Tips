import React from "react";

const DashboardCurrentRoundSelections = ({
  currentRound,
  currentRoundSelections,
}) => {
  return (
    <div>
      {currentRoundSelections ? (
        <div>
          <h6><b>Your Round {currentRound} Selections</b></h6>
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
