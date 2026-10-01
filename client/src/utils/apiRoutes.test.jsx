// @vitest-environment node
//
// Every request the client makes has a server route to answer it.
//
// The client's calls live in the *API.js files and the server's routes in
// routes/, and nothing tied the two together: every page test replaces the API
// files with fakes, and every server test calls the routes directly. A route
// renamed or removed on one side, or a call misspelled on the other, would
// pass every test and fail only in production - as a 404 from the "No such API
// route" handler, which is what the page would then show.
//
// So this calls every function the API files export, with axios recording the
// request rather than sending it, and asks the server's own route table -
// routes/index.js, which server.js mounts - whether a route would take it.
// Nothing on the server runs: matching a path is all that is asked, so no
// handler is called, no database is needed, and the call to Squiggle's
// predictions is never made.
//
// In Node rather than jsdom, because it loads the server's code; and under
// Vitest rather than node --test, because the API files import "./http"
// without an extension, which Vite resolves and Node does not.

import { describe, test, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

import axios from "./http";
import AuthAPI from "./AuthAPI";
import ContactAPI from "./ContactAPI";
import LeagueAPI from "./LeagueAPI";
import SeasonAPI from "./SeasonAPI";
import TipsAPI from "./TipsAPI";

const requireServer = createRequire(
  new URL("../../../routes/index.js", import.meta.url)
);

// The route that would answer this method and path - the first in the order
// they were declared, which is the one Express runs - or null if none would.
// The walk Express itself does, minus running anything: a layer matches the
// path, and either is a route that takes the method or is a router to look
// inside with the part it matched taken off.
//
// The route's own pattern comes back, so a call can be checked against the
// route it actually reaches and not merely some route: under /api/leagues,
// "/:slug" takes almost any one-segment path, so a call to a renamed route
// would still be "answered" - by a league called "rankings".
//
// Reads Express 5's router internals (router 2.x: Layer#match, layer.path,
// Route#_handlesMethod, route.path). If an upgrade moves them, the check on a
// made-up route below fails first and says so.
const answers = (stack, method, path) => {
  for (const layer of stack) {
    if (!layer.match(path)) continue;
    if (layer.route) {
      if (layer.route._handlesMethod(method)) return layer.route.path;
      continue;
    }
    if (layer.handle && layer.handle.stack) {
      const rest = path.slice(layer.path.length) || "/";
      const found = answers(layer.handle.stack, method, rest);
      if (found) return found;
    }
  }
  return null;
};

let app;
const routed = (method, path) => answers(app.router.stack, method, path);

// What each call is given. Distinctive, so a path holding one is known to
// have been built from an argument, and a path holding none was written out
// in full.
const STAND_INS = ["zz-slug", 777, "zz-user"];
const builtFromArguments = (path) =>
  STAND_INS.some((value) => path.includes(String(value)));

// Every request made, as the server would see it: the method and the path,
// without the query string.
const sent = [];

beforeAll(() => {
  const express = requireServer("express");
  const { mountApi } = requireServer("./index.js");
  app = express();
  mountApi(app);

  axios.defaults.adapter = async (config) => {
    sent.push({
      method: config.method,
      path: new URL(config.url, "http://localhost").pathname,
    });
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
}, 60000);

const MODULES = { AuthAPI, ContactAPI, LeagueAPI, SeasonAPI, TipsAPI };

// The two exports that are not requests: which season TipsAPI files tips
// under, set and read. Named rather than skipped by shape, so anything else
// that stops making a request is still caught below.
const NOT_REQUESTS = new Set(["TipsAPI.setSeason", "TipsAPI.getSeason"]);

// Each exported call, with stand-in arguments. Whatever they are, they end up
// in the path as a slug, a round or an id - and a route's pattern takes any of
// those - or in the body, which is not being checked.
const everyCall = async () => {
  const calls = [];
  for (const [module, api] of Object.entries(MODULES)) {
    for (const [name, call] of Object.entries(api)) {
      if (typeof call !== "function") continue;
      if (NOT_REQUESTS.has(`${module}.${name}`)) continue;
      sent.length = 0;
      await call(...STAND_INS);
      calls.push({ name: `${module}.${name}`, requests: [...sent] });
    }
  }
  return calls;
};

describe("the client and the server agree", () => {
  // So this cannot pass by answering yes to everything.
  test("the check says no to a route that does not exist", () => {
    expect(routed("get", "/api/leagues/mine")).toBe("/mine");
    expect(routed("get", "/api/no-such-route")).toBeNull();
    // A real path, asked with a method nothing there takes.
    expect(routed("put", "/api/leagues/mine")).toBeNull();
    expect(routed("delete", "/api/teams")).toBeNull();
    // One segment too many for any pattern.
    expect(routed("get", "/api/leagues/a/standings/extra")).toBeNull();
    // And the first route declared wins, as it does in Express.
    expect(routed("get", "/api/leagues/rankings")).toBe("/rankings");
    expect(routed("get", "/api/leagues/the-rivals")).toBe("/:slug");
  });

  test("every call makes one request", async () => {
    const calls = await everyCall();

    expect(calls.length).toBeGreaterThan(30);
    expect(calls.filter((c) => c.requests.length !== 1)).toEqual([]);
  });

  const requests = async () =>
    (await everyCall()).flatMap((c) =>
      c.requests.map((r) => ({
        ...r,
        name: c.name,
        route: routed(r.method, r.path),
        said: `${c.name}: ${r.method.toUpperCase()} ${r.path}`,
      }))
    );

  test("and the server has a route for every one", async () => {
    const unanswered = (await requests())
      .filter((r) => !r.route)
      .map((r) => r.said);

    expect(unanswered).toEqual([]);
  });

  // A path written out in full meets a route written out in full. Reaching a
  // pattern instead - "/:slug" - means the route it was written for is gone
  // and something else is answering in its place.
  //
  // Bar one pattern that is the route on purpose: the Squiggle proxy takes
  // "/:query" and answers only the queries on its list, so a call reaching it
  // is answered if what it asks for is listed.
  test("and a path written in full reaches the route written for it", async () => {
    const { ALLOWED_QUERIES } = requireServer("./squiggle.js");
    const proxied = (r) =>
      r.route === "/:query" &&
      r.path.startsWith("/api/squiggle/") &&
      ALLOWED_QUERIES.includes(r.path.slice("/api/squiggle/".length));

    const taken = (await requests())
      .filter((r) => r.route && !builtFromArguments(r.path))
      .filter((r) => r.route.includes(":") && !proxied(r))
      .map((r) => `${r.said} reaches ${r.route}`);

    expect(taken).toEqual([]);
  });
});
