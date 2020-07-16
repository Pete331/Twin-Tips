import axios from "axios";

const season = "2020";
const round = "1";
const fixtureUrlAll = `https://api.squiggle.com.au/?q=games;year=${season}`;
const fixtureUrlRound = `https://api.squiggle.com.au/?q=games;year=${season};round=${round}`;

export default {
  getFixture: function () {
    return axios.get(fixtureUrlAll);
  },

  postFixture: function (data) {
      console.log(data);
    return axios.post("/api/fixtures/", data);
  },

  getTeams: function () {
    return axios.get("https://api.squiggle.com.au/?q=teams");
  },

  postTeams: function (data) {
      console.log(data);
    return axios.post("/api/teams/", data);
  },

  getStandings: function () {
    return axios.get("https://api.squiggle.com.au/?q=standings");
  },

  postStandings: function (data) {
      console.log(data);
    return axios.post("/api/standings/", data);
  },

  getDetails: function () {
    return axios.get("/api/details/");
  },

  //   // Gets all books1
  //   getBooks: function() {
  //     return axios.get("/api/books");
  //   },
  //   // Gets the book with the given id
  //   getBook: function(id) {
  //     return axios.get("/api/books/" + id);
  //   },
  //   // Deletes the book with the given id
  //   deleteBook: function(id) {
  //     return axios.delete("/api/books/" + id);
  //   },
  //   // Saves a book to the database
  //   saveBook: function(bookData) {
  //     return axios.post("/api/books", bookData);
  //   }
};
