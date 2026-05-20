const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path.
// - In development (default): <project root>/database.db
// - In production: set DATABASE_PATH env var to a writable persistent
//   location (e.g. /data/database.db on Railway with a mounted Volume).
//
// Pointing it anywhere on an ephemeral disk in production will silently
// lose data on every redeploy, so the env var is the supported escape
// hatch rather than a guess based on NODE_ENV.
const DB_PATH = process.env.DATABASE_PATH
  || path.join(__dirname, '..', 'database.db');

// Create a single shared connection for the whole app
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Database] Failed to connect:', err.message);
    process.exit(1);
  }
  console.log('[Database] Connected to SQLite at', DB_PATH);
});

// Enable foreign key enforcement (off by default in SQLite)
db.run('PRAGMA foreign_keys = ON');

// ------------------------------------
// Promise wrappers — easier than callbacks everywhere
// ------------------------------------

/**
 * Run a query that doesn't return rows (INSERT, UPDATE, DELETE, CREATE).
 * Resolves with { lastID, changes }.
 */
db.runAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

/**
 * Get a single row.
 */
db.getAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

/**
 * Get all rows.
 */
db.allAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

module.exports = db;
