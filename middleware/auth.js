// Route guards. Everything under /api is behind a login; a small number of
// endpoints additionally require the admin flag.

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res
    .status(401)
    .json({ success: false, message: "Sign in required to access that route." });
};

const requireAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res
      .status(401)
      .json({ success: false, message: "Sign in required to access that route." });
  }
  if (!req.user.admin) {
    return res
      .status(403)
      .json({ success: false, message: "Admin rights required." });
  }
  next();
};

module.exports = { requireAuth, requireAdmin };
