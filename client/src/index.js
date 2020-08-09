import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import AuthProvider from '../src/utils/AuthContext';
import * as serviceWorker from "./serviceWorker";

ReactDOM.render(
  <React.Fragment>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.Fragment>,
document.getElementById('root')
);

// </React.StrictMode>, change fragment to this to do some checks


// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA

serviceWorker.register({
  onUpdate: registration => {
    alert('New version available!  Ready to update?');
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }
});