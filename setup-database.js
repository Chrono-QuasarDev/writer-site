// Run with: npm run setup
// - Creates all tables (idempotent — safe to run multiple times)
// - Creates the admin user from .env
// - Optionally seeds sample data with: npm run setup -- --seed

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./config/database');

const SHOULD_SEED = process.argv.includes('--seed');
const BCRYPT_ROUNDS = 10;

// ------------------------------------
// Table definitions
// ------------------------------------
const createBooksTable = `
  CREATE TABLE IF NOT EXISTS books (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT,
    cover_image   TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

const createChaptersTable = `
  CREATE TABLE IF NOT EXISTS chapters (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id         INTEGER NOT NULL,
    title           TEXT    NOT NULL,
    chapter_number  INTEGER NOT NULL,
    content         TEXT,
    publish_date    DATE,
    is_published    INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  )
`;

const createAdminTable = `
  CREATE TABLE IF NOT EXISTS admin (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT    NOT NULL UNIQUE,
    password_hash  TEXT    NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

// Useful indexes for common queries
const createIndexes = [
  `CREATE INDEX IF NOT EXISTS idx_chapters_book_id      ON chapters(book_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_published    ON chapters(is_published)`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_publish_date ON chapters(publish_date)`,
];

// ------------------------------------
// Setup steps
// ------------------------------------

async function createTables() {
  console.log('[Setup] Creating tables...');
  await db.runAsync(createBooksTable);
  console.log('  ✓ books');
  await db.runAsync(createChaptersTable);
  console.log('  ✓ chapters');
  await db.runAsync(createAdminTable);
  console.log('  ✓ admin');

  console.log('[Setup] Creating indexes...');
  for (const sql of createIndexes) {
    await db.runAsync(sql);
  }
  console.log('  ✓ indexes ready');
}

async function createAdminUser() {
  const username = 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      'ADMIN_PASSWORD is not set in .env — cannot create admin user.'
    );
  }

  const existing = await db.getAsync(
    'SELECT id FROM admin WHERE username = ?',
    [username]
  );

  if (existing) {
    console.log('[Setup] Admin user already exists — skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.runAsync(
    'INSERT INTO admin (username, password_hash) VALUES (?, ?)',
    [username, passwordHash]
  );
  console.log(`[Setup] Created admin user "${username}".`);
}

// ------------------------------------
// Sample seed data
// ------------------------------------

const sampleBooks = [
  {
    title: 'The Cartographer of Lost Things',
    description:
      'A young mapmaker discovers that the blank spaces on her charts are not empty — they are waiting. A meditation on memory, distance, and the things we leave behind.',
    cover_image: null,
    chapters: [
      {
        title: 'The First Map',
        content:
          'When Elara was seven years old, her grandfather gave her a blank sheet of parchment and told her it was the most important map she would ever own. "But there is nothing on it," she said. He smiled. "Exactly."',
      },
      {
        title: 'North of Nowhere',
        content:
          'The compass spun without settling. Elara had read about places where instruments failed, but she had assumed they were stories. The forest around her seemed to lean in, listening.',
      },
      {
        title: 'The Cartographer\'s Confession',
        content:
          'There is a secret all mapmakers carry: every map is a lie. We flatten what is round, we name what was nameless, we draw borders where the earth itself draws none.',
      },
    ],
  },
  {
    title: 'Salt and Iron',
    description:
      'On a remote coastal forge, a blacksmith\'s apprentice learns that some metals remember the shape of the people who shaped them.',
    cover_image: null,
    chapters: [
      {
        title: 'The Apprentice',
        content:
          'Tomas had been at the forge for six months before Master Reyn spoke more than ten words to him in a single day. On that day, the master said: "Today you will ruin something. Try to learn from it."',
      },
      {
        title: 'The Forge by the Sea',
        content:
          'Salt air is the enemy of steel — every smith knows this. Master Reyn had built his forge twenty paces from the tide line anyway. Tomas had stopped asking why.',
      },
      {
        title: 'What the Hammer Knows',
        content:
          'There is a moment, Master Reyn said, when the metal stops resisting and starts agreeing. Most smiths never feel it. The ones who do never quite leave the forge again, not really.',
      },
    ],
  },
];

async function seedSampleData() {
  console.log('[Setup] Seeding sample data...');

  // Skip if any books already exist — avoid duplicates on repeated runs
  const existing = await db.getAsync('SELECT COUNT(*) AS count FROM books');
  if (existing.count > 0) {
    console.log(
      `[Setup] Found ${existing.count} existing book(s) — skipping seed.`
    );
    return;
  }

  for (const book of sampleBooks) {
    const result = await db.runAsync(
      'INSERT INTO books (title, description, cover_image) VALUES (?, ?, ?)',
      [book.title, book.description, book.cover_image]
    );
    const bookId = result.lastID;
    console.log(`  ✓ book: "${book.title}" (id ${bookId})`);

    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      await db.runAsync(
        `INSERT INTO chapters
           (book_id, title, chapter_number, content, publish_date, is_published)
         VALUES (?, ?, ?, ?, DATE('now'), 1)`,
        [bookId, chapter.title, i + 1, chapter.content]
      );
    }
    console.log(`    + ${book.chapters.length} chapters`);
  }
}

// ------------------------------------
// Main
// ------------------------------------

async function main() {
  try {
    await createTables();
    await createAdminUser();

    if (SHOULD_SEED) {
      await seedSampleData();
    } else {
      console.log('[Setup] Skipping seed data (pass --seed to include it).');
    }

    console.log('\n[Setup] ✅ Database is ready.');
  } catch (err) {
    console.error('\n[Setup] ❌ Failed:', err.message);
    process.exitCode = 1;
  } finally {
    db.close((err) => {
      if (err) console.error('[Setup] Error closing database:', err.message);
    });
  }
}

main();