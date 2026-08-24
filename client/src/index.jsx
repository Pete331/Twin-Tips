import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import AuthProvider from '../src/utils/AuthContext';

ReactDOM.render(
  <React.Fragment>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.Fragment>,
document.getElementById('root')
);

// </React.StrictMode>, change fragment to this to do some checks

// The CRA service worker is gone with react-scripts - it depended on
// PUBLIC_URL and a Workbox-generated service-worker.js that Vite never emits.
// Tear down any worker a previous visit registered, otherwise it keeps serving
// the old cached bundle and new deploys never reach the browser.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => registrations.forEach(r => r.unregister()))
    .catch(() => {});
}
