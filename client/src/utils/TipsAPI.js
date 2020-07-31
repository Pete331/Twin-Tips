import axios from "axios";

const season = "2020";
// const round = "1";
const fixtureUrlAll = `https://api.squiggle.com.au/?q=games;year=${season}`;
// const fixtureUrlRound = `https://api.squiggle.com.au/?q=games;year=${season};round=${round}`;

export default {
  getFixture: function () {
    return axios.get(fixtureUrlAll, {
      withCredentials: false,
    });
  },

  getModels: function (round) {
    return axios.get(`https://api.squiggle.com.au/?q=tips;year=${season};round=${round};source=8`, {
      withCredentials: false,
    });
  },

  postFixture: function (data) {
    return axios.post("/api/fixtures/", data);
  },

  getTeams: function () {
    return axios.get("https://api.squiggle.com.au/?q=teams", {
      withCredentials: false,
    });
  },

  postTeams: function (data) {
    return axios.post("/api/teams/", data);
  },

  getStandings: function () {
    return axios.get("https://api.squiggle.com.au/?q=standings", {
      withCredentials: false,
    });
  },

  postStandings: function (data) {
    return axios.post("/api/standings/", data);
  },

  getDetails: function () {
    return axios.get("/api/details/");
  },

  getRoundDetails: function (round) {
    return axios.get(`/api/details/${round}`);
  },

  postTips: function (data) {
    // console.log(data);
    return axios.post("/api/tips/", data);
  },

  getCurrentRound: function () {
    return axios.get("/api/currentRound/");
  },

  getRoundResult: function (data) {
    // console.log(data);
    return axios.post("/api/roundResult/", data);
  },

  getCurrentRoundTips: function (data) {
    // console.log(data);
    return axios.post("/api/userRoundTips/", data);
  },
  getPreviousRoundTips: function (data) {
    // console.log(data);
    return axios.post("/api/userRoundTips/", data);
  },

  getResults: function () {
    return axios.get("/api/results/");
  },

  getCalcResults: function (resultRound) {
    return axios.post("/api/calculateResults/", resultRound);
  },

  postCalcResults: function (data) {
    return axios.post("/api/inputCalculatedResults/", data);
  },

  postRoundWinner: function (data) {
    return axios.post("/api/roundWinner/", data);
  },

  getLeaderboard: function () {
    return axios.get("/api/leaderboard/");
  },

  getUserDetails: function (data) {
    return axios.post("/api/users/", data);
  },
};
