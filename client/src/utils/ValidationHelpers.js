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