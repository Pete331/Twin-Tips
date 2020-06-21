$(document).ready(function () {
  // makes the dropdown accessible
  $("select").formSelect();

  // Getting references to our form and input
  let signUpForm = $("form.signup");
  let firstNameInput = $("input#first-name-input");
  let lastNameInput = $("input#last-name-input");
  let favTeamInput = $("input#fav-team-input");
  let emailInput = $("input#email-input");
  let passwordInput = $("input#password-input");

  // When the signup button is clicked, we validate the email and password are not blank
  signUpForm.on("submit", function (event) {
    event.preventDefault();
    // need to reinitialize the select dropdown to retrieve selected team
    $("select").formSelect();
    let userData = {
      firstName: firstNameInput.val() ? firstNameInput.val().trim() : null,
      lastName: lastNameInput.val() ? lastNameInput.val().trim() : null,
      favTeam: $("select").formSelect("getSelectedValues")[0],
      email: emailInput.val() ? emailInput.val().trim() : null,
      password: passwordInput ? passwordInput.val().trim() : null,
    };
    console.log(userData);
    if (
      !userData.firstName ||
      !userData.lastName ||
      !userData.favTeam ||
      !userData.email ||
      !userData.password
    ) {
      Swal.fire("", "You need to enter all information", "warning");
      return;
    }
    // If we have an email and password, run the signUpUser function
    signUpUser(userData);
    // emailInput.val("");
    // passwordInput.val("");
  });

  // Does a post to the signup route. If successful, we are redirected to the members page
  // Otherwise we log any errors
  function signUpUser(userData) {
    // console.log(userData);

    $.post("/api/user/signup", userData)
      .then(function (data) {
        window.location.replace("/dashboard");
        // If there's an error, handle it by throwing up an alert
      })
      .catch(handleLoginErr);
  }

  function handleLoginErr(response) {
    if (response.status === 422) {
      Swal.fire(
        "Uh oh!",
        "Unable to process contained instructions",
        "warning"
      );
    } else if (response.status === 401) {
      window.location.replace("/");
    }
  }
});
