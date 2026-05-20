const db = require('../config/database');

// ---------------------------------------------------------------
// Validation helpers — local to this controller
// ---------------------------------------------------------------
const TITLE_MAX = 200;
const CONTENT_MAX = 200000;

/**
 * Coerce a string id from req.params into a positive integer,
 * or null. Used for safe parameter handling.
 */
function parseId(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Validate the form fields for create/update.
 * Returns { errors: string[], clean: { ... } }.
 *
 * - title: required, trimmed, length-capped
 * - content: optional, length-capped
 * - chapter_number: required, positive integer
 * - publish_date: optional. Accept blank (→ null). If present,
 *   must match YYYY-MM-DD and be a real date (no Feb 30).
 * - is_published: checkbox; presence → 1, absence → 0
 */
function validateChapterInput(body) {
  const errors = [];
  const title = (body.title || '').trim();
  const content = (body.content || '').toString();
  const rawNumber = (body.chapter_number || '').toString().trim();
  const rawDate = (body.publish_date || '').toString().trim();
  const isPublished = body.is_published === '1' || body.is_published === 'on' ? 1 : 0;

  if (!title) errors.push('Title is required.');
  if (title.length > TITLE_MAX) {
    errors.push(`Title must be ${TITLE_MAX} characters or fewer.`);
  }
  if (content.length > CONTENT_MAX) {
    errors.push(`Content must be ${CONTENT_MAX.toLocaleString()} characters or fewer.`);
  }

  let chapterNumber = null;
  if (!rawNumber) {
    errors.push('Chapter number is required.');
  } else {
    const n = Number.parseInt(rawNumber, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== rawNumber) {
      errors.push('Chapter number must be a positive integer.');
    } else {
      chapterNumber = n;
    }
  }

  let publishDate = null;
  if (rawDate) {
    // SQLite's DATE() accepts YYYY-MM-DD; we sanity-check it ourselves
    // so we get a friendly error instead of a silent NaN.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      errors.push('Publish date must be in YYYY-MM-DD format.');
    } else {
      // Reject impossible dates (Feb 30, etc.) by round-tripping.
      const d = new Date(rawDate + 'T00:00:00Z');
      const [yr, mo, da] = rawDate.split('-').map(Number);
      if (
        Number.isNaN(d.getTime()) ||
        d.getUTCFullYear() !== yr ||
        d.getUTCMonth() + 1 !== mo ||
        d.getUTCDate() !== da
      ) {
        errors.push('Publish date is not a valid calendar date.');
      } else {
        publishDate = rawDate;
      }
    }
  }

  return {
    errors,
    clean: {
      title,
      content,
      chapter_number: chapterNumber,
      publish_date: publishDate,
      is_published: isPublished,
    },
  };
}

/**
 * Suggest the next chapter_number for a book = max + 1 (or 1 if empty).
 * Pure suggestion — admin can override.
 */
async function suggestNextChapterNumber(bookId) {
  const row = await db.getAsync(
    'SELECT MAX(chapter_number) AS max FROM chapters WHERE book_id = ?',
    [bookId]
  );
  return (row && row.max ? row.max : 0) + 1;
}

/**
 * Today's date in YYYY-MM-DD as the server sees it.
 * Used as a default for new chapters' publish_date.
 */
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------
// Controller
// ---------------------------------------------------------------

const chapterController = {
  // ============================================================
  // PUBLIC
  // ============================================================

  /**
   * GET /chapters/:id
   * Render a single chapter, plus prev/next navigation within its book.
   * A chapter is only visible when:
   *   - is_published = 1
   *   - publish_date IS NULL OR publish_date <= today
   * Unpublished or future-scheduled chapters return 404 (not 403) so we
   * don't leak the existence of draft content.
   */
  showChapter: async (req, res, next) => {
    try {
      const chapterId = parseId(req.params.id);
      if (!chapterId) {
        return res.status(404).send('404 - Chapter not found');
      }

      const chapter = await db.getAsync(
        `SELECT id, book_id, title, chapter_number, content, publish_date, is_published
           FROM chapters
          WHERE id = ?
            AND is_published = 1
            AND (publish_date IS NULL OR publish_date <= DATE('now'))`,
        [chapterId]
      );

      if (!chapter) {
        return res.status(404).send('404 - Chapter not found');
      }

      const book = await db.getAsync(
        `SELECT id, title FROM books WHERE id = ?`,
        [chapter.book_id]
      );

      if (!book) {
        return res.status(404).send('404 - Chapter not found');
      }

      const prevChapter = await db.getAsync(
        `SELECT id, chapter_number, title
           FROM chapters
          WHERE book_id = ?
            AND is_published = 1
            AND (publish_date IS NULL OR publish_date <= DATE('now'))
            AND chapter_number < ?
          ORDER BY chapter_number DESC
          LIMIT 1`,
        [chapter.book_id, chapter.chapter_number]
      );

      const nextChapter = await db.getAsync(
        `SELECT id, chapter_number, title
           FROM chapters
          WHERE book_id = ?
            AND is_published = 1
            AND (publish_date IS NULL OR publish_date <= DATE('now'))
            AND chapter_number > ?
          ORDER BY chapter_number ASC
          LIMIT 1`,
        [chapter.book_id, chapter.chapter_number]
      );

      res.render('chapter-read', {
        title: `${book.title} — Chapter ${chapter.chapter_number}`,
        extraCss: 'reader',
        book,
        chapter,
        prevChapter,
        nextChapter,
      });
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // ADMIN
  // ============================================================

  /**
   * GET /admin/books/:bookId/chapters
   * List every chapter of a single book, including drafts and
   * future-scheduled ones, with status badges + edit/delete actions.
   */
  adminListChapters: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.bookId);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        'SELECT id, title FROM books WHERE id = ?',
        [bookId]
      );
      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const chapters = await db.allAsync(
        `SELECT id, title, chapter_number, publish_date, is_published, created_at
           FROM chapters
          WHERE book_id = ?
          ORDER BY chapter_number ASC, created_at ASC`,
        [bookId]
      );

      // Today's date for the template to compare publish_date against,
      // so it can render the "Scheduled" state correctly without each
      // row redoing the math.
      res.render('admin/chapter-list', {
        title: `Chapters: ${book.title}`,
        book,
        chapters,
        today: todayISO(),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/books/:bookId/chapters/new
   * Render the empty Add Chapter form. Pre-fills chapter_number
   * with the next available integer for this book, and publish_date
   * with today's date.
   */
  showNewChapterForm: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.bookId);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        'SELECT id, title FROM books WHERE id = ?',
        [bookId]
      );
      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const nextNumber = await suggestNextChapterNumber(bookId);

      res.render('admin/chapter-form', {
        title: 'Add Chapter',
        mode: 'new',
        book,
        chapter: {
          title: '',
          content: '',
          chapter_number: nextNumber,
          publish_date: todayISO(),
          is_published: 0,
        },
        errors: [],
        duplicateWarning: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/books/:bookId/chapters/new
   */
  createChapter: async (req, res, next) => {
    try {
      const bookId = parseId(req.params.bookId);
      if (!bookId) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        'SELECT id, title FROM books WHERE id = ?',
        [bookId]
      );
      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/admin/dashboard');
      }

      const { errors, clean } = validateChapterInput(req.body);

      if (errors.length) {
        return res.status(400).render('admin/chapter-form', {
          title: 'Add Chapter',
          mode: 'new',
          book,
          chapter: clean,
          errors,
          duplicateWarning: null,
        });
      }

      // Soft warning (not blocking) about duplicate chapter numbers.
      // The schema doesn't enforce uniqueness, so we let it through
      // but warn the admin via flash.
      const dup = await db.getAsync(
        `SELECT id FROM chapters
          WHERE book_id = ? AND chapter_number = ?`,
        [bookId, clean.chapter_number]
      );

      const result = await db.runAsync(
        `INSERT INTO chapters
           (book_id, title, chapter_number, content, publish_date, is_published)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          bookId,
          clean.title,
          clean.chapter_number,
          clean.content || null,
          clean.publish_date,
          clean.is_published,
        ]
      );

      if (dup) {
        req.flash(
          'error',
          `Heads up: another chapter in this book already uses number ${clean.chapter_number}. Reader navigation may behave unexpectedly.`
        );
      } else {
        req.flash('success', `Chapter "${clean.title}" created.`);
      }

      res.redirect(`/admin/books/${bookId}/chapters`);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/chapters/:id/edit
   */
  showEditChapterForm: async (req, res, next) => {
    try {
      const chapterId = parseId(req.params.id);
      if (!chapterId) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const chapter = await db.getAsync(
        `SELECT id, book_id, title, chapter_number, content, publish_date, is_published
           FROM chapters WHERE id = ?`,
        [chapterId]
      );
      if (!chapter) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        'SELECT id, title FROM books WHERE id = ?',
        [chapter.book_id]
      );
      if (!book) {
        // Orphan chapter (shouldn't happen with FK cascade, but...)
        req.flash('error', 'Parent book not found.');
        return res.redirect('/admin/dashboard');
      }

      res.render('admin/chapter-form', {
        title: 'Edit Chapter',
        mode: 'edit',
        book,
        chapter,
        errors: [],
        duplicateWarning: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/chapters/:id/edit
   */
  updateChapter: async (req, res, next) => {
    try {
      const chapterId = parseId(req.params.id);
      if (!chapterId) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const existing = await db.getAsync(
        `SELECT id, book_id, title, chapter_number, content, publish_date, is_published
           FROM chapters WHERE id = ?`,
        [chapterId]
      );
      if (!existing) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        'SELECT id, title FROM books WHERE id = ?',
        [existing.book_id]
      );
      if (!book) {
        req.flash('error', 'Parent book not found.');
        return res.redirect('/admin/dashboard');
      }

      const { errors, clean } = validateChapterInput(req.body);

      if (errors.length) {
        return res.status(400).render('admin/chapter-form', {
          title: 'Edit Chapter',
          mode: 'edit',
          book,
          chapter: { id: chapterId, book_id: existing.book_id, ...clean },
          errors,
          duplicateWarning: null,
        });
      }

      // Duplicate-number check, excluding the row being edited
      const dup = await db.getAsync(
        `SELECT id FROM chapters
          WHERE book_id = ? AND chapter_number = ? AND id != ?`,
        [existing.book_id, clean.chapter_number, chapterId]
      );

      await db.runAsync(
        `UPDATE chapters
            SET title = ?,
                chapter_number = ?,
                content = ?,
                publish_date = ?,
                is_published = ?
          WHERE id = ?`,
        [
          clean.title,
          clean.chapter_number,
          clean.content || null,
          clean.publish_date,
          clean.is_published,
          chapterId,
        ]
      );

      if (dup) {
        req.flash(
          'error',
          `Heads up: another chapter in this book already uses number ${clean.chapter_number}. Reader navigation may behave unexpectedly.`
        );
      } else {
        req.flash('success', `Chapter "${clean.title}" updated.`);
      }

      res.redirect(`/admin/books/${existing.book_id}/chapters`);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/chapters/:id/publish-toggle
   * Quick toggle from the chapter list. Flips is_published; does
   * NOT touch publish_date. POST-only (idempotent enough; not GET
   * so it can't be triggered cross-origin).
   */
  togglePublishChapter: async (req, res, next) => {
    try {
      const chapterId = parseId(req.params.id);
      if (!chapterId) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const existing = await db.getAsync(
        'SELECT id, book_id, title, is_published FROM chapters WHERE id = ?',
        [chapterId]
      );
      if (!existing) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const newValue = existing.is_published ? 0 : 1;
      await db.runAsync(
        'UPDATE chapters SET is_published = ? WHERE id = ?',
        [newValue, chapterId]
      );

      req.flash(
        'success',
        `Chapter "${existing.title}" is now ${newValue ? 'published' : 'a draft'}.`
      );
      res.redirect(`/admin/books/${existing.book_id}/chapters`);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/chapters/:id/delete
   * Show confirmation page.
   */
  showDeleteChapterForm: async (req, res, next) => {
    try {
      const chapterId = parseId(req.params.id);
      if (!chapterId) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const chapter = await db.getAsync(
        `SELECT id, book_id, title, chapter_number, is_published, publish_date
           FROM chapters WHERE id = ?`,
        [chapterId]
      );
      if (!chapter) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const book = await db.getAsync(
        'SELECT id, title FROM books WHERE id = ?',
        [chapter.book_id]
      );
      if (!book) {
        req.flash('error', 'Parent book not found.');
        return res.redirect('/admin/dashboard');
      }

      res.render('admin/chapter-delete', {
        title: 'Delete Chapter',
        book,
        chapter,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/chapters/:id/delete
   */
  deleteChapter: async (req, res, next) => {
    try {
      const chapterId = parseId(req.params.id);
      if (!chapterId) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      const existing = await db.getAsync(
        'SELECT id, book_id, title FROM chapters WHERE id = ?',
        [chapterId]
      );
      if (!existing) {
        req.flash('error', 'Chapter not found.');
        return res.redirect('/admin/dashboard');
      }

      await db.runAsync('DELETE FROM chapters WHERE id = ?', [chapterId]);

      req.flash('success', `Chapter "${existing.title}" deleted.`);
      res.redirect(`/admin/books/${existing.book_id}/chapters`);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = chapterController;
