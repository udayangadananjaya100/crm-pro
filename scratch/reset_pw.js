const bcrypt = require('bcryptjs');
const { initializeDatabase, query } = require('../src/config/database');

async function resetPassword() {
  await initializeDatabase();
  const hash = await bcrypt.hash('admin123', 10);
  console.log('New hash:', hash);
  const result = await query('UPDATE agents SET password_hash = $1 WHERE email = $2', [hash, 'admin@procrm.com']);
  console.log('Result:', result.rowCount);
  process.exit();
}

resetPassword();
