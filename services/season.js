// Works out which season and round the competition is in, and whether tipping
// can run at all.
//
// Twin Tips asks you to pick one team from the top 8 of the ladder and one from
// the bottom 10. That only makes sense during the home-and-away season: in
// finals just the top eight play, and from the semi-finals onward the teams are
// not even known yet. So finals rounds are reported with tipping closed rather
// than shown as an empty round.

const db = require("../models");
const devClock = require("../utils/devClock");

// Squiggle names home-and-away rounds "Round N" and everything else
// descriptively - "Wildcard Finals", "Finals Week 1", "Semi-Finals",
// "Preliminary Finals", "Grand Final".
const isFinalsRoundName = (roundname) =>
  Boolean(roundname) && /final/i.test(roundname);

// is_final is a finals-type code, not a flag: 0 for home-and-away, and 2-7 for
// the various finals. Any non-zero value counts. roundname is kept as a
// fallback for fixtures stored before roundname was persisted.
const isFinalsFixture = (fixture) => {
  if (!fixture) return false;
  if (Number(fixture.is_final) > 0) return true;
  return isFinalsRoundName(fixture.roundname);
};

// The earliest kick-off among a round.s fixtures, or null if none of them
// carry a date. Pure, and exported, because the whole countdown hangs off this
// one value: get it wrong and the app tells people they have time they do not.
//
// Not simply roundFixtures[0].date. The caller happens to pass a list sorted by
// date, but that is the caller.s business - a round whose fixtures arrived in
// another order would otherwise silently produce a lockout at the wrong game.
const firstFixtureDate = (roundFixtures) => {
  const dates = roundFixtures
    .map((f) => f.date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  return dates.length ? dates[0] : null;
};

// The season to show: the most recent year we hold fixtures for. Deliberately
// derived from the data rather than the clock, so the app keeps working through
// the off-season instead of pointing at a year that has no fixtures yet.
const resolveSeason = async (requested) => {
  if (requested !== undefined && requested !== null && requested !== "") {
    const year = Number(requested);
    if (Number.isInteger(year)) return year;
  }

  const latest = await db.Fixture.findOne({}).sort({ year: -1 }).select("year");
  return latest ? latest.year : new Date().getFullYear();
};

// `now` is injectable so the mid-season paths can be tested without waiting for
// a season to come round.
// now defaults to the dev clock rather than new Date(), so every caller that
// asks what round it is agrees - the season route, and resolveSeason in
// api-routes, which decides the year a tip is filed under. They would
// otherwise disagree under an override, and the UI would show one round while
// tips went to another. Outside development devClock.now() is new Date().
//
// Still injectable, which is how the tests reach the mid-season paths.
const getSeasonState = async (requestedSeason, now = devClock.now()) => {
  const season = await resolveSeason(requestedSeason);

  const fixtures = await db.Fixture.find({ year: season }).sort({ date: 1 });

  if (!fixtures.length) {
    return {
      season,
      hasFixtures: false,
      currentRound: null,
      roundName: null,
      isFinals: false,
      tippingOpen: false,
      homeAndAwayComplete: false,
      seasonComplete: false,
      lockout: true,
      lockoutAt: null,
      serverTime: now,
      timeTravelling: devClock.isActive(),
      firstRound: null,
      lastHomeAndAwayRound: null,
      lastCompletedRound: null,
      rounds: [],
      message: `No fixtures loaded for ${season}.`,
    };
  }

  const homeAndAway = fixtures.filter((f) => !isFinalsFixture(f));

  const rounds = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b);
  const haRounds = [...new Set(homeAndAway.map((f) => f.round))].sort(
    (a, b) => a - b
  );

  // Round 0 is a real round in some seasons (the "Opening Round"), so the first
  // round is whatever the data says rather than an assumed 1.
  const firstRound = rounds.length ? rounds[0] : null;
  const lastHomeAndAwayRound = haRounds.length ? haRounds[haRounds.length - 1] : null;

  // The most recent round where every game has been played. Not the same as
  // the current round: when a round is upcoming its fixtures exist with no
  // scores, so a results view opening on currentRound would show 0-0
  // throughout.
  const playedRounds = rounds.filter((round) =>
    fixtures
      .filter((f) => f.round === round)
      .every((f) => Number(f.complete) === 100)
  );
  const lastCompletedRound = playedRounds.length
    ? playedRounds[playedRounds.length - 1]
    : null;

  const nextFixture = fixtures.find((f) => f.date && f.date > now);
  const lastFixture = [...fixtures].reverse().find((f) => f.date && f.date <= now);

  const seasonComplete = !nextFixture;
  const currentFixture = nextFixture || lastFixture;
  const currentRound = currentFixture ? currentFixture.round : lastHomeAndAwayRound;
  const roundName = currentFixture ? currentFixture.roundname || null : null;
  const isFinals = isFinalsFixture(currentFixture);

  const homeAndAwayComplete =
    lastHomeAndAwayRound === null ||
    !homeAndAway.some((f) => f.date && f.date > now);

  // Lockout means the current round has started, so selections are frozen.
  const roundFixtures = fixtures.filter((f) => f.round === currentRound);
  const roundStarted = roundFixtures.some((f) => f.date && f.date <= now);

  // The moment selections freeze: the first bounce of the current round.
  // Derived from the same fixtures as roundStarted just above, so a countdown
  // drawn from this can never disagree with the lockout it is counting toward.
  const lockoutAt = firstFixtureDate(roundFixtures);
  const lockout = seasonComplete || isFinals || roundStarted;

  const tippingOpen = !seasonComplete && !isFinals && !homeAndAwayComplete && !lockout;

  let message = null;
  if (seasonComplete) {
    message = `The ${season} season is over.`;
  } else if (isFinals || homeAndAwayComplete) {
    message =
      `The ${season} home-and-away season has finished, so there is no ` +
      `bottom 10 left to tip. Twin Tips returns next season.`;
  } else if (lockout) {
    message = `Round ${currentRound} has started - selections are locked.`;
  }

  return {
    season,
    hasFixtures: true,
    currentRound,
    roundName,
    isFinals,
    tippingOpen,
    homeAndAwayComplete,
    seasonComplete,
    lockout,
    lockoutAt,
    // The server clock, sent so the client can correct for a device whose own
    // clock is wrong. Without it a phone running ten minutes fast shows time
    // remaining on a round the server has already locked - the tip is refused
    // and the app looks broken rather than the clock.
    serverTime: now,
    // Only ever true on a development machine - devClock refuses to start in
    // production. The client renders a banner off this, so nobody spends ten
    // minutes puzzled by a round that does not match the calendar.
    timeTravelling: devClock.isActive(),
    firstRound,
    lastHomeAndAwayRound,
    lastCompletedRound,
    // Every round the season holds, finals included, so a results view can
    // offer them all rather than guessing at a range.
    rounds,
    message,
  };
};

// Which seasons the app holds data for, newest first - drives the leaderboard's
// season picker instead of a hardcoded list.
const getAvailableSeasons = async () => {
  const years = await db.Fixture.distinct("year");
  return years.filter((y) => Number.isInteger(y)).sort((a, b) => b - a);
};

module.exports = {
  firstFixtureDate,
  getSeasonState,
  getAvailableSeasons,
  isFinalsRoundName,
  isFinalsFixture,
};
