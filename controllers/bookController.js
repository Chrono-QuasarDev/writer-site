const db = require('../config/database');
const { processCover, deleteCover } = require('../middleware/upload');

// ---------------------------------------------------------------
// Validation helpers — kept tiny, no dependency
// ---------------------------------------------------------------
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

function validateBookInput(body) {
  const errors = [];
  const title = (body.title || '').trim();
  const description = (body.description || '').trim();

  if (!title) errors.push('Title is required.');
  if (title.length > TITLE_MAX) {
    errors.push(`Title must be ${TITLE_MAX} characters or fewer.`);
  }
  if (description.length > DESCRIPTION_MAX) {
    errors.push(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
  }
  return { errors, clean: { title, description } };
}

function parseId(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------
// Controller
// ---------------------------------------------------------------

const bookController = {
  // ============================================================
  // PUBLIC
  // ============================================================

  /**
   * GET /
   * Homepage — list all books with their chapter counts.
   */
  listBooks: async (req, res, next) => {
    try {
      const books = await db.allAsync(`
        SELECT
          b.id,
          b.title,
          b.description,
          b.cover_image,
          b.created_at,
          COUNT(c.id) AS chapter_count
        FROM books b
        LEFT JOIN chapters c
          ON c.book_id = b.id AND c.is_published = 1
        GROUP BY b.id
        ORDER BY b.created_at DESC
      `);

      res.render('home', {
        title: 'Library',
        books,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /books/:id
   * Book detail page — show book info + its published chapters.
   */
  showBook: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.id);
      if (!bookId) {
        return res.status(404).send('404 - Book not found');
      }

      const book = await db.getAsync(
        `SELECT id, title, description, cover_image, created_at
           FROM books
          WHERE id = ?`,
        [bookId]
      );

      if (!book) {
        return res.status(404).send('404 - Book not found');
      }

      const chapters = await db.allAsync(
        `SELECT id, title, chapter_number, publish_date
           FROM chapters
          WHERE book_id = ?
            AND is_published = 1
            AND (publish_date IS NULL OR publish_date <= DATE('now'))
          ORDER BY chapter_number ASC`,
        [bookId]
      );

      res.render('book-detail', {
        title: book.title,
        book,
        chapters,
      });
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // ADMIN
  // ============================================================

  /**
   * GET /admin/dashboard
   * Admin home — list every book with chapter count and actions.
   * Includes both published and unpublished chapters in the count
   * so the admin sees the true total (unlike the public homepage,
   * which only counts published).
   */
  adminDashboard: async (req, res, next) => {
    try {
      const books = await db.allAsync(`
        SELECT
          b.id,
          b.title,
          b.cover_image,
          b.created_at,
          COUNT(c.id) AS chapter_count
        FROM books b
        LEFT JOIN chapters c ON c.book_id = b.id
        GROUP BY b.id
        ORDER BY b.created_at DESC
      `);

      res.render('admin/dashboard', {
        title: 'Dashboard',
        books,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/books/new
   * Render the empty Add Book form.
   */
  showNewBookForm: (req, res) => {
    res.render('admin/book-form', {
      title: 'Add Book',
      mode: 'new',
      book: { title: '', description: '', cover_image: null },
      errors: [],
    });
  },

  /**
   * POST /admin/books/new
   * Validate, optionally process a cover upload, insert.
   */
  createBook: async (req, res, next) => {
    try {
      const { errors, clean } = validateBookInput(req.body);

      // multer-level errors (size/type) surface via req.fileError;
      // we set that in routes/admin.js via a wrapper.
      if (req.fileError) errors.push(req.fileError);

      if (errors.length) {
        // Clean up any cover that was processed before validation
        // failed (shouldn't happen since multer runs first, but
        // belt and braces if validation gets reordered).
        return res.status(400).render('admin/book-form', {
          title: 'Add Book',
          mode: 'new',
          book: { ...clean, cover_image: null },
          errors,
        });
      }

      let coverFilename = null;
      if (req.file) {
        try {
          coverFilename = await processCover(req.file);
        } catch (err) {
          return res.status(400).render('admin/book-form', {
            title: 'Add Book',
            mode: 'new',
            book: { ...clean, cover_image: null },
            errors: [err.message || 'Cover upload failed.'],
          });
        }
      }

      const result = await db.runAsync(
        `INSERT INTO books (title, description, cover_image)
         VALUES (?, ?, ?)`,
        [clean.title, clean.description || null, coverFilename]
      );

      req.flash('success', `Book "${clean.title}" created.`);
      res.redirect('/admin/dashboard');
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/books/:id/edit
   * Render the Edit Book form pre-populated.
   */
  showEditBookForm: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.id);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        `SELECT id, title, description, cover_image
           FROM books WHERE id = ?`,
        [bookId]
      );

      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      res.render('admin/book-form', {
        title: 'Edit Book',
        mode: 'edit',
        book,
        errors: [],
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/books/:id/edit
   * Update fields; optionally replace or remove the cover.
   */
  updateBook: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.id);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const existing = await db.getAsync(
        `SELECT id, title, description, cover_image
           FROM books WHERE id = ?`,
        [bookId]
      );
      if (!existing) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const { errors, clean } = validateBookInput(req.body);
      if (req.fileError) errors.push(req.fileError);

      if (errors.length) {
        return res.status(400).render('admin/book-form', {
          title: 'Edit Book',
          mode: 'edit',
          book: { id: bookId, ...clean, cover_image: existing.cover_image },
          errors,
        });
      }

      // Cover handling rules:
      //   - new file uploaded → replace, delete old file
      //   - "remove_cover" checkbox set → null out, delete old file
      //   - otherwise → leave the existing cover alone
      let newCover = existing.cover_image;
      let oldCoverToDelete = null;

      const wantRemove = req.body.remove_cover === '1' || req.body.remove_cover === 'on';

      if (req.file) {
        try {
          newCover = await processCover(req.file);
          oldCoverToDelete = existing.cover_image;
        } catch (err) {
          return res.status(400).render('admin/book-form', {
            title: 'Edit Book',
            mode: 'edit',
            book: { id: bookId, ...clean, cover_image: existing.cover_image },
            errors: [err.message || 'Cover upload failed.'],
          });
        }
      } else if (wantRemove) {
        newCover = null;
        oldCoverToDelete = existing.cover_image;
      }

      await db.runAsync(
        `UPDATE books
            SET title = ?, description = ?, cover_image = ?
          WHERE id = ?`,
        [clean.title, clean.description || null, newCover, bookId]
      );

      if (oldCoverToDelete) {
        await deleteCover(oldCoverToDelete);
      }

      req.flash('success', `Book "${clean.title}" updated.`);
      res.redirect('/admin/dashboard');
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/books/:id/delete
   * Show a dedicated "Are you sure?" confirmation page.
   */
  showDeleteBookForm: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.id);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        `SELECT b.id, b.title, b.cover_image, COUNT(c.id) AS chapter_count
           FROM books b
           LEFT JOIN chapters c ON c.book_id = b.id
          WHERE b.id = ?
          GROUP BY b.id`,
        [bookId]
      );

      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      res.render('admin/book-delete', {
        title: 'Delete Book',
        book,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/books/:id/delete
   * Hard-delete the book. Chapters cascade via FK; we also unlink
   * the cover file on disk so uploads/ doesn't grow forever.
   */
  deleteBook: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.id);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const existing = await db.getAsync(
        `SELECT id, title, cover_image FROM books WHERE id = ?`,
        [bookId]
      );
      if (!existing) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      await db.runAsync(`DELETE FROM books WHERE id = ?`, [bookId]);

      if (existing.cover_image) {
        await deleteCover(existing.cover_image);
      }

      req.flash('success', `Book "${existing.title}" deleted.`);
      res.redirect('/admin/dashboard');
    } catch (err) {
      next(err);
    }
  },
};

module.exports = bookController;
