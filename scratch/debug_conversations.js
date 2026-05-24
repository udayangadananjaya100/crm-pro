const { initializeDatabase, query } = require('../src/config/database');

async function debug() {
  await initializeDatabase();
  const contacts = await query("SELECT id, phone_number, display_name, status FROM contacts WHERE phone_number = '94771234567'");
  console.log('Contacts for 94771234567:', contacts.rows);

  const convs = await query("SELECT id, contact_id, status, assigned_agent_id FROM conversations");
  console.log('All Conversations:', convs.rows);
}

debug().catch(console.error);
