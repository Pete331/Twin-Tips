import axios from "axios";

const season = "2020";
const round = "1";
const gamesUrl = `https://api.squiggle.com.au/?q=games;year=${season};round=${round}`;

export default {

getFixture: function(){
    return axios.get(gamesUrl);
}

    // $("#download-fixture").on("click", () => {
    //     const gamesUrl = `https://api.squiggle.com.au/?q=games;year=${season};round=${round}`;
    //     $.getJSON(gamesUrl, function (json) {
    //       console.log(json);
    
    //       $.ajax("/api/fixtures", {
    //         type: "POST",
    //         data: json,
    //       }).then(function () {
    //         console.log("Imported fixtures");
    //         // Reload the page to get the updated list
    //         // location.reload();
    //       });
    //     });
    //   });


//   // Gets all books
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
