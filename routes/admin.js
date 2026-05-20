const express = require('express');
const router = express.Router();

const { requireAdmin, redirectIfAuth } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// ---------------------------------------------------------------
// Public admin routes (no requireAdmin)
// ---------------------------------------------------------------
// Login form & submission. redirectIfAuth bounces already-logged-in
// users to the dashboard so they don't see the form needlessly.
router.get('/login', redirectIfAuth, adminController.showLogin);
router.post('/login', redirectIfAuth, adminController.handleLogin);

// Logout. POST only — prevents drive-by logout via cross-origin GET
// (e.g. an <img src="/admin/logout">). The form button in the layout
// submits to this.
router.post('/logout', adminController.handleLogout);

// ---------------------------------------------------------------
// Protected admin routes
// ---------------------------------------------------------------
// Everything below this line requires a valid admin session.
// New protected routes added in future phases just register
// normally below this — no need to remember requireAdmin per route.
router.use(requireAdmin);

router.get('/dashboard', adminController.showDashboard);

// Placeholders for the next CRUD phases. Now correctly behind
// requireAdmin, so they'll redirect to /admin/login when unauthed.
router.get('/books/new', (req, res) => {
  res.send('Add book form — coming soon');
});

router.get('/chapters/new', (req, res) => {
  res.send('Add chapter form — coming soon');
});

module.exports = router;
