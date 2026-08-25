import axios from 'axios';

axios.defaults.withCredentials = true

export default {
    login: (data) => {
        return axios.post("/api/auth/login", data)
    },
    logout: () => {
        return axios.get('/api/auth/logout')
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
    }
}