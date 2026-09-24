// Sessions: where they are kept, and how often keeping them costs a write.
//
// Built here rather than inline in server.js so the tests can put the real
// configuration in front of a real store and count what it does to the
// database - which is the thing that went wrong. See config/session.test.js.

const session = require("express-session");
// connect-mongo 6 exports named members; v5 and earlier exported the store
// directly, which is what most examples still show.
const { MongoStore } = require("connect-mongo");

// How long a device stays signed in. Rolling (see below), so this is measured
// from the last visit rather than from the login - a tipper who comes back
// each round is never signed out mid-season.
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// How often an unchanged session is written back to extend its expiry.
//
// It was every request. The cookie rolls on every response, and without this
// connect-mongo followed it with an update to the session document each time:
// one of the three database round trips every signed-in request paid just to
// find out who was asking, at about 155ms each from Render to Atlas (review
// finding #27). Once a day is plenty against a 30-day expiry - the stored
// session can lag the cookie by a day at most, and still outlives a month
// away by 29 days.
const TOUCH_AFTER_S = 24 * 60 * 60;

const createStore = (client) => {
  const store = MongoStore.create({
    client,
    // Matches the cookie. At the previous 24 hours the server forgot the
    // session a fortnight before the browser stopped presenting it, so a
    // user was quietly logged out after a day. touch() extends this, which is
    // what makes the rolling cookie mean anything - a cookie the browser still
    // holds is no use if the store has dropped it.
    ttl: SESSION_MS / 1000,
    touchAfter: TOUCH_AFTER_S,
  });

  const touch = store.touch.bind(store);
  store.touch = (sid, sessionData, callback) => {
    // A session written before touchAfter was set has no lastModified, and
    // connect-mongo only ever skips a touch for one that does - so every one
    // signed in today would keep writing on every request until its owner
    // next signed in, which on a rolling session may be never. An old date
    // makes the next touch record one; from then on they are skipped like
    // the rest.
    if (sessionData && !sessionData.lastModified) {
      sessionData.lastModified = new Date(1);
    }

    // A browser holding a cookie whose session is not in the database is not
    // an error - it is simply someone who is not signed in, and the request
    // should carry on anonymously. connect-mongo disagrees: its touch() throws
    // when the update matches no document, express-session passes that to the
    // error handler, and the visitor gets a 500 on every request until they
    // clear their cookies. It happens whenever a session outlives its record:
    // expired, purged, or issued while the app was pointed at a database that
    // never received it.
    //
    // Only that one case is swallowed. A store that is genuinely broken still
    // reports it.
    touch(sid, sessionData, (err) =>
      callback(
        err && err.message === "Unable to find the session to touch"
          ? null
          : err
      )
    );
  };

  return store;
};

// The session middleware, on a store sharing mongoose's MongoClient rather
// than opening a second connection pool.
const sessionMiddleware = ({ client, secret, secure }) =>
  session({
    // saveUninitialized wrote a session document for every visitor, signed in
    // or not, so crawlers alone would grow the collection without limit.
    // resave rewrote unchanged sessions on every request; MongoStore
    // implements touch, so expiry still gets extended without it.
    resave: false,
    saveUninitialized: false,
    // Reissue the cookie on every response, so its expiry is measured from
    // the last visit rather than from the login. Without it the 30 days ran
    // from sign-in and a weekly visitor was still signed out mid-season, which
    // is the whole complaint.
    //
    // Safe here only because saveUninitialized is false: rolling on an unsaved
    // session would set a cookie for every anonymous visitor.
    rolling: true,
    secret,
    cookie: {
      maxAge: SESSION_MS,
      httpOnly: true,
      // Only over HTTPS in production. Locally this has to stay off, or the
      // cookie is never set over plain http and login cannot work at all.
      secure,
      // Lax still sends the cookie on top-level navigation, so following a
      // password reset link back into the app keeps you signed in.
      sameSite: "lax",
    },
    store: createStore(client),
  });

module.exports = { sessionMiddleware, createStore, SESSION_MS, TOUCH_AFTER_S };
