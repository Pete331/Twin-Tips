import { useState, useEffect, useContext, useRef } from "react";
import { useLocation } from "react-router-dom";
import { SeasonContext } from "../../utils/SeasonContext";
import LeagueAPI from "../../utils/LeagueAPI";
import Loader from "../../components/Loader";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { MENU_BELOW } from "../../utils/selectMenu";
import { makeStyles } from "../../utils/muiStyles";
import InputLabel from "@mui/material/InputLabel";
import Container from "@mui/material/Container";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

// Defined once, at module scope. Called inside the component body it rebuilt
// the style object and re-serialised it through emotion on every render, which
// is exactly what defining it once is meant to avoid.
const useStyles = makeStyles(() => ({
  // Fixed rather than minWidth. A width that follows its contents makes this
  // jump every time you choose a league with a longer name, which reads as the
  // page rearranging itself.
  ladderPicker: {
    width: 200,
  },
  // Four digits. Sizing it like the ladder picker just left a wide empty box.
  seasonPicker: {
    width: 100,
  },
}));

// One width for every ladder. The container used to switch between sm and md
// by league type, so changing the picker resized the whole page - the opposite
// of what a picker should feel like. The tables carry different columns; the
// frame around them should not move.
//
// A maximum rather than a fixed width, so the frame is identical on a desktop
// and still fits a phone. Applied with maxWidth={false} on the Container,
// which turns off its own breakpoint rules - those are media queries, and they
// would otherwise fight the sx value.
const TABLE_WIDTH = 550;

// The global ladder is one of the options in the league picker rather than a
// page of its own. It answers the same question - where does everyone stand -
// over the widest possible group.
const GLOBAL = "__global__";

// A round's pot is split between however many people tied for it, so winnings
// are frequently thirds. Without rounding the table prints values like
// $179.16666666666669.
const money = (amount) => {
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const Leaderboard = () => {
  const { seasonState, availableSeasons } = useContext(SeasonContext);
  const location = useLocation();
  const classes = useStyles();

  const [isLoading, setIsLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  // Which table to show: a league's slug, or the global ladder.
  const [scope, setScope] = useState(null);
  // Starts empty and follows the server's current season, rather than opening
  // on a year that was hardcoded when the page was written.
  const [season, setSeason] = useState(null);
  const [table, setTable] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (seasonState && season === null) setSeason(seasonState.season);
  }, [seasonState, season]);

  // Opens on the league you have been in longest, which for almost everyone is
  // the only one they are in. The global ladder is a deliberate second choice
  // rather than the default - people care where they stand among the people
  // they play against.
  useEffect(() => {
    // A league named in the URL wins, which is how "See the standings" on a
    // league's own page opens on that one. Ignored when you are not a member,
    // rather than showing an empty table for a league you cannot read.
    const asked = new URLSearchParams(location.search).get("league");

    LeagueAPI.mine()
      .then((res) => {
        const mine = res.data.leagues || [];
        setLeagues(mine);

        const named = mine.find((l) => l.slug === asked);
        setScope(
          (current) =>
            (named && named.slug) ||
            current ||
            (mine.length ? mine[0].slug : GLOBAL)
        );
      })
      .catch(() => {
        setLeagues([]);
        setScope((current) => current || GLOBAL);
      });
  }, [location.search]);

  useEffect(() => {
    if (!scope || season === null) return;

    setError(null);

    const request =
      scope === GLOBAL
        ? LeagueAPI.global(season)
        : LeagueAPI.standings(scope, season);

    request
      .then((res) => setTable(res.data))
      .catch((err) => {
        setTable(null);
        setError(
          (err.response && err.response.data && err.response.data.message) ||
            "Unable to load the ladder."
        );
      })
      .finally(loadingTimeout);
  }, [scope, season]);

  // Held in a ref so it can actually be cancelled. This used to call
  // clearTimeout(this), where `this` is not the timer handle and the call does
  // nothing - leaving a timer that fires after the component has gone and sets
  // state on it.
  const loadingTimer = useRef();
  useEffect(() => () => clearTimeout(loadingTimer.current), []);

  const loadingTimeout = () => {
    clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setIsLoading(false), 100);
  };

  const current = leagues.find((l) => l.slug === scope);
  // Winnings only mean something where there is a pool each round. The global
  // ladder and a season-ladder league are both ranked on tips and margin.
  const isWeekly = Boolean(current && current.type === "weekly");
  const buyIn = (table && table.buyIn) || 0;
  const rows = (table && table.standings) || [];

  const heading =
    scope === GLOBAL ? "Global ladder" : current ? current.name : "Leaderboard";

  // What kind of table this is, in the same words the league's own page uses.
  // The two tables look different but nothing on the page said why, so a
  // reader landing on one had to work out which competition they were reading.
  const subtitle =
    scope === GLOBAL
      ? "Everyone in Twin Tips, ranked on correct tips then closest margin."
      : isWeekly
      ? `A pool every round, $${buyIn} each. Ranked on winnings.`
      : "One ladder for the season, ranked on correct tips then closest margin.";

  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container maxWidth={false} sx={{ maxWidth: TABLE_WIDTH }}>
          <Typography variant="h5" component="h1">
            {heading}
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 2 }}>
            {subtitle}
          </Typography>
          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              mb: 2,
              bgcolor: "background.paper",
            }}
          >
            {/* Two pickers, same pattern as the round picker elsewhere. For
                almost everyone the league list is one entry plus the global
                ladder, so it is a control they will never need to touch.

                Laid out with gap rather than margins on each control, so the
                space between them is one number and they wrap cleanly on a
                narrow screen. */}
            <Box
              sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}
            >
            <FormControl className={classes.ladderPicker}>
              <InputLabel id="select-league">Ladder</InputLabel>
              <Select
                MenuProps={MENU_BELOW}
                labelId="select-league"
                label="Ladder"
                value={scope || ""}
                onChange={(event) => setScope(event.target.value)}
              >
                {leagues.map((league) => (
                  <MenuItem key={league.slug} value={league.slug}>
                    {league.name}
                  </MenuItem>
                ))}
                <MenuItem value={GLOBAL}>Global ladder</MenuItem>
              </Select>
            </FormControl>

            <FormControl className={classes.seasonPicker}>
              <InputLabel id="select-season">Season</InputLabel>
              <Select
                MenuProps={MENU_BELOW}
                labelId="select-season"
                label="Season"
                value={season || ""}
                onChange={(event) => setSeason(event.target.value)}
              >
                {/* Driven by whatever seasons the database actually holds, so
                    a new season appears here on its own. */}
                {availableSeasons.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            </Box>

            {error ? <p>{error}</p> : null}

            {!error && !rows.length ? (
              <p>Nothing to show for {season} yet.</p>
            ) : null}

            {/* Same containment as the dashboard's table. An overflowing table
                takes the whole page sideways with it. */}
            {rows.length ? (
              <TableContainer>
                <Table aria-label={`${heading} standings`}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Player</TableCell>
                      {isWeekly ? (
                        <>
                          <TableCell align="right">Entries (Cost)</TableCell>
                          <TableCell align="right">Winnings</TableCell>
                          <TableCell align="right">Balance</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell align="right">Correct tips</TableCell>
                          <TableCell align="right">Margin</TableCell>
                          <TableCell align="right">Rounds</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={String(row.user)}>
                        <TableCell>
                          {row.rank}. {row.username}
                        </TableCell>

                        {isWeekly ? (
                          <>
                            <TableCell align="right">
                              {row.entries} (${money(row.entries * buyIn)})
                            </TableCell>
                            <TableCell align="right">
                              ${money(row.winnings * buyIn)}
                            </TableCell>
                            <TableCell
                              align="right"
                              style={{
                                backgroundColor:
                                  row.net > 0
                                    ? "#50c878"
                                    : row.net < 0
                                    ? "#FF4D4D"
                                    : "",
                              }}
                            >
                              ${money(row.net * buyIn)}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell align="right">
                              {row.correctTips}
                            </TableCell>
                            <TableCell align="right">
                              {row.marginError}
                            </TableCell>
                            <TableCell align="right">
                              {row.roundsTipped}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}
          </Box>
        </Container>
      )}
    </div>
  );
};

export default Leaderboard;
