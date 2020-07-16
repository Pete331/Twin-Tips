import React, { createContext, useState } from 'react';
import API from './API';

export const AuthContext = createContext();

export default ({children}) => {
    
    const [user, setUser] = useState({
        isAuthenticated: false,
        name: null,
        id: null
    });

    const logout = () => {
        API.logout()
        .then( res => {
            initialUserState()
        })
        .catch( err => {
            console.log(err);
            initialUserState()
        })
    };

    const initialUserState = () => {
        setUser({
            isAuthenticated: false,
            name: null,
            id: null
        })
    }

    return(
        <AuthContext.Provider value={{user, setUser, logout}}>
            { children }
        </AuthContext.Provider>
    )
}