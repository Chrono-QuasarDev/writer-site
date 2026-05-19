// Placeholder — full logic added when we build the admin panel

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  // Not logged in — redirect to login page
  res.redirect('/admin/login');
};

module.exports = { requireAdmin };