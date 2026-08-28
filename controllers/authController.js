const db = require('../models');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sendMail } = require('../utils/nodeMailer')
const {
    USERNAME_COLLATION,
    USERNAME_RULE,
    validUsername,
    isReservedUsername,
} = require('../utils/username')

const capitalize = string => {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const validEmail = email => {
    let regex = /^\S+@\S+\.\S+$/;
    return regex.test(email)
}

// Reset tokens are stored hashed, never in the clear. A plain SHA-256 is the
// right tool rather than bcrypt: the token is 40 random bytes from a CSPRNG,
// so there is nothing to brute-force and no need for a slow hash, and the
// reset route has to be able to look the value up by equality.
const hashToken = token =>
    crypto.createHash('sha256').update(String(token)).digest('hex')

const validPassword = password => {
    //requires a minimum of eight characters, at least one letter and one number
    // The lookaheads require a letter and a digit; the rest can be anything.
    // The character class used to be [A-Za-z\d], which rejected every symbol -
    // so "Passw0rd!" failed against a message saying it needed a letter and a
    // number, which it had. Kept in step with the client's copy in
    // client/src/utils/ValidationHelpers.js.
    let regex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    return regex.test(password)
}

module.exports = {
    login: (req, res) => {
        if (req.isAuthenticated()) {
            let { username, id } = req.user;
            // The username, exactly as its owner typed it. It used to be the
            // capitalised first and last name, which is not what the
            // leaderboard shows any more.
            res.status(200).json({ success: true, user: username, id: id, isAuthenticated: true })
        } else {
            res.status(401).json({success: false, message: "Incorrect username, email or password"})
        }
    },
    logout: (req, res) => {
        if (req.isAuthenticated()) {
            // Passport 0.6 made logout asynchronous - calling it without a
            // callback throws "req#logout requires a callback function".
            req.logout(err => {
                if (err) {
                    return res.status(500).json({ success: false, message: "Unable to log out" })
                }
                res.status(200).json({ success: true, message: "Successfully logged out" })
            })
        } else {
            res.status(400).json({ success: false, message: "No active sessions" })
        }
    },
    register: (req, res) => {
       let { email, username, password, firstName, lastName, favTeam } = req.body;

       // Each guard must return: without it the request kept running and sent
       // a second response, which throws ERR_HTTP_HEADERS_SENT.
       if (!email || !username || !password || !firstName || !lastName || !favTeam) {
           return res.status(400).json({ success: false, message: "Please complete all required fields." })
       }

       if (!validPassword(password)) {
           return res.status(400).json({ success: false, message: "Password requires a minimum of eight characters, at least one letter and one number" })
       }

       if (!validEmail(email)) {
           return res.status(400).json({ success: false, message: "Please enter a valid email address." })
       }

       // Checked here as well as in the browser. The rule that matters most is
       // the one forbidding "@": sign-in takes a single field and decides
       // whether it is an email or a username by looking for one, so a
       // username containing "@" could never be used to sign in.
       if (!validUsername(username)) {
           return res.status(400).json({ success: false, message: USERNAME_RULE })
       }

       if (isReservedUsername(username)) {
           return res.status(400).json({ success: false, message: "That username is not available." })
       }

       // Synchronous hashing inside a try, matching changePassword and
       // resetPassword. The callback form this replaces threw from inside the
       // bcrypt callback, where a throw does not reach the surrounding promise
       // chain - it became an uncaught exception and took the process down,
       // dropping every request in flight. It also ignored the genSalt error
       // entirely and would have hashed against an undefined salt.
       db.User.findOne({ email: email })
       .then( async user => {

           if (user) {
               return res.status(400).json({ success: false, message: "That email is already in use." })
           }

           // Checked separately from email so the message can say which one
           // is taken. The collation matches the unique index, so this catches
           // a name that differs only by capitals - without it the check would
           // pass and the save would fail on a duplicate key instead, which
           // reaches the user as "Internal server issue".
           const takenUsername = await db.User.findOne({ username })
               .collation(USERNAME_COLLATION)

           if (takenUsername) {
               return res.status(400).json({ success: false, message: "That username is already taken." })
           }

           // Only the fields a registrant is allowed to set. Spreading req.body
           // here let a client send admin:true and grant itself admin rights.
           let newUser = new db.User({
               email,
               username,
               password: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
               firstName,
               lastName,
               favTeam
           })

           await newUser.save()
           res.status(201).json({success: true, message: "Account successfully created."})
       })
        .catch( err => {
            console.error("register failed:", err.message)
            res.status(500).json({success: false, message: "Internal server issue!"})
        })
    },
    checkAuthState: (req, res) => {
        if (req.isAuthenticated()) {
            let {username, id, admin} = req.user;
            res.status(200).json({ success: true, user: username, id: id, admin: admin, isAuthenticated: true })
        } else {
            res.status(401).json({success: false, message: "Please log in to access that route."})
        }
    },
    // Changing your own username while signed in. Registration is the only
    // other place one is set, and a backfilled account never chose the one it
    // has, so this is how anyone ends up with a name they picked.
    changeUsername: async (req, res) => {
        const { username } = req.body;

        if (!validUsername(username)) {
            return res.status(400).json({ success: false, message: USERNAME_RULE })
        }

        if (isReservedUsername(username)) {
            return res.status(400).json({ success: false, message: "That username is not available." })
        }

        try {
            // Same collation as the unique index, so a name differing only by
            // capitals is correctly reported as taken rather than failing on a
            // duplicate key deeper in.
            const taken = await db.User.findOne({ username })
                .collation(USERNAME_COLLATION)

            // Their own name is not a clash - this is how someone restyles
            // "peterb" as "PeterB" without the check refusing it.
            if (taken && String(taken._id) !== String(req.user.id)) {
                return res.status(400).json({ success: false, message: "That username is already taken." })
            }

            await db.User.updateOne({ _id: req.user.id }, { $set: { username } })

            res.status(200).json({ success: true, message: "Username updated.", username })
        } catch (err) {
            console.error("changeUsername failed:", err.message)
            res.status(500).json({ success: false, message: "Unable to update your username." })
        }
    },
    // Changing your own password while signed in. Until now the only route to a
    // new password was to log out and use the emailed reset link.
    changePassword: async (req, res) => {
        let { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Enter your current and new password." })
        }

        if (!validPassword(newPassword)) {
            return res.status(400).json({ success: false, message: "Password requires a minimum of eight characters, at least one letter and one number" })
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ success: false, message: "That is already your password." })
        }

        try {
            // password is select:false on the schema, so ask for it explicitly.
            const user = await db.User.findById(req.user.id).select("+password")

            if (!user) {
                return res.status(401).json({ success: false, message: "Please log in to access that route." })
            }

            // The current password is required so that an unattended session
            // cannot be used to lock the owner out of their own account.
            if (!bcrypt.compareSync(currentPassword, user.password)) {
                return res.status(403).json({ success: false, message: "Your current password is incorrect." })
            }

            const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10))
            await db.User.updateOne({ _id: user._id }, { $set: { password: hash } })

            res.status(200).json({ success: true, message: "Password changed." })
        } catch (err) {
            console.error("changePassword failed:", err.message)
            res.status(500).json({ success: false, message: "Unable to change your password." })
        }
    },
    forgotPassword: async (req, res) => {
        let { email } = req.body;

        // The same answer whether or not the address is registered. It used to
        // return 422 "No user with that email was found!" for an unknown
        // address and 200 for a known one, which turned this into a way to ask
        // whether any given person has an account here.
        const sameAnswer = () => res.status(200).json({
            success: true,
            message: "If that email is registered, a reset link is on its way. It will expire in 30 min!"
        })

        try {
            const user = await db.User.findOne({ email: email })

            if (!user) {
                return sameAnswer()
            }

            // The token goes to the user in plaintext and into the database as
            // a hash, so a copy of the users collection - a backup, an Atlas
            // session, a logging accident - cannot be used to take over an
            // account with a reset pending. Nothing needs to read it back: the
            // reset route hashes what it is given and compares.
            const token = crypto.randomBytes(40).toString('hex')

            await db.User.updateOne({ _id: user._id }, { $set: {
                resetPassToken: hashToken(token),
                tokenExpiration: Date.now() + (1000 * 60 * 30)
            }})

            await sendMail(user.email, token, capitalize(user.firstName))

            sameAnswer()
        } catch (err) {
            console.error("forgotPassword failed:", err.message)
            res.status(400).json({success: false, message: "The server is unable to process your request at this time!"})
        }
    },
    resetPassword: async (req, res) => {
        let { token, password } = req.body;

        try {
            if (!token) {
                return res.status(422).json({success: false, message: "Password reset link is either invalid or expired!"})
            }

            const user = await db.User.findOne({ resetPassToken: hashToken(token) })
                .select("+resetPassToken +tokenExpiration")

            if (!user) {
                return res.status(422).json({success: false, message: "Password reset link is either invalid or expired!"})
            }

            if (user.tokenExpiration < Date.now()) {
                return res.status(422).json({success: false, message: "Password reset link has expired!"})
            }

            if (!validPassword(password)) {
                return res.status(400).json({ success: false, message: "Password requires a minimum of eight characters, at least one letter and one number" })
            }

            // Synchronous hashing inside the try, as changePassword already
            // does. The callback form this replaces threw from inside the
            // bcrypt callback, which does not reach a surrounding promise
            // chain - it became an uncaught exception and killed the process,
            // dropping every request in flight because one hash failed.
            const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10))

            await db.User.updateOne(
                { _id: user._id },
                { $set: { password: hash }, $unset: { resetPassToken: "", tokenExpiration: "" } }
            )

            res.status(200).json({success: true, message: "Password has been sucessfully changed!"})
        } catch (err) {
            console.error("resetPassword failed:", err.message)
            res.status(400).json({success: false, message: "The server is unable to process your request at this time!"})
        }
    }
}