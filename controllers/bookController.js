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
   * GET /books/:id — placeholder for next phase
   */
  showBook: (req, res) => {
    res.send(`Book detail page for book ID: ${req.params.id} — coming soon`);
  },
};

module.exports = bookController;