export const validEmail = (email) => {
    let regex = /^\S+@\S+\.\S+$/;
    return regex.test(email)
}

export const validPassword = (password) => {
    //requires a minimum of eight characters, at least one letter and one number
    // The lookaheads require a letter and a digit; the rest of the password can
    // be anything. The character class used to be [A-Za-z\d], which rejected
    // every symbol - so "Passw0rd!" failed against a message saying it needed
    // a letter and a number, which it had. Anything from a password manager
    // bounced, which pushed people toward weaker passwords.
    let regex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    return regex.test(password)
}

// Kept in step with utils/username.js on the server, which is the copy that
// actually decides. Duplicated here only so the form can say what is wrong
// without a round trip.
//
// The "@" exclusion is the one that carries weight: sign-in takes a single
// field for either a username or an email and tells them apart by looking for
// an "@", so a username containing one could never be used to sign in.
export const USERNAME_RULE =
    "Username must be 3-20 characters, using letters, numbers, underscores or hyphens only.";

export const validUsername = (username) => {
    let regex = /^[A-Za-z0-9_-]{3,20}$/;
    return regex.test(username)
}
