import axios from "axios";

// The season is no longer hardcoded here. SeasonProvider sets it from
// GET /api/season once the user is signed in, so the server decides which
// season the app is in. Where it is still null the request simply omits it and
// the server falls back to the current season, which keeps a stale build from
// pinning the app to whatever year it shipped with.
let season = null;

export const setSeason = (value) => {
  season = value;
};

export const getSeason = () => season;

// Squiggle is reached through our own server, never directly: their terms forbid
// visitors fetching from them, and they enforce it with an origin allowlist plus
// a required User-Agent that a browser cannot set. See routes/squiggle.js.

export default {
  setSeason,
  getSeason,

  getFixture: function () {
    return axios.get(`/api/squiggle/games?year=${season}`);
  },

  getRoundFixture: function (round) {
    return axios.get(`/api/squiggle/games?year=${season}&round=${round}`);
  },

  getModels: function (round) {
    return axios.get(
      `/api/squiggle/tips?year=${season}&round=${round}&source=8`
    );
  },

  postFixture: function (data) {
    const datanew = { data, season };
    return axios.post("/api/fixtures/", datanew);
  },

  postRoundFixture: function (data) {
    return axios.post("/api/roundFixtures/", data);
  },

  getTeams: function () {
    return axios.get("/api/squiggle/teams");
  },

  postTeams: function (data) {
    return axios.post("/api/teams/", data);
  },

  getStandingsDb: function () {
    return axios.get("/api/standingsDb");
  },

  getStandings: function () {
    return axios.get("/api/squiggle/standings");
  },

  postStandings: function (data) {
    return axios.post("/api/standings/", data);
  },

  getDetails: function () {
    return axios.get("/api/details/");
  },

  getRoundDetails: function (round) {
    const datanew = { round, year: season };
    // console.log(datanew);
    return axios.post("/api/detailsRound/", datanew);
  },

  postTips: function (data) {
    console.log(data);
    return axios.post("/api/tips/", data);
  },

  getCurrentRound: function () {
    console.log('Getting current round');
    return axios.post("/api/currentRound/", { season });
  },

  getRoundResult: function (data) {
    const datanew = { ...data, season };
    // console.log(datanew);
    return axios.post("/api/roundResult/", datanew);
  },

  getCurrentRoundTips: function (data) {
    const datanew = { data, season };
    // console.log(data);
    return axios.post("/api/userRoundTips/", datanew);
  },
  getPreviousRoundTips: function (data) {
    const datanew = { data, season };
    // console.log(data);
    return axios.post("/api/userRoundTips/", datanew);
  },

  getResults: function () {
    return axios.get("/api/results/");
  },

  getCalcResults: function (resultRound) {
    const datanew = { ...resultRound, year: season };
    // console.log(datanew);
    return axios.post("/api/calculateResults/", datanew);
  },

  postCalcResults: function (data) {
    return axios.post("/api/inputCalculatedResults/", data);
  },

  postRoundWinner: function (data) {
    return axios.post("/api/roundWinner/", data);
  },

  getLeaderboard: function (data) {
    return axios.post("/api/leaderboard/", data);
  },

  getUserDetails: function (data) {
    return axios.post("/api/users/", data);
  },

  deleteUser: function (data) {
    console.log(data);
    return axios.delete("/api/deleteUser/", data);
  },
};
