const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'procrm.db');

try {
  const db = new Database(DB_PATH);
  const row = db.prepare("SELECT value FROM settings WHERE key = 'GEMINI_API_KEY'").get();
  if (row) {
    console.log('FOUND:', row.value);
  } else {
    console.log('NOT_FOUND');
  }
} catch (err) {
  console.log('ERROR:', err.message);
}
