import axios from "./http";

// The contact form's one call.
//
// Its own module rather than a method on AuthAPI: getting in touch is not
// signing in, and the reason this route exists at all is that it works when
// signing in does not. Filing it under auth would put it behind the idea it is
// meant to sit beside.
export default {
  send: (data) => axios.post("/api/contact", data),
};
