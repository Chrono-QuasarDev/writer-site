const db = require('../config/database');

const chapterController = {
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
      const chapterId = Number.parseInt(req.params.id, 10);

      if (!Number.isInteger(chapterId) || chapterId <= 0) {
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

      // Defensive: if the parent book was deleted but the chapter row
      // somehow remains (shouldn't happen with ON DELETE CASCADE, but...).
      if (!book) {
        return res.status(404).send('404 - Chapter not found');
      }

      // Find the previous and next *published* chapters within the same book,
      // by chapter_number. Two small queries keep memory low even for long books.
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
};

module.exports = chapterController;
