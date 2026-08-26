import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useLocation } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import useStyles from './style';

const Alerts = forwardRef((props, ref) => {
  const classes = useStyles();
  const location = useLocation();
  
  const [alert, setAlert] = useState({
    type: '',
    message: '',
    show: false
  })

  // Pages hand an alert over when they navigate here. react-router 6 dropped
  // arbitrary properties on the location object, so what used to arrive as
  // location.alert now travels in location.state.
  useEffect(()=>{
    const passed = location.state && location.state.alert;

    if ( passed ) {
      setAlert({
        type: passed.type,
        message: passed.message,
        show: true
      })
    }
  },[location.state])

  const createAlert = (error, message, show) => {
    setAlert({
      type: error,
      message: message,
      show: show
    })
  }

  const clearAlert = () => {
    setAlert({
      type: '',
      message: '',
      show: false
    })
  }

  useImperativeHandle(ref, ()=>{
    return {
      createAlert: createAlert
    }
  })

  //severity options ["error","info","success","warning"]
  return (
    <div className={classes.root} onClick={clearAlert}>
      <Collapse in={alert.show} timeout={400}>
        <Alert className={classes.topMargin} severity={alert.type || "info"}>{alert.message}</Alert>
      </Collapse>
    </div>
  );
})

export default Alerts;