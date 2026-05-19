const express = require('express');
const router = express.Router();

// Middleware and controllers will be wired up in later steps
// const { requireAdmin } = require('../middleware/auth');
// const adminController = require('../controllers/adminController');

// Login page
router.get('/login', (req, res) => {
  res.send('Admin login page — coming soon');
});

// Dashboard (will be protected)
router.get('/dashboard', (req, res) => {
  res.send('Admin dashboard — coming soon');
});

// Add book form
router.get('/books/new', (req, res) => {
  res.send('Add book form — coming soon');
});

// Add chapter form
router.get('/chapters/new', (req, res) => {
  res.send('Add chapter form — coming soon');
});

module.exports = router;