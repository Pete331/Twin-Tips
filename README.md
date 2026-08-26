# Twin Tips
Are you sick of footy tipping the old way? one bad round and you give up? Twin Tips gives you chance every week to win, all you have to do is select 2 teams each week. One from the top 8 of the ladder and one team from the bottom 10 of the ladder. You then select a winning margin for one of the selected games. The winner for the round is the person who gets the most tips correct with the closest margin.  
Sign up today and start twin tipping.  
This application utilizes the MERN stack (Mongo, Express, React and Node).  

![GitHub last commit](https://img.shields.io/github/last-commit/Pete331/Twin-Tips)
![GitHub commit activity](https://img.shields.io/github/commit-activity/y/Pete331/Twin-Tips)
![GitHub repo size](https://img.shields.io/github/repo-size/Pete331/Twin-Tips)
![GitHub top language](https://img.shields.io/github/languages/top/Pete331/Twin-Tips)  
## Table of Contents
- Installation
- Running it
- Season data
- Deployment
- Usage
- License
- Contributing
- Tests

## Installation
Needs Node 24 and a running MongoDB.

- `npm install` in the repo's directory. This installs the client's dependencies too.
- Copy `.env.example` to `.env` and fill it in. The comments there explain what each value is for.

## Running it
- `npm start` runs the API and the Vite dev server together, with the app on http://localhost:3000.
- `npm run build` then `npm run start:prod` serves the built client from the API on http://localhost:3001.

Note that `NODE_ENV=production` also switches on secure session cookies, which a browser will not store over plain http - so a production build is checked locally without it. The built client is served whenever `client/build` exists.

## Season data
Fixtures, ladders and scoring all come from the [Squiggle API](https://api.squiggle.com.au/) and are loaded server-side:

- `npm run sync` pulls the current season - teams, fixtures, ladder snapshots for completed rounds, then scores every completed round.
- `npm run sync 2025` does a particular season.

It is safe to re-run: everything is derived from fixtures and tips, so it lands on the same answer each time. In production a scheduled job runs it hourly.

The browser never talks to Squiggle directly. Their terms forbid it and they enforce it with an origin allowlist, so every call goes through this server.

## Deployment
`render.yaml` declares the deployment: a web service and a scheduled job for the season sync. Create it from Render's dashboard with **New > Blueprint** pointed at this repository, and it will prompt for the values marked `sync: false`.

Before pointing the app at a database that already has data in it, `MONGODB_URI="..." node scripts/checkDeployTarget.js` reports what is in there. It is read-only.

## Usage
Sign up today and get tipping - more users the better. I'm looking to add a league feature so that you can create your own groups of friends family to play with
## License
MIT License
## Contributing
Feel free to submit any pull requests
## Tests
`npm test` runs the scoring engine's tests with the Node test runner - no test dependency needed.

The scoring in `services/results.js` is covered because it is pure logic that decides who wins a round, and it has previously carried bugs that a passing spot-check missed. The rest of the codebase is glue around the database and is not covered.

## 

### Click on profile picture below to see Pete331's Github profile
[![Pete331's Profile Picture](https://avatars2.githubusercontent.com/u/53825841?v=4&s=200 "Created by Pete331")](https://github.com/Pete331)  
![GitHub followers](https://img.shields.io/github/followers/Pete331?style=social)  
