const { query, initializeDatabase } = require('../src/config/database');
const bcrypt = require('bcryptjs');

async function createAgent() {
  try {
    await initializeDatabase();
    const passwordHash = await bcrypt.hash('agent123', 10);
    await query(
      `INSERT INTO agents (email, password_hash, display_name, role, team)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET role = 'agent'`,
      ['auditagent@procrm.com', passwordHash, 'Audit Agent', 'agent', 'general_pool']
    );
    console.log('Agent created: auditagent@procrm.com / agent123');
  } catch (err) {
    console.error('Creation failed:', err.message);
  } finally {
    process.exit();
  }
}

createAgent();
