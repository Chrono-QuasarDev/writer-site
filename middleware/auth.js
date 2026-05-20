/**
 * Authentication middleware
 * ---------------------------------------------------------------
 * requireAdmin   — gate a route behind a valid admin session.
 *                  On miss, remember the original URL and bounce
 *                  to /admin/login so we can return after login.
 *
 * redirectIfAuth — for use on /admin/login itself, so an already-
 *                  logged-in user doesn't see the login form.
 */

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  // Remember where they were going so we can send them back
  // after a successful login. Only safe-list GET requests; we
  // don't want to replay a POST (it could be a destructive
  // action) just because the session expired.
  if (req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }

  return res.redirect('/admin/login');
};

const redirectIfAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  return next();
};

module.exports = { requireAdmin, redirectIfAuth };
