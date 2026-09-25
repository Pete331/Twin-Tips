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
          {/* "by 46" rather than "(46)": the bracketed number said nothing
              about being a margin (UX audit finding #6). */}
          <Typography>
            Top 8 tip: {currentRoundSelections.topEightSelection}
            {currentRoundSelections.marginTopEight ? (
              <span> by {currentRoundSelections.marginTopEight}</span>
            ) : (
              ""
            )}
          </Typography>
          <Typography>
            Bottom 10 tip: {currentRoundSelections.bottomTenSelection}
            {currentRoundSelections.marginBottomTen ? (
              <span> by {currentRoundSelections.marginBottomTen}</span>
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
