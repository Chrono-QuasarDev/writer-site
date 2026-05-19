const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file sits in the project root
const DB_PATH = path.join(__dirname, '..', 'database.db');

// Create a single shared connection for the whole app
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Database] Failed to connect:', err.message);
    process.exit(1); // No point running without a database
  }
  console.log('[Database] Connected to SQLite at', DB_PATH);
});

// Enable foreign key enforcement (SQLite has this off by default)
db.run('PRAGMA foreign_keys = ON');

module.exports = db;