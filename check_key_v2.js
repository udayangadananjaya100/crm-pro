const db = require('./src/config/database');

async function check() {
  try {
    await db.initializeDatabase();
    const result = await db.query("SELECT key, value FROM settings WHERE key = 'GEMINI_API_KEY'");
    if (result && result.rows && result.rows.length > 0) {
      console.log('FOUND_RAW:', result.rows[0].value);
    } else {
      console.log('NOT_FOUND_IN_DB');
    }
  } catch (err) {
    console.log('ERROR:', err.message);
  }
}

check();
