import axios from "axios";

const season = "2021";
const fixtureUrlAll = `https://api.squiggle.com.au/?q=games;year=${season}`;
const squiggleCallOptions = {
  withCredentials: false,
  // headers: {
  //   Twin_Tips_Contact: "peter@agcorp.com.au",
  // },
};

export default {
  getFixture: function () {
    return axios.get(fixtureUrlAll, squiggleCallOptions);
  },

  getRoundFixture: function (round) {
    return axios.get(
      `https://api.squiggle.com.au/?q=games;year=${season};round=${round}`,
      squiggleCallOptions
    );
  },

  getModels: function (round) {
    return axios.get(
      `https://api.squiggle.com.au/?q=tips;year=${season};round=${round};source=8`,
      squiggleCallOptions
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
    return axios.get(
      "https://api.squiggle.com.au/?q=teams",
      squiggleCallOptions
    );
  },

  postTeams: function (data) {
    return axios.post("/api/teams/", data);
  },

  getStandingsDb: function () {
    return axios.get("/api/standingsDb");
  },

  getStandings: function () {
    return axios.get(
      "https://api.squiggle.com.au/?q=standings",
      squiggleCallOptions
    );
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
