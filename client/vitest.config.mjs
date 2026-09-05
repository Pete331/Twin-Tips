// Component tests run under Vitest rather than node --test.
//
// The server suite is node --test and stays that way: it needs no transform,
// and a second runner there would buy nothing. The client is the opposite - a
// component test has to turn JSX into JavaScript and needs a DOM to render
// into, and Vitest gets both by reusing vite.config.mjs. The alternative was a
// custom loader in front of node --test, which would mean maintaining a second
// build pipeline that had to agree with Vite about everything.
//
// mergeConfig rather than a fresh defineConfig, so the plugin list and anything
// added to it later applies to tests without being written down twice.

import { defineConfig, mergeConfig } from "vite";
import viteConfig from "./vite.config.mjs";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Components need somewhere to render. The utility tests do not, but
      // running them in jsdom costs nothing and keeps one runner for the
      // client.
      environment: "jsdom",

      // jest-dom's matchers, and an automatic cleanup between tests - without
      // it a component from one test is still mounted during the next, and
      // getByRole starts finding two of everything.
      setupFiles: ["./src/setupTests.js"],
      globals: true,

      // The .mjs utility tests are written for node --test and keep running
      // there, as part of the server suite. Picking them up here as well would
      // run them twice and report a misleading total.
      include: ["src/**/*.test.jsx"],
    },
  })
);
