const express = require('express');
const multer = require('multer');
const router = express.Router();

const { requireAdmin, redirectIfAuth } = require('../middleware/auth');
const { uploadCover } = require('../middleware/upload');
const adminController = require('../controllers/adminController');
const bookController = require('../controllers/bookController');
const chapterController = require('../controllers/chapterController');

// ---------------------------------------------------------------
// Wrap multer so its errors (file too big, wrong type) don't
// crash the request — instead they get attached to req.fileError
// and the controller surfaces them alongside other validation
// errors, keeping the user's form input visible.
// ---------------------------------------------------------------
function handleUpload(req, res, next) {
  uploadCover(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        req.fileError = 'Cover image must be 2 MB or smaller.';
      } else {
        req.fileError = 'Cover upload failed: ' + err.message;
      }
    } else if (err.code === 'INVALID_FILE_TYPE') {
      req.fileError = err.message;
    } else {
      return next(err);
    }
    next();
  });
}

// ---------------------------------------------------------------
// Public admin routes (no requireAdmin)
// ---------------------------------------------------------------
router.get('/login', redirectIfAuth, adminController.showLogin);
router.post('/login', redirectIfAuth, adminController.handleLogin);
router.post('/logout', adminController.handleLogout);

// ---------------------------------------------------------------
// Protected admin routes
// ---------------------------------------------------------------
router.use(requireAdmin);

// Dashboard — book list with actions
router.get('/dashboard', bookController.adminDashboard);

// Book CRUD
router.get('/books/new', bookController.showNewBookForm);
router.post('/books/new', handleUpload, bookController.createBook);

router.get('/books/:id/edit', bookController.showEditBookForm);
router.post('/books/:id/edit', handleUpload, bookController.updateBook);

router.get('/books/:id/delete', bookController.showDeleteBookForm);
router.post('/books/:id/delete', bookController.deleteBook);

// Chapter CRUD
// List + create are nested under their book (you always create
// a chapter FOR a specific book). Edit/delete/toggle use just
// the chapter id since they already imply the book.
router.get('/books/:bookId/chapters', chapterController.adminListChapters);
router.get('/books/:bookId/chapters/new', chapterController.showNewChapterForm);
router.post('/books/:bookId/chapters/new', chapterController.createChapter);

router.get('/chapters/:id/edit', chapterController.showEditChapterForm);
router.post('/chapters/:id/edit', chapterController.updateChapter);

router.get('/chapters/:id/delete', chapterController.showDeleteChapterForm);
router.post('/chapters/:id/delete', chapterController.deleteChapter);

router.post('/chapters/:id/publish-toggle', chapterController.togglePublishChapter);

module.exports = router;
