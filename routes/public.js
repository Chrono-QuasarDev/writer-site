const express = require('express');
const router = express.Router();

const bookController = require('../controllers/bookController');
const chapterController = require('../controllers/chapterController');

// Home page — book library
router.get('/', bookController.listBooks);

// Single book detail + chapter list
router.get('/books/:id', bookController.showBook);

// Chapter reading page
router.get('/chapters/:id', chapterController.showChapter);

module.exports = router;