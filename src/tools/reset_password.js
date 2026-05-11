/**
 * Pro CRM — CLI Password Reset Tool
 * Usage: node src/tools/reset_password.js <email> <new_password>
 */
const bcrypt = require('bcryptjs');
const { initializeDatabase, query, close } = require('../config/database');
const logger = require('../utils/logger');

async function resetPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.log('');
    console.log('  ❌ Error: Missing arguments');
    console.log('  Usage: node src/tools/reset_password.js <email> <new_password>');
    console.log('');
    process.exit(1);
  }

  // Initialize DB adapter
  await initializeDatabase();

  try {
    console.log(`⏳ Resetting password for ${email}...`);
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Check if user exists first
    const check = await query('SELECT id FROM agents WHERE email = $1', [email]);
    if (check.rows.length === 0) {
      console.error(`  ❌ Error: User with email "${email}" not found.`);
      return;
    }

    await query(
      'UPDATE agents SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
      [passwordHash, email]
    );

    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║        ✅ Password Reset Successful!         ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log(`  User: ${email}`);
    console.log('');
  } catch (err) {
    console.error('  ❌ Reset failed:', err.message);
  } finally {
    await close();
    process.exit(0);
  }
}

resetPassword();
