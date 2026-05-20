const db = require('../config/database');

const bookController = {
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
   * A chapter counts as "published" when is_published = 1 AND
   * its publish_date is on or before today.
   */
  showBook: async (req, res, next) => {
    try {
      const bookId = Number.parseInt(req.params.id, 10);

      // Reject non-numeric ids early (e.g. /books/abc) — treat as not found.
      if (!Number.isInteger(bookId) || bookId <= 0) {
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
};

module.exports = bookController;
