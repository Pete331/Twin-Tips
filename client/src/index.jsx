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
//
// StrictMode, which does nothing in a production build. In development it
// renders each component twice and runs each effect's setup, cleanup and
// setup again, so an effect that forgets to clean up - a timer left running,
// a listener added twice - shows itself on the first page load rather than
// after a week of navigating around. It sat here commented out, as a
// Fragment "to do some checks" with.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <SeasonProvider>
          <App />
        </SeasonProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// The CRA service worker is gone with react-scripts - it depended on
// PUBLIC_URL and a Workbox-generated service-worker.js that Vite never emits.
// Tear down any worker a previous visit registered, otherwise it keeps serving
// the old cached bundle and new deploys never reach the browser.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => registrations.forEach(r => r.unregister()))
    .catch(() => {});
}
