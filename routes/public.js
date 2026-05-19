const express = require('express');
const router = express.Router();

// Controllers will be wired up in later steps
// const bookController = require('../controllers/bookController');
// const chapterController = require('../controllers/chapterController');

// Home page — book library
router.get('/', (req, res) => {
  res.send('Home page — coming soon');
});

// Single book detail + chapter list
router.get('/books/:id', (req, res) => {
  res.send(`Book detail page for book ID: ${req.params.id} — coming soon`);
});

// Chapter reading page
router.get('/chapters/:id', (req, res) => {
  res.send(`Chapter reading page for chapter ID: ${req.params.id} — coming soon`);
});

module.exports = router;