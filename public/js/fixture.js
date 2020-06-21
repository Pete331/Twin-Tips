$(document).ready(function () {
  // makes the dropdown accessible
  //   $("#round-select").formSelect();

  $("#round-select")
    .on("change", function () {
      $("#round-select").formSelect();
      let selectedRound = {
        round: $("#round-select").formSelect("getSelectedValues")[0],
      };
      console.log(selectedRound);
    })
    .formSelect();
});
