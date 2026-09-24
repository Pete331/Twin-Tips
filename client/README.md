# Twin Tips - client

The React front end: React 19, MUI 9 and React Router, built with Vite.

This used to be the 2,000-line Create React App template. None of it applied:
the app moved to Vite, so there is no `react-scripts`, no `REACT_APP_`
environment variables and no service worker.

## Running it

From the repository root, `npm start` runs the API on port 3001 and this dev
server on port 3000 together. Vite forwards anything under `/api` to the API
(`vite.config.mjs`), so the browser only ever talks to one origin.

To run just this half:

    npm start          # Vite dev server on http://localhost:3000
    npm run build      # production build into build/, which the server serves
    npm run preview    # serve the production build locally

## Tests

    npm test           # Vitest, once
    npm run test:watch # Vitest, watching

Component and page tests are `src/**/*.test.jsx`. They render under jsdom with
the API modules mocked, and cover the wiring between pieces: what a page asks
for and what it does with the answer. The plain-function tests beside the
utilities (`src/utils/*.test.mjs`) run with the server's tests instead - see
the root README.

## Where things are

    src/pages/        one folder per route
    src/components/   shared pieces - FixtureCard, TipCell, TipBar, RoundPicker...
    src/utils/        API clients (TipsAPI, LeagueAPI, AuthAPI), contexts,
                      and the small pure helpers the pages share
    public/           copied into the build as-is: icons, team logos, manifest

The app keeps no secrets. Anything with a key - Squiggle, the odds provider,
mail - is called by the server, never from here.
