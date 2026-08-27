import { useContext } from "react";
import Box from "@mui/material/Box";
import { SeasonContext } from "../../utils/SeasonContext";

// Says so, loudly, when the server is pretending it is some other date.
//
// The flag comes from the server and can only be true on a development
// machine - utils/devClock.js refuses to start with TIME_TRAVEL set in
// production. So this renders nothing in the deployed app, and there is no
// switch here for anyone to find.
//
// It is worth being ugly. The failure this prevents is spending ten minutes
// puzzling over a round that does not match the calendar, or worse, reporting
// a bug that is really just yesterday's override still running.
const TimeTravelBanner = () => {
  const { seasonState } = useContext(SeasonContext);

  if (!seasonState || !seasonState.timeTravelling) return null;

  const pretending = seasonState.serverTime
    ? new Date(seasonState.serverTime).toString()
    : "another date";

  return (
    <Box
      role="status"
      sx={{
        backgroundColor: "#8a4b00",
        color: "common.white",
        textAlign: "center",
        px: 2,
        py: 1,
        fontWeight: 700,
      }}
    >
      Time travel is on - the server is pretending it is {pretending}. Season,
      round and lockout all follow that, not the calendar.
    </Box>
  );
};

export default TimeTravelBanner;
