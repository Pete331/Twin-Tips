export const validEmail = (email) => {
    let regex = /^\S+@\S+\.\S+$/;
    return regex.test(email)
}

export const validPassword = (password) => {
    //requires a minimum of eight characters, at least one letter and one number
    let regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    return regex.test(password)
}