import { useState, useEffect, useContext, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import SettingsIcon from "@mui/icons-material/Settings";
import Alerts from "../../components/Alerts";
import LeagueSetup from "../../components/LeagueSetup";
import { SeasonContext } from "../../utils/SeasonContext";
import LeagueAPI from "../../utils/LeagueAPI";
import Updating from "../../components/Updating";
import { describeRequestError } from "../../utils/http";
import {
  PageSkeleton,
  Panel,
  TitleSkeleton,

  TableSkeleton,
} from "../../components/Skeletons";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AddIcon from "@mui/icons-material/Add";
import LoginIcon from "@mui/icons-material/Login";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { MENU_BELOW, menuBelow } from "../../utils/selectMenu";
import { tintBySign } from "../../utils/resultTint";
import { WEEKLY, SEASON, typeName } from "../../utils/leagueTypes";
import Container from "@mui/material/Container";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

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

// Eight rows rather than the five a form field gets. This menu ends with Create
// and Join under a divider, and the whole point of moving them here was to stop
// them sitting behind a scroll - a cap that hid them would put them straight
// back there for anyone in more than a couple of leagues.
const LADDER_MENU = menuBelow(8);

// How the two rows below the divider are marked out from the ladders above
// them. The divider says where the list of ladders stops; this says what the
// rest of it is, for the glance that never reaches the line.
//
// The theme's own action colour rather than a new one - it is already what a
// link and a contained button are painted, so these read as the same kind of
// thing rather than as a third convention. On white it measures 4.6:1, which
// clears AA for text this size.
const ACTION_ROW = {
  color: "primary.main",
  // ListItemIcon paints itself a neutral grey regardless of the row it is in,
  // so without this the words turn blue and the icon beside them does not.
  "& .MuiListItemIcon-root": { color: "inherit" },
};

// A round's pot is split between however many people tied for it, so winnings
// are frequently thirds. Without rounding the table prints values like
// $179.16666666666669.
const money = (amount) => {
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

// A season total: correct tips, with the margin that separates ties beside it.
//
// "25 (251)" rather than two columns, because they are not two independent
// figures - the margin only ever decides who is ahead when the tips are level.
// Putting it in brackets says that, and matches how the weekly table already
// prints a count with its consequence: "25 ($125)".
//
// The bracket is dropped where there is no margin to state. A season ladder
// starts everyone at 0 and only adds, so this is really about the global
// ladder, which passes stored rows through and may hold one written before
// margins were kept. "25 ()" would read as a fault rather than an absence.
const seasonTotal = (row) =>
  Number.isFinite(row.marginError)
    ? `${row.correctTips} (${row.marginError})`
    : String(row.correctTips);

const Leaderboard = () => {
  const { seasonState, availableSeasons } = useContext(SeasonContext);
  const location = useLocation();

  const [isLoading, setIsLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  // Which table to show: a league's slug, or the global ladder.
  const [scope, setScope] = useState(null);
  // Starts empty and follows the server's current season, rather than opening
  // on a year that was hardcoded when the page was written.
  const [season, setSeason] = useState(null);
  const [table, setTable] = useState(null);
  const [error, setError] = useState(null);

  // Changing ladder or season left the previous table sitting there until the
  // new one arrived, with nothing to say so. isLoading only covers the first
  // paint - by the time anyone touches a picker there is a table on screen, so
  // this fades it rather than replacing it with a skeleton.
  const [updating, setUpdating] = useState(false);
  // A late reply from the ladder just moved off must not land on the new one.
  const request = useRef(0);
  const alertRef = useRef();

  // The ladder menu, and the sheet it can open.
  const [anchor, setAnchor] = useState(null);
  const [setup, setSetup] = useState(null);

  // Which sheet the menu asked for, held until the menu has finished closing.
  //
  // Both want the focus. The menu returns it to the button it came from as it
  // exits, and the sheet traps it on the way in; opening the sheet on the click
  // means the two run over each other and focus can end up behind the sheet.
  // Waiting for the exit transition makes it a handover rather than a race.
  const pending = useRef(null);

  const openSetup = (which) => {
    pending.current = which;
    setAnchor(null);
  };

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

    const batch = ++request.current;
    const current = () => request.current === batch;
    setUpdating(true);

    const pending =
      scope === GLOBAL
        ? LeagueAPI.global(season)
        : LeagueAPI.standings(scope, season);

    pending
      .then((res) => current() && setTable(res.data))
      .catch((err) => {
        if (!current()) return;
        setTable(null);
        // This used to prefer the server's message unconditionally, which is
        // right for "You are not a member of this league" and wrong for
        // everything else: the server answers a bad request and an unknown URL
        // in the same shape, so a broken ladder call put the words "No such
        // API route." on screen for someone tipping football. The helper keeps
        // the server's wording only for the statuses that carry one written
        // for a person.
        setError(describeRequestError(err));
      })
      .finally(() => {
        if (!current()) return;
        setIsLoading(false);
        setUpdating(false);
      });
  }, [scope, season]);


  const current = leagues.find((l) => l.slug === scope);
  // Winnings only mean something where there is a pool each round. The global
  // ladder and a season-ladder league are both ranked on tips and margin.
  const isWeekly = Boolean(current && current.type === "weekly");
  const buyIn = (table && table.buyIn) || 0;
  const rows = (table && table.standings) || [];

  const heading =
    scope === GLOBAL ? "Global Ladder" : current ? current.name : "Leaderboard";

  // What kind of table this is, and nothing more.
  //
  // It used to spell out the scoring as well - "ranked on winnings", "ranked
  // on correct tips then closest margin" - which is the one thing this page
  // does not need to say. The columns are Entries, Winnings and Balance, or
  // Rounds and Total, and the table is plainly sorted: the sentence was
  // describing the picture directly beneath it.
  //
  // typeBlurb still carries that explanation where it earns its place - the
  // league page and the create form, where someone is choosing a type or
  // meeting one for the first time rather than reading its table.
  //
  // The buy-in stays. It is a fact about the league rather than a restatement
  // of the table, and recovering it from "25 ($125)" is arithmetic nobody
  // should have to do. Worded as the leagues list words it.
  const subtitle =
    scope === GLOBAL
      ? "Everyone in Twin Tips"
      : isWeekly
      ? `${typeName(WEEKLY)} · $${buyIn} a round`
      : typeName(SEASON);

  return (
    <div>
      {isLoading ? (
        <PageSkeleton maxWidth={false} sx={{ maxWidth: TABLE_WIDTH }}>
          {/* Matches the new title row. The pickers used to sit in a panel
              under the heading; the league one is the heading now, so the
              skeleton is a title and a subtitle. Keeping the two shapes the
              same is what holds the layout still when the real thing lands. */}
          <TitleSkeleton subtitle />
          <Panel>
            <TableSkeleton rows={7} columns={3} />
          </Panel>
        </PageSkeleton>
      ) : (
        <Container maxWidth={false} sx={{ maxWidth: TABLE_WIDTH }}>
          {/* The league picker is the page title.
              
              It used to be a labelled control inside the panel below, under a
              heading that repeated whatever it was set to - the page said the
              league's name twice and spent a row of the panel doing it. As the
              title it says the name once, and the arrow beside it is the whole
              of the affordance.
              
              No visible label. "Ladder" as a caption above a title is a word
              about the control rather than about the page, and the list holds
              the Global Ladder as well as your leagues, so no single noun fits
              both. The accessible name still says Ladder, because a screen
              reader gets no arrow to go on. */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1,
              mb: 0.5,
            }}
          >
            {/* A Menu rather than a Select, now that two of the rows are things
                to do rather than ladders to look at.

                A Select is a form field: everything in its list is a value the
                field can take, and that is what a screen reader is told. But
                creating a league is not a value this control can hold - picking
                it has to leave the title on whatever ladder you were reading -
                so as Select options those two rows would be announced as a
                choice they cannot honour. A Menu carries destinations and
                actions side by side without pretending otherwise.

                It also drops the FormControl, which was here only to wrap the
                field. That wrapper is what used to put the gear out of line: a
                standard FormControl reserves 16px above its input for a label
                to float into, and the label here was visuallyHidden, so the
                space was held for something never drawn. A Button has no such
                rule to work around. */}
            <Button
              onClick={(event) => setAnchor(event.currentTarget)}
              endIcon={<ArrowDropDownIcon />}
              aria-label="Ladder"
              aria-haspopup="menu"
              aria-expanded={anchor ? true : undefined}
              sx={{
                // Typed as the h5 it stands in for, so the page's title is
                // still a title rather than body text in a button.
                fontSize: "1.5rem",
                fontWeight: 500,
                lineHeight: 1.334,
                textTransform: "none",
                color: "text.primary",
                p: 0,
                minWidth: 0,
                "& .MuiButton-endIcon": { ml: 0.25 },
              }}
            >
              {heading}
            </Button>
            <Menu
              anchorOrigin={LADDER_MENU.anchorOrigin}
              transformOrigin={LADDER_MENU.transformOrigin}
              anchorEl={anchor}
              open={Boolean(anchor)}
              onClose={() => setAnchor(null)}
              slotProps={{
                ...LADDER_MENU.slotProps,
                // The handover described above: the sheet opens once the menu
                // has finished leaving, not while it is on its way out.
                transition: {
                  onExited: () => {
                    if (!pending.current) return;
                    setSetup(pending.current);
                    pending.current = null;
                  },
                },
              }}
            >
              {leagues.map((league) => (
                <MenuItem
                  key={league.slug}
                  selected={scope === league.slug}
                  onClick={() => {
                    setScope(league.slug);
                    setAnchor(null);
                  }}
                >
                  {league.name}
                </MenuItem>
              ))}
              <MenuItem
                selected={scope === GLOBAL}
                onClick={() => {
                  setScope(GLOBAL);
                  setAnchor(null);
                }}
              >
                Global Ladder
              </MenuItem>

              {/* Below the line, the two things you can do - as against the
                  ladders above it, which are things you can read. */}
              <Divider />
              <MenuItem sx={ACTION_ROW} onClick={() => openSetup("create")}>
                <ListItemIcon>
                  <AddIcon fontSize="small" />
                </ListItemIcon>
                Create a league
              </MenuItem>
              <MenuItem sx={ACTION_ROW} onClick={() => openSetup("join")}>
                <ListItemIcon>
                  <LoginIcon fontSize="small" />
                </ListItemIcon>
                Join with a code
              </MenuItem>
            </Menu>

            {/* Hidden on the global ladder, not disabled. There is nothing to
                administer - no members to invite, no name to change, nobody to
                hand it to - and a greyed gear invites the click it is going to
                refuse. */}
            {scope !== GLOBAL && current ? (
              <Tooltip title={`${current.name} settings`}>
                <IconButton
                  component={Link}
                  to={`/leagues/${current.slug}`}
                  aria-label={`${current.name} settings`}
                  size="small"
                >
                  <SettingsIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}

            {/* Pushed to the far end so it reads as a filter on the title
                rather than part of it. Four digits, so it is sized to what it
                holds. */}
            {/* Same phantom label removed here. This one is alone on its side
                so nothing was visibly out of line with it - but it was the
                tallest thing in the row, so it set the row's height and the
                gear centred against that. */}
            <FormControl variant="standard" sx={{ width: 84, ml: "auto" }}>
              <Select
                MenuProps={MENU_BELOW}
                SelectDisplayProps={{ "aria-label": "Season" }}
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

          <Typography sx={{ color: "text.secondary", mb: 2 }}>
            {subtitle}
          </Typography>
          <Alerts ref={alertRef} />
          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              mb: 2,
              bgcolor: "background.paper",
            }}
          >
            {error ? <p>{error}</p> : null}

            {!error && !rows.length ? (
              <p>Nothing to show for {season} yet.</p>
            ) : null}

            {/* Same containment as the dashboard's table. An overflowing table
                takes the whole page sideways with it. */}
            {rows.length ? (
              <Updating busy={updating}>
                <TableContainer>
                  <Table aria-label={`${heading} standings`}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Player</TableCell>
                        {isWeekly ? (
                          <>
                            <TableCell align="right">Entries (cost)</TableCell>
                            <TableCell align="right">Winnings</TableCell>
                            <TableCell align="right">Balance</TableCell>
                          </>
                        ) : (
                          <>
                            {/* Rounds first, then the total it produced - the
                                input before the result, and it keeps the figure
                                the table is sorted on next to the names. */}
                            <TableCell align="right">Rounds</TableCell>
                            <TableCell align="right">Total</TableCell>
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
                              {/* The shared tints, from utils/resultTint.

                                  No arrow or sign beside them, unlike the ticks
                                  on the round table. There the colour was the
                                  only thing saying whether a tip came off; here
                                  the number already carries a minus, so a mark
                                  would only repeat what is written. */}
                              <TableCell
                                align="right"
                                style={{ backgroundColor: tintBySign(row.net) }}
                              >
                                ${money(row.net * buyIn)}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell align="right">
                                {row.roundsTipped}
                              </TableCell>
                              <TableCell align="right">
                                {seasonTotal(row)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Updating>
            ) : null}
          </Box>

          {/* The one case where this page cannot answer the question it exists
              to answer. You are in no league, so the ladder above is everyone
              in Twin Tips - true, and not what you came for.

              Said out loud rather than left to the menu. The two doors are in
              the picker now, which is the right place for them once you know
              they are there, and no place at all on the day you signed up. */}
          {!leagues.length ? (
            <Box sx={{ mt: 3, textAlign: "center" }}>
              <Typography sx={{ color: "text.secondary", mb: 1.5 }}>
                You are not in a league yet.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setSetup("create")}
                sx={{ mr: 1 }}
              >
                Create a league
              </Button>
              <Button
                variant="outlined"
                startIcon={<LoginIcon />}
                onClick={() => setSetup("join")}
              >
                Join with a code
              </Button>
            </Box>
          ) : null}

          {/* Opened from the picker above, or from the empty state. Rendered
              here rather than in the menu so that closing the menu does not
              take the sheet with it. */}
          <LeagueSetup
            mode={setup}
            onClose={() => setSetup(null)}
            say={(type, message) =>
              alertRef.current && alertRef.current.createAlert(type, message, true)
            }
            onJoined={(slug) => {
              // The picker's list is stale the moment a league is joined, so
              // reload it and move to what was just joined.
              LeagueAPI.mine()
                .then((res) => setLeagues(res.data.leagues || []))
                .catch(() => {})
                .finally(() => setScope(slug));
            }}
          />
        </Container>
      )}
    </div>
  );
};

export default Leaderboard;
