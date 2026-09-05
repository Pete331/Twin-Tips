import axios from "./http";

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

  // Whole-season and ladder downloads are gone: the server syncs those now, so
  // the browser no longer fetches from Squiggle and writes shared data back.
  // See services/seasonSync.js and SeasonAPI.sync.
  //
  // getRoundFixture and postRoundFixture went the same way. They pulled a
  // round from Squiggle and posted it into the fixtures collection, which
  // meant every signed-in visitor could rewrite match scores. Neither page
  // did anything with what came back - the fixtures they display are read
  // from the database.

  // Bookmaker prices for a round, read from what the cron stored - never from
  // the provider. The key lives on the cron service alone, so no number of
  // people opening this page can spend a credit. See routes/odds.js.
  getOdds: function (round) {
    const query = season ? `?season=${season}` : "";
    return axios.get(`/api/odds/${round}${query}`);
  },

  // Squiggle's prediction for each game in a round - the percentage and margin
  // shown in the middle of a fixture card.
  //
  // source 21 is s10, Squiggle's own ten-model ensemble. It replaces source 8,
  // the older Aggregate, which averaged every model that had submitted a tip.
  // Both endpoints answer with the same shape and the same coverage, so this is
  // a one-number change; what differs is which models are in the mix and how
  // they are weighted, and Squiggle now points both sources at the same
  // /introducing-s10/ page.
  //
  // A number rather than a name because that is what the API takes. The list
  // is at https://api.squiggle.com.au/?q=sources.
  getModels: function (round) {
    return axios.get(
      `/api/squiggle/tips?year=${season}&round=${round}&source=21`
    );
  },

  // The ladder a round is played against. Defaults to the current round.
  getStandingsDb: function (round) {
    const query = round === undefined || round === null ? "" : `?round=${round}`;
    return axios.get(`/api/standingsDb${query}`);
  },

  // getDetails is gone with GET /api/details. Use getRoundDetails: it asks for
  // one round and gets the ladder that applied when that round opened, rather
  // than every fixture of every season with every ladder snapshot attached.

  getRoundDetails: function (round) {
    const datanew = { round, year: season };
    // console.log(datanew);
    return axios.post("/api/detailsRound/", datanew);
  },

  postTips: function (data) {
    return axios.post("/api/tips/", data);
  },

  // getCurrentRound is gone along with its endpoint. GET /api/season reports
  // the round, worked out from fixture dates rather than a hand-set offset.

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

  getLeaderboard: function (data) {
    return axios.post("/api/leaderboard/", data);
  },

  getUserDetails: function (data) {
    return axios.post("/api/users/", data);
  },

  // The clubs, for the favourite team picker.
  getTeams: function () {
    return axios.get("/api/teams");
  },

  // Only favTeam is accepted, on purpose - see the route.
  updateFavouriteTeam: function (favTeam) {
    return axios.patch("/api/users/me", { favTeam });
  },

  // The server identifies the account from the session, so nothing is sent.
  deleteUser: function () {
    return axios.delete("/api/deleteUser");
  },
};
