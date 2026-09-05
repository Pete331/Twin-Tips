import axios from "./http";

export default {
    login: (data) => {
        return axios.post("/api/auth/login", data)
    },
    // POST, not GET: signing out changes state, and a GET can be fired by
    // anything that fetches a URL without the person meaning it - a link
    // preview, a prefetch. Moves with routes/api/auth/index.js.
    logout: () => {
        return axios.post('/api/auth/logout')
    },
    register: (data) => {
        return axios.post("/api/auth/register", data)
    },
    checkAuthState: () => {
        return axios.get('/api/auth/')
    },
    forgotPassword: (data) => {
        return axios.post('/api/auth/forgot', data)
    },
    resetPassword: (data) => {
        return axios.post('/api/auth/reset', data)
    },
    // Change your own password while signed in, as opposed to the emailed
    // reset link, which is the only way this could be done before.
    changePassword: (data) => {
        return axios.post('/api/auth/password', data)
    },
    // The name shown on the leaderboard. Registration is the only other place
    // it is set, and accounts that predate usernames had one derived for them,
    // so this is how anyone ends up with a name they chose.
    changeUsername: (data) => {
        return axios.post('/api/auth/username', data)
    }
}
