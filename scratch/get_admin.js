const { query, initializeDatabase } = require('../src/config/database');

async function check() {
  try {
    await initializeDatabase();
    const result = await query("SELECT email FROM agents WHERE role='admin' LIMIT 1");
    console.log('Admin Email:', result.rows[0]?.email);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
