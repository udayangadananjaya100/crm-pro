const db = require('./src/config/database');

async function fix() {
  const correctKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  try {
    await db.initializeDatabase();
    await db.query(
      "UPDATE settings SET value = $1 WHERE key = 'GEMINI_API_KEY'",
      [correctKey]
    );
    console.log('SUCCESS: Gemini API Key corrected in database.');
  } catch (err) {
    console.log('ERROR:', err.message);
  }
}

fix();
