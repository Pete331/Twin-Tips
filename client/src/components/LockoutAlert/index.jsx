import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const LockoutAlert = ({ lockout }) => {
  return (
    <Tooltip
      title="If a lockout is enforced, the round has started and you can no longer enter or edit your tips."
      enterDelay={500}
      leaveDelay={200}
      enterTouchDelay={0}
      leaveTouchDelay={5000}
      placement="bottom-start"
    >
      {/* The theme's error and success colours rather than the CSS keywords
          "red" and "green". Pure red on the page background measures 3.66:1,
          under the 4.5:1 that normal text needs to stay readable - and these
          two words are the whole message. */}
      <div>
        {lockout ? (
          <Typography variant="h6" component="p" gutterBottom>
            Lockout:{" "}
            <Box component="span" sx={{ color: "error.dark" }}>
              Yes
            </Box>
          </Typography>
        ) : (
          <Typography variant="h6" component="p" gutterBottom>
            Lockout:{" "}
            <Box component="span" sx={{ color: "success.dark" }}>
              No
            </Box>
          </Typography>
        )}
      </div>
    </Tooltip>
  );
};

export default LockoutAlert;
