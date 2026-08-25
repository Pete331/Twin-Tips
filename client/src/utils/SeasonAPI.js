import axios from "axios";

export default {
  // Which season and round the app is in, and whether tipping can run.
  getState: function (season) {
    const query = season ? `?season=${season}` : "";
    return axios.get(`/api/season${query}`);
  },

  // Seasons the database holds fixtures for, newest first.
  getAvailable: function () {
    return axios.get("/api/season/available");
  },

  // Pulls a season from Squiggle into the database. Admin only.
  sync: function (year) {
    return axios.post("/api/season/sync", { year });
  },
};
