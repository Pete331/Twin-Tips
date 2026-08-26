import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import AuthProvider from '../src/utils/AuthContext';
import SeasonProvider from '../src/utils/SeasonContext';

// createRoot replaces ReactDOM.render, which React 18 deprecated and 19
// removed outright - calling it now throws rather than warning.
createRoot(document.getElementById('root')).render(
  <React.Fragment>
    <AuthProvider>
      <SeasonProvider>
        <App />
      </SeasonProvider>
    </AuthProvider>
  </React.Fragment>
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
