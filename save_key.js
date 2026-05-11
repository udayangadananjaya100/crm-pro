const db = require('./src/config/database');

async function save() {
  try {
    await db.initializeDatabase();
    await db.query(
      "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP",
      ['GEMINI_API_KEY', 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c']
    );
    console.log('SUCCESS: Gemini API Key saved to database.');
  } catch (err) {
    console.log('ERROR:', err.message);
  }
}

save();
