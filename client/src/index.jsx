import React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import App from './components/App';
import AuthProvider from '../src/utils/AuthContext';
import SeasonProvider from '../src/utils/SeasonContext';

// createRoot replaces ReactDOM.render, which React 18 deprecated and 19
// removed outright - calling it now throws rather than warning.
//
// CssBaseline belongs here, once, rather than on individual pages. It was on
// the four sign-in screens only, so every page behind the login was relying on
// Materialize for its reset without anyone intending that. With Materialize
// gone this is what normalises the document, and it is MUI's own - which is
// the point: one styling system, no second opinion.
createRoot(document.getElementById('root')).render(
  <React.Fragment>
    <CssBaseline />
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
