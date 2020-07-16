import React, { useEffect, useContext, useState } from 'react';
import { Route, Redirect } from 'react-router-dom';
import { AuthContext } from '../utils/AuthContext';
import Loader from '../components/Loader';
import API from './API';

function PrivateRoute({ component: Component, ...rest }) {

  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    API.checkAuthState()
    .then(res => {
        let { user, id, isAuthenticated } = res.data;
        
        setUser({
          isAuthenticated: isAuthenticated,
          name: user,
          id: id
        })

        loadingTimeout()
    })
    .catch( err => { 
      
      setUser({
        isAuthenticated: false,
        name: null,
        id: null
      })
      console.log(err)
      loadingTimeout()
    })
  },[setUser])
  
  const loadingTimeout = () => {
    setTimeout(() => {
      setIsLoading(false)
      clearTimeout(this)
    }, 100)
  }

  return (
    <>
      { 
      isLoading ? <Loader /> : (
          <Route {...rest} render={ props => (
            user.isAuthenticated ? <Component {...props} /> : 
            <Redirect to={{pathname: '/login', state: {from: props.location}}} />
          )} />
        )
      }
    </>
  );

}

export default PrivateRoute;