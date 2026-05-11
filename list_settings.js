const db = require('./src/config/database');

async function check() {
  try {
    await db.initializeDatabase();
    const result = await db.query("SELECT * FROM settings");
    console.log('ALL_SETTINGS:', result.rows);
  } catch (err) {
    console.log('ERROR:', err.message);
  }
}

check();
