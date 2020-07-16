const db = require('../models');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sendMail } = require('../utils/nodeMailer')

const capitalize = string => {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const validEmail = email => {
    let regex = /^\S+@\S+\.\S+$/;
    return regex.test(email)
}

const validPassword = password => {
    //requires a minimum of eight characters, at least one letter and one number
    let regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    return regex.test(password)
}

module.exports = {
    login: (req, res) => {
        if (req.isAuthenticated()) {
            let { firstName, lastName, id } = req.user;
            res.status(200).json({ success: true, user:`${capitalize(firstName)} ${capitalize(lastName)}`, id: id, isAuthenticated: true })
        } else {
            res.status(401).json({success: false, message: "Incorrect email or password"})
        }
    },
    logout: (req, res) => {
        if (req.isAuthenticated()) {
            req.logout()
            res.status(200).json({ success: true, message: "Successfully logged out" })
        } else {
            res.status(400).json({ success: false, message: "No active sessions" })
        }
    },
    register: (req, res) => {
       let { email, password, firstName, lastName } = req.body;

       if (!email || !password || !firstName || !lastName) {
           res.status(400).json({ success: false, message: "Please complete all required fields." })
       }

       if (!validPassword(password)) {
           res.status(400).json({ success: false, message: "Password requires a minimum of eight characters, at least one letter and one number" })
       }
       
       if (!validEmail(email)) {
           res.status(400).json({ success: false, message: "Please enter a valid email address." })
       }

       db.User.findOne({ email: email })
       .then( user => {
        
           if (user) {
               res.status(400).json({ success: false, message: "That email is already in use." })
           }
           
           let newUser = new db.User({
               email,
               password,
               ...req.body
           })

           bcrypt.genSalt(10, (err, salt) => {
                bcrypt.hash( newUser.password , salt, (err, hash) => {
                    if (err) throw err;
                    newUser.password = hash;
                    
                    newUser.save()
                    .then(() => {
                        console.log("here");
                        res.status(201).json({success: true, message: "Account successfully created."})
                    })
                    .catch( err => {
                        console.log("here");
                        res.status(500).json({success: false, message: "Server Issue: Unable to create account!"})
                    })
                })
            })
       })
        .catch( err => {
            console.log("here");
            res.status(500).json({success: false, message: "Internal server issue!"})
        })
    },
    checkAuthState: (req, res) => {
        if (req.isAuthenticated()) {
            let {firstName, lastName, id} = req.user;
            res.status(200).json({ success: true, user:`${capitalize(firstName)} ${capitalize(lastName)}`, id: id, isAuthenticated: true })
        } else {
            res.status(401).json({success: false, message: "Sign in required to access that route."})
        }
    },
    forgotPassword: (req, res) => {
        let { email } = req.body;
        let token = crypto.randomBytes(40).toString('hex');
        let expiration = Date.now() + (1000 * 60 * 30);
        
        db.User.findOne({ email: email })
        .then( user => {

            if (!user) {
                res.status(422).json({success: false, message: "No user with that email was found!"})
                
            } else {
                db.User.findOneAndUpdate({_id: user._id}, {$set:{resetPassToken: token, tokenExpiration: expiration}}, {new:true})
                .then( ({email, resetPassToken, firstName}) => {
                    let fName = capitalize(firstName)
                    sendMail(email, resetPassToken, fName)
                    res.status(200).json({success: true, message: "Please check your email, link will expire in 30 min!"})
                })
            }
            
        })
        .catch( err => {
            res.status(400).json({success: false, message: "The server is unable to process your request at this time!"})
        })
        
    },
    resetPassword: (req, res) => {
        let { token, password } = req.body;

        db.User.findOne({resetPassToken: token})
        .then( user => {
            
            if (!user) {
                res.status(422).json({success: false, message: "Password reset link is either invalid or expired!"})

            } else if (user.tokenExpiration < Date.now()) {
                res.status(422).json({success: false, message: "Password reset link has expired!"})

            } else if (!validPassword(password)){
                res.status(400).json({ success: false, message: "Password requires a minimum of eight characters, at least one letter and one number" })

            } else {
                bcrypt.genSalt(10, (err, salt) => {
                    if (err) throw err;
            
                    bcrypt.hash( password , salt, (err, hash) => {
                        if (err) throw err;
                        
                        db.User.findOneAndUpdate({_id: user._id}, {$set:{password: hash}, $unset:{resetPassToken: "", tokenExpiration: ""}})
                        .then(() => {
                            res.status(200).json({success: true, message: "Password has been sucessfully changed!"})
                        })
                    })
                })
            }
            
        })
        .catch( err => {
            res.status(400).json({success: false, message: "The server is unable to process your request at this time!"})
        })
    }
}