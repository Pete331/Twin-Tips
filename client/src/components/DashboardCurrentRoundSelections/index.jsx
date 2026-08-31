import Typography from "@mui/material/Typography";

const DashboardCurrentRoundSelections = ({
  currentRound,
  currentRoundSelections,
}) => {
  return (
    <div>
      {currentRoundSelections ? (
        <div>
          <Typography variant="h6" component="h2" gutterBottom>
            <b>Your round {currentRound} tips</b>
          </Typography>
          <Typography>
            Top 8 tip: {currentRoundSelections.topEightSelection}{" "}
            {currentRoundSelections.marginTopEight ? (
              <span>({currentRoundSelections.marginTopEight})</span>
            ) : (
              ""
            )}
          </Typography>
          <Typography>
            Bottom 10 tip: {currentRoundSelections.bottomTenSelection}{" "}
            {currentRoundSelections.marginBottomTen ? (
              <span>({currentRoundSelections.marginBottomTen})</span>
            ) : (
              ""
            )}
          </Typography>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default DashboardCurrentRoundSelections;
