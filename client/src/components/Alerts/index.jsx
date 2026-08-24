import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useLocation } from 'react-router-dom';
import Alert from '@material-ui/lab/Alert';
import Collapse from '@material-ui/core/Collapse';
import useStyles from './style';

const Alerts = forwardRef((props, ref) => {
  const classes = useStyles();
  const location = useLocation();
  
  const [alert, setAlert] = useState({
    type: '',
    message: '',
    show: false
  })

  useEffect(()=>{
    let history = location.alert;

    if ( history ) {
      setAlert({
        type: history.type,
        message: history.message,
        show: true
      })
    }
  },[location.alert])

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