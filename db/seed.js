/**
 * Pro CRM — Database Seeder
 * Creates initial admin user and sample data
 * Works with both PostgreSQL and SQLite
 */
const bcrypt = require('bcryptjs');
const { initializeDatabase, query, close } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function seed() {
  logger.info('🌱 Seeding database...');

  // Initialize DB adapter first
  await initializeDatabase();

  try {
    // ─────────────────────────────────
    // 1. Create Admin Agent
    // ─────────────────────────────────
    const adminPassword = await bcrypt.hash('admin123', 10);
    await query(
      `INSERT INTO agents (email, password_hash, display_name, role, team, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      ['admin@procrm.com', adminPassword, 'System Admin', 'admin', 'general_pool', 'active']
    );
    logger.info('✅ Admin agent created (admin@procrm.com / admin123)');

    const seedSettings = [
      ['setup_completed', JSON.stringify('true'), 'system', 'Demo seed has completed first-run setup', false],
      ['company_name', JSON.stringify('Pro CRM'), 'branding', 'Company name', true],
    ];

    for (const setting of seedSettings) {
      await query(
        `INSERT INTO settings (key, value, category, description, is_public, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             category = EXCLUDED.category,
             description = EXCLUDED.description,
             is_public = EXCLUDED.is_public,
             updated_at = CURRENT_TIMESTAMP`,
        setting
      );
    }
    logger.info('✅ Demo settings initialized');

    // ─────────────────────────────────
    // 2. Create Team Lead Agents
    // ─────────────────────────────────
    const agentPassword = await bcrypt.hash('agent123', 10);

    const agents = [
      { email: 'sales.lead@procrm.com', name: 'Sales Lead', role: 'team_lead', team: 'sales' },
      { email: 'support.lead@procrm.com', name: 'Support Lead', role: 'team_lead', team: 'support' },
      { email: 'finance.lead@procrm.com', name: 'Finance Lead', role: 'team_lead', team: 'finance' },
      { email: 'agent1@procrm.com', name: 'Agent Kasun', role: 'agent', team: 'sales' },
      { email: 'agent2@procrm.com', name: 'Agent Nimali', role: 'agent', team: 'support' },
    ];

    for (const agent of agents) {
      await query(
        `INSERT INTO agents (email, password_hash, display_name, role, team, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (email) DO NOTHING`,
        [agent.email, agentPassword, agent.name, agent.role, agent.team]
      );
    }
    logger.info(`✅ ${agents.length} team agents created (password: agent123)`);

    // ─────────────────────────────────
    // 3. Create Sample Contacts
    // ─────────────────────────────────
    const contacts = [
      { phone: '+94771234567', name: 'Kamal Perera', lang: 'si', score: 75 },
      { phone: '+94772345678', name: 'Nimal Silva', lang: 'en', score: 45 },
      { phone: '+94773456789', name: 'Amaya Fernando', lang: 'mixed', score: 90 },
      { phone: '+94774567890', name: 'Ruwan Jayasinghe', lang: 'si', score: 30 },
      { phone: '+94775678901', name: 'Sarah Anderson', lang: 'en', score: 60 },
    ];

    for (const c of contacts) {
      await query(
        `INSERT INTO contacts (phone_number, phone_number_masked, display_name, language_preference, lead_score, status, last_message_at)
         VALUES ($1, $2, $3, $4, $5, 'active', datetime('now', '-' || $6 || ' hours'))
         ON CONFLICT (phone_number) DO NOTHING`,
        [c.phone, `***-***-${c.phone.slice(-4)}`, c.name, c.lang, c.score, Math.floor(Math.random() * 48).toString()]
      );
    }
    logger.info(`✅ ${contacts.length} sample contacts created`);

    // ─────────────────────────────────
    // 4. Create Sample Conversations
    // ─────────────────────────────────
    const contactRows = await query('SELECT id, display_name FROM contacts ORDER BY created_at LIMIT 5');

    const intentOptions = ['sales', 'support', 'billing', 'general'];
    const teamOptions = ['sales', 'support', 'finance', 'general_pool'];
    const priorityOptions = ['low', 'normal', 'high', 'urgent'];
    const statusOptions = ['open', 'assigned', 'pending'];

    for (let i = 0; i < contactRows.rows.length; i++) {
      const contact = contactRows.rows[i];
      const intent = intentOptions[i % intentOptions.length];
      const team = teamOptions[i % teamOptions.length];
      const priority = priorityOptions[i % priorityOptions.length];
      const status = statusOptions[i % statusOptions.length];
      const msgCount = Math.floor(Math.random() * 10) + 1;

      const convResult = await query(
        `INSERT INTO conversations (contact_id, status, assigned_team, intent, priority, window_expires_at, message_count)
         VALUES ($1, $2, $3, $4, $5, datetime('now', '+24 hours'), $6)`,
        [contact.id, status, team, intent, priority, msgCount]
      );

      const convId = convResult.rows[0]?.id;
      if (!convId) continue;

      // Add sample messages
      const sampleMessages = [
        { dir: 'inbound', content: 'Hello, I need help with pricing', type: 'text' },
        { dir: 'outbound', content: "Welcome! I'd be happy to help with pricing. What service are you interested in?", type: 'text' },
        { dir: 'inbound', content: 'I want the premium plan', type: 'text' },
      ];

      for (const msg of sampleMessages) {
        await query(
          `INSERT INTO messages (conversation_id, contact_id, direction, message_type, content, content_masked, status, ai_generated)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
          [convId, contact.id, msg.dir, msg.type, msg.content,
           msg.dir === 'inbound' ? 'received' : 'sent',
           msg.dir === 'outbound' ? 1 : 0]
        );
      }
    }
    logger.info('✅ Sample conversations with messages created');

    // ─────────────────────────────────
    // 5. Create Sample Audit Logs
    // ─────────────────────────────────
    const auditEntries = [
      { agent: 'pre_filter', action: 'continue', intent: 'sales', confidence: 0.85, flags: '[]' },
      { agent: 'orchestrator', action: 'auto_send', intent: 'sales', confidence: 0.85, flags: '[]' },
      { agent: 'compliance', action: 'approved', intent: 'sales', confidence: 0.85, flags: '[]' },
      { agent: 'routing', action: 'auto_send', intent: 'sales', confidence: 0.85, flags: '[]' },
      { agent: 'pre_filter', action: 'continue', intent: 'support', confidence: 0.72, flags: '["new_contact"]' },
      { agent: 'orchestrator', action: 'auto_send', intent: 'support', confidence: 0.72, flags: '["low_confidence"]' },
      { agent: 'compliance', action: 'approved', intent: 'support', confidence: 0.72, flags: '["pii_detected"]' },
      { agent: 'pre_filter', action: 'off_hours_reply', intent: 'general', confidence: 0.90, flags: '["off_hours"]' },
    ];

    for (const entry of auditEntries) {
      await query(
        `INSERT INTO audit_logs (agent_type, action, intent, confidence, flags)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.agent, entry.action, entry.intent, entry.confidence, entry.flags]
      );
    }
    logger.info(`✅ ${auditEntries.length} audit log entries created`);

    logger.info('');
    logger.info('╔══════════════════════════════════════════════╗');
    logger.info('║        🌱 Database Seeded Successfully!      ║');
    logger.info('╚══════════════════════════════════════════════╝');
    logger.info('');
    logger.info('  Admin Login:    admin@procrm.com / admin123');
    logger.info('  Agent Login:    agent1@procrm.com / agent123');
    logger.info('');

  } catch (err) {
    logger.error('❌ Seed failed:', { error: err.message, stack: err.stack });
    throw err;
  }
}

if (require.main === module) {
  seed()
    .then(() => close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seed };
