import axios from "axios";

axios.defaults.withCredentials = true;

// Leagues, and the global ladder that sits alongside them.
//
// Standings come from the server already grouped, ranked and carrying their
// league's buy-in. The Leaderboard used to fetch every tip of the season and
// group them in the browser against a hardcoded buy-in of 5, which cannot work
// once two leagues on one page can charge different amounts.
export default {
  mine: () => axios.get("/api/leagues/mine"),

  detail: (slug) => axios.get(`/api/leagues/${slug}`),

  standings: (slug, season) =>
    axios.get(`/api/leagues/${slug}/standings`, { params: { season } }),

  global: (season) => axios.get("/api/ladder/global", { params: { season } }),

  create: (data) => axios.post("/api/leagues", data),

  // Either an invite token or a join code; the server takes whichever it is
  // given.
  join: (data) => axios.post("/api/leagues/join", data),

  // Rename, hand over admin, or roll the invite.
  update: (slug, data) => axios.patch(`/api/leagues/${slug}`, data),

  close: (slug) => axios.delete(`/api/leagues/${slug}`),

  // Leaving and removing someone are the same route - who you name decides
  // which it is.
  removeMember: (slug, userId) =>
    axios.delete(`/api/leagues/${slug}/members/${userId}`),
};
