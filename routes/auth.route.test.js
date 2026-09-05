// The verb on /api/auth/logout.
//
// It was a GET. Signing out changes state, and a GET can be fired by anything
// that fetches a URL without the person meaning it - an <img src> on another
// site, a chat client unfurling a link preview, a browser prefetching what it
// thinks you are about to click. The worst case is only ever being signed out,
// which is why this sat at the bottom of the audit rather than the top, but
// none of those is something anyone asked for and the verb is the only reason
// they can happen.
//
// The route and client/src/utils/AuthAPI.js are the whole surface, and they had
// to move together. This is what says they still agree: the route mounted here
// is the real one, so a client posting to a route that only accepts GET - or
// the reverse - fails here rather than in somebody's browser.
//
// No database. Nothing in the logout path reads one; passport's session is
// stood in for, the same way routes/tips.route.test.js does it.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const authRoutes = require("./api/auth");

// An app carrying the real auth router, with a session that says somebody is
// signed in. req.logout is passport's, so it is stood in for here - it is
// library code, and signing out for real is exercised by the app itself.
const appWith = ({ signedIn = true, onLogout = (cb) => cb(null) } = {}) => {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.isAuthenticated = () => signedIn;
    req.logout = onLogout;
    next();
  });

  app.use("/api/auth", authRoutes);
  return app;
};

// Binds an ephemeral port rather than taking 3001.
const call = (app, method, path) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
        });
        const text = await response.text();
        server.close();

        // A route that does not exist gets Express's own 404, which is HTML.
        // That is a valid answer here - it is what a GET should now get - so
        // the body is parsed only when it is actually JSON.
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text.slice(0, 60) };
        }

        resolve({ status: response.status, body });
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });

test("POST signs a signed-in user out", async () => {
  const { status, body } = await call(appWith(), "POST", "/api/auth/logout");

  assert.equal(status, 200);
  assert.equal(body.success, true);
});

test("the route is reached, not just any 200", async () => {
  let called = false;
  const app = appWith({
    onLogout: (cb) => {
      called = true;
      cb(null);
    },
  });

  await call(app, "POST", "/api/auth/logout");
  assert.equal(called, true, "passport's logout was actually invoked");
});

// The point of the change. A GET must no longer do anything.
test("GET no longer signs anyone out", async () => {
  let called = false;
  const app = appWith({
    onLogout: (cb) => {
      called = true;
      cb(null);
    },
  });

  const { status } = await call(app, "GET", "/api/auth/logout");

  assert.notEqual(status, 200, "a GET is not a way to sign somebody out");
  assert.equal(called, false, "and it never reaches passport");
});

test("signing out when nobody is signed in says so rather than pretending", async () => {
  const { status, body } = await call(
    appWith({ signedIn: false }),
    "POST",
    "/api/auth/logout"
  );

  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("a failure inside passport is reported, not swallowed", async () => {
  const app = appWith({ onLogout: (cb) => cb(new Error("session store down")) });
  const { status, body } = await call(app, "POST", "/api/auth/logout");

  assert.equal(status, 500);
  assert.equal(body.success, false);
});

// The client's own call, kept honest against the route above. If somebody
// changes one verb without the other, the app signs nobody out and this is what
// says so - the alternative is finding out from a person who cannot log out.
test("the client posts to the route the server accepts", async () => {
  const fs = require("fs");
  const path = require("path");

  const api = fs.readFileSync(
    path.join(__dirname, "../client/src/utils/AuthAPI.js"),
    "utf8"
  );

  const logout = api.match(/logout:\s*\(\)\s*=>\s*\{[^}]*\}/);
  assert.ok(logout, "AuthAPI still has a logout call");
  assert.match(
    logout[0],
    /axios\.post\(\s*['"]\/api\/auth\/logout['"]/,
    "AuthAPI posts to /api/auth/logout"
  );
});
