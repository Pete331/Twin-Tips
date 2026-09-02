import axios from "axios";

// The settings and error handling every request shares.
//
// These used to be set in whichever API module happened to load first, which
// meant they applied by accident rather than by arrangement.

// Sessions are cookie-based, so every request has to carry them.
axios.defaults.withCredentials = true;

// A backstop, not a deadline.
//
// There was no timeout at all, so a request that never answered hung the
// interface for as long as the tab stayed open - which is exactly how the tips
// page came to sit on its loading state forever.
//
// It is deliberately generous. On Render's free tier the service spins down
// when idle, and a click after a quiet afternoon wakes it: the request waits
// for a container to boot, which takes tens of seconds. A shorter timeout
// would turn the slowest legitimate case in the app into a failure, and the
// point here is to eventually give up rather than to give up quickly.
axios.defaults.timeout = 45000;

// Statuses whose message was written for a person to read.
//
// The server answers a bad request and an unknown URL in the same shape -
// { success: false, message } - so the body cannot say which is which. Only
// the status can. 400 and its neighbours are the app telling someone what they
// did wrong, and are worth repeating verbatim. A 404 is "No such API route.",
// which is true and means nothing to anyone tipping football.
const SPEAKS_TO_USERS = new Set([400, 403, 409, 422]);

// What to put on screen when a request fails.
//
// Every branch says what happened and what to do about it, because an error
// that only says something went wrong leaves someone refreshing a page that
// was never going to work.
export const describeRequestError = (err) => {
  // Axios reports its own timeout this way rather than as a response.
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return "That is taking longer than it should. Check your connection and try again.";
  }

  if (!err.response) {
    return "Could not reach the server. Check your connection and try again.";
  }

  const { status, data } = err.response;

  if (status === 401) {
    return "You have been signed out. Sign in again to carry on.";
  }

  if (SPEAKS_TO_USERS.has(status) && data && data.message) {
    return data.message;
  }

  if (status >= 500) {
    return "Something went wrong at our end. Try again in a moment.";
  }

  return "Something went wrong. Try again.";
};

export default axios;
