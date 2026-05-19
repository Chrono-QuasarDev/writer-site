// Run once with: npm run setup
// Creates all tables if they don't already exist

require('dotenv').config();
const db = require('./config/database');

console.log('[Setup] Creating database tables...');

// Tables will be defined here in the next step
// For now, just verify the connection works

db.serialize(() => {
  console.log('[Setup] Database connection verified.');
  console.log('[Setup] No tables defined yet — add them in the next step.');

  db.close((err) => {
    if (err) {
      console.error('[Setup] Error closing database:', err.message);
    } else {
      console.log('[Setup] Done. Database connection closed.');
    }
  });
});