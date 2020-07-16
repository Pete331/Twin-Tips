const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const db = require('../models');
const bcrypt = require('bcrypt');

const options = {
    usernameField: 'email',
    passwordField: 'password'
}

passport.use( new LocalStrategy( options, ( email, password, done ) => {
        db.User.findOne({ email: email }, (err, user) => {
            
            if (err) return done(err, false); 
            
            if (!user) {
                return done(null, false);
            }

            if ( bcrypt.compareSync(password, user.password) ) {
                return done(null, user);
            } 
           
            return done(null, false);

        });
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});
    
passport.deserializeUser((id, done) => {
    db.User.findById({_id: id}, (err, user) => {
        
        let response = {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
        }

        done(err, response);
    });
});

module.exports = passport;