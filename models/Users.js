const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        index: {unique: true},
        trim: true
    },
    password: {
        type: String,
        required: true,
        trim: true
    },
    resetPassToken: {
        type: String,
    },
    tokenExpiration: {
        type: Date
    }
},
{
    timestamps: true
});

const User = mongoose.model("User", UserSchema);

module.exports = User;