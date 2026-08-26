import React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import theme from './theme';
import App from './components/App';
import AuthProvider from '../src/utils/AuthContext';
import SeasonProvider from '../src/utils/SeasonContext';

// createRoot replaces ReactDOM.render, which React 18 deprecated and 19
// removed outright - calling it now throws rather than warning.
//
// ThemeProvider wraps everything so there is one place colours come from, and
// CssBaseline sits inside it so it paints the page from that theme. Baseline
// was on the four sign-in screens only, which meant every page behind the
// login had been relying on Materialize for its reset without anyone
// intending that.
createRoot(document.getElementById('root')).render(
  <React.Fragment>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <SeasonProvider>
          <App />
        </SeasonProvider>
      </AuthProvider>
    </ThemeProvider>
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
