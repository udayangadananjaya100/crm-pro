/**
 * Pro CRM — API Routes
 * RESTful endpoints for contacts, conversations, messages, and admin
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const { authenticate, authorize } = require('../middleware');
const contactService = require('../services/contact');
const conversationService = require('../services/conversation');
const intelligenceService = require('../services/intelligence');
const analyticsService = require('../services/analytics');
const cannedResponseService = require('../services/cannedResponse');
const scheduledMessageService = require('../services/scheduledMessage');
const bookingService = require('../services/booking');
const auditLogger = require('../agents/auditLogger');
const { getQueueStats } = require('../queues/messageQueue');
const { getRulesVersion, reloadRules } = require('../utils/rulesLoader');
const { query, transaction, getAdapter } = require('../config/database');
const { jsonToCsv } = require('../utils/csv');
const events = require('../utils/events');
const logger = require('../utils/logger');
const { validate } = require('../middleware/validator');
const { bruteForceLimiter } = require('../middleware');

const multer = require('multer');
const upload = multer({ 
  dest: 'temp/uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────
// VALIDATION SCHEMAS
// ─────────────────────────────────────
const schemas = {
  login: {
    email: { required: true, type: 'email' },
    password: { required: true, min: 6 }
  },
  register: {
    email: { required: true, type: 'email' },
    password: { required: true, min: 8 },
    displayName: { required: true, min: 2, max: 50 },
    role: { required: true, enum: ['admin', 'manager', 'team_lead', 'agent'] },
    team: { required: true, enum: ['general_pool', 'sales', 'support', 'finance', 'billing'] }
  },
  agentUpdate: {
    displayName: { min: 2, max: 50 },
    role: { enum: ['admin', 'manager', 'team_lead', 'agent'] },
    team: { enum: ['general_pool', 'sales', 'support', 'finance', 'billing'] },
    status: { enum: ['active', 'inactive', 'suspended'] }
  },
  contact: {
    name: { required: true, min: 2 },
    phone: { required: true, type: 'phone' }
  },
  changePassword: {
    oldPassword: { required: true },
    newPassword: { required: true, min: 8 }
  }
};

// ─────────────────────────────────────
// AUTH
// ─────────────────────────────────────

/**
 * POST /api/auth/login
 */
router.post('/auth/login', bruteForceLimiter, validate(schemas.login), async (req, res) => {
  try {
    console.log(`[AUTH] Login attempt for: ${req.body.email}`);
    const { email, password } = req.body;


    const result = await query('SELECT * FROM agents WHERE email = $1 AND status = $2', [email, 'active']);
    const agent = result.rows[0];

    if (!agent || !(await bcrypt.compare(password, agent.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: agent.id, email: agent.email, role: agent.role, team: agent.team },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRY }
    );

    // Update last active
    await query('UPDATE agents SET last_active_at = NOW() WHERE id = $1', [agent.id]);

    res.json({
      token,
      agent: {
        id: agent.id,
        email: agent.email,
        name: agent.display_name,
        role: agent.role,
        team: agent.team,
      },
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/register (admin only)
 */
router.post('/auth/register', authenticate, authorize('admin'), validate(schemas.register), async (req, res) => {
  try {
    const { email, password, displayName, role = 'agent', team = 'general_pool' } = req.body;

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO agents (email, password_hash, display_name, role, team)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, display_name, role, team`,
      [email, passwordHash, displayName, role, team]
    );

    res.status(201).json({ agent: result.rows[0] });
  } catch (err) {
    if (err.code === '23505' || err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    logger.error('Register error', { error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/change-password
 */
router.post('/auth/change-password', authenticate, validate(schemas.changePassword), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const agentId = req.user.id;

    const result = await query('SELECT password_hash FROM agents WHERE id = $1', [agentId]);
    const agent = result.rows[0];

    if (!agent || !(await bcrypt.compare(oldPassword, agent.password_hash))) {
      return res.status(401).json({ error: 'වත්මන් මුරපදය වැරදියි (Current password incorrect)' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE agents SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, agentId]);

    res.json({ success: true, message: 'මුරපදය සාර්ථකව වෙනස් කරන ලදී (Password changed successfully)' });
  } catch (err) {
    logger.error('Change password error', { error: err.message });
    res.status(500).json({ error: 'Password change failed' });
  }
});

router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT id, email, display_name as name, role, team, status FROM agents WHERE id = $1', [req.user.id]);
    const agent = result.rows[0];
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ user: agent });
  } catch (err) {
    logger.error('Get profile error', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// ─────────────────────────────────────
// AGENTS MANAGEMENT
// ─────────────────────────────────────

/**
 * GET /api/agents
 */
router.get('/agents', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, display_name, role, team, status, active_conversations, last_active_at, created_at FROM agents ORDER BY created_at DESC'
    );
    res.json({ agents: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/agents/:id
 */
router.put('/agents/:id', authenticate, authorize('admin'), validate(schemas.agentUpdate), async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, role, team, status } = req.body;

    const result = await query(
      `UPDATE agents 
       SET display_name = COALESCE($1, display_name),
           role = COALESCE($2, role),
           team = COALESCE($3, team),
           status = COALESCE($4, status),
           updated_at = NOW()
       WHERE id = $5 RETURNING id, email, display_name, role, team, status`,
      [displayName, role, team, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/agents/:id
 */
router.delete('/agents/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'ඔබට ඔබවම මකා දැමිය නොහැක (You cannot delete yourself)' });
    }
    await query('DELETE FROM agents WHERE id = $1', [id]);
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────

router.get('/contacts', authenticate, async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = await contactService.listContacts({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      search,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/contacts/:id', authenticate, async (req, res) => {
  try {
    const contact = await contactService.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/contacts/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const contact = await contactService.updateContactStatus(req.params.id, status);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contacts', authenticate, async (req, res) => {
  try {
    const contact = await contactService.createContact(req.body);
    res.status(201).json({ success: true, contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contacts/:id', authenticate, async (req, res) => {
  try {
    const contact = await contactService.updateContact(req.params.id, req.body);
    res.json({ success: true, contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contacts/:id/tags', authenticate, async (req, res) => {
  try {
    const { tags } = req.body;
    const result = await contactService.addTags(req.params.id, tags);
    res.json({ tags: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/contacts', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No contact IDs provided' });
    }
    const deletedCount = await contactService.deleteContacts(ids);
    res.json({ success: true, deletedCount, message: `Successfully deleted ${deletedCount} contacts` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/contacts/:id/notes', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await contactService.updateNotes(req.params.id, notes);
    res.json({ notes: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});router.get('/contacts/:id/intelligence', authenticate, async (req, res) => {
  try {
    const intelligence = await intelligenceService.getContactIntelligence(req.params.id);
    if (!intelligence) return res.status(404).json({ error: 'Intelligence data unavailable' });
    res.json(intelligence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/contacts/:id/timeline', authenticate, async (req, res) => {
  try {
    const timeline = await intelligenceService.getContactTimeline(req.params.id);
    res.json({ timeline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ANALYTICS (PHASE 3) ───
router.get('/analytics/volume', authenticate, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const data = await analyticsService.getMessageVolume(days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/funnel', authenticate, async (req, res) => {
  try {
    const data = await analyticsService.getConversionFunnel();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/leaderboard', authenticate, async (req, res) => {
  try {
    const data = await analyticsService.getAgentLeaderboard();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/heatmap', authenticate, async (req, res) => {
  try {
    const data = await analyticsService.getActivityHeatmap();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/ai-metrics', authenticate, async (req, res) => {
  try {
    const data = await analyticsService.getAIMetrics();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/overview', authenticate, async (req, res) => {
  try {
    const stats = await analyticsService.getAdvancedStats();
    const funnel = await analyticsService.getConversionFunnel();
    const ai = await analyticsService.getAIMetrics();
    res.json({
      success: true,
      stats,
      funnel,
      ai
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/messages', authenticate, async (req, res) => {
  try {
    const days = req.query.period === '30d' ? 30 : 7;
    const data = await analyticsService.getMessageVolume(days);
    res.json({
      success: true,
      period: req.query.period || '7d',
      data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CANNED RESPONSES (PHASE 5) ───
router.get('/canned-responses', authenticate, async (req, res) => {
  try {
    const data = await cannedResponseService.listCannedResponses();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/canned-responses', authenticate, async (req, res) => {
  try {
    const data = await cannedResponseService.createCannedResponse(req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/canned-responses/:id', authenticate, async (req, res) => {
  try {
    await cannedResponseService.deleteCannedResponse(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OUTBOUND WEBHOOK SUBSCRIPTIONS ───
router.get('/webhooks', authenticate, authorize('admin'), async (req, res) => {
  try {
    const webhookService = require('../services/webhook');
    const data = await webhookService.getAllWebhooks();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/webhooks', authenticate, authorize('admin'), async (req, res) => {
  try {
    const webhookService = require('../services/webhook');
    const targetUrl = req.body.targetUrl || req.body.url;
    const { events, secret } = req.body;
    if (!targetUrl || !events) {
      return res.status(400).json({ error: 'Target URL and Events are required' });
    }
    const data = await webhookService.createWebhook({ targetUrl, events, secret });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/webhooks/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const webhookService = require('../services/webhook');
    await webhookService.deleteWebhook(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SCHEDULED MESSAGES (PHASE 5) ───
router.post('/scheduled-messages', authenticate, async (req, res) => {
  try {
    const data = await scheduledMessageService.scheduleMessage(req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/conversations/:id/transfer', authenticate, async (req, res) => {
  try {
    const { team, note } = req.body;
    await conversationService.transferConversation(req.params.id, team, note, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/conversations/:id/csat', authenticate, async (req, res) => {
  try {
    const { score, comment } = req.body;
    const csatService = require('../services/csat');
    await csatService.recordCSAT(req.params.id, score, comment);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────

router.get('/conversations', authenticate, async (req, res) => {
  try {
    const { page, limit, status, team, priority, search } = req.query;
    const result = await conversationService.listConversations({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      team,
      priority,
      search,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/conversations/:id/messages', authenticate, async (req, res) => {
  try {
    const { limit } = req.query;
    const messages = await conversationService.getConversationHistory(
      req.params.id,
      parseInt(limit) || 50
    );
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/conversations/:id/assign', authenticate, async (req, res) => {
  try {
    const { team, agentId, priority } = req.body;
    const result = await conversationService.assignConversation(req.params.id, {
      team,
      agentId,
      priority,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/conversations/:id/close', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await conversationService.closeConversation(req.params.id, notes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/conversations/:id/reply
 */
router.post('/conversations/:id/reply', authenticate, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Message text required' });

    const conversationRes = await query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    const conversation = conversationRes.rows[0];
    
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const contactId = conversation.contact_id;

    // Store outbound message (manual)
    const message = await conversationService.storeOutboundMessage(req.params.id, contactId, {
      content: text,
      aiGenerated: false,
    });

    // Auto-assign to current agent if not assigned
    if (conversation.status === 'open' || !conversation.assigned_agent_id) {
      await conversationService.assignConversation(req.params.id, {
        agentId: req.user.id,
        team: req.user.team
      });
    }

    res.json({ success: true, message });
  } catch (err) {
    logger.error('Reply error', { error: err.message });
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// ─────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────

router.get('/audit-logs', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { page, limit, agentType, action, startDate, endDate } = req.query;
    const result = await auditLogger.getAuditLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      agentType,
      action,
      startDate,
      endDate,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// ADMIN / SYSTEM
// ─────────────────────────────────────

router.get('/system/queue-stats', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    res.json({ error: 'Queue stats unavailable', details: err.message });
  }
});

router.get('/system/rules-version', authenticate, authorize('admin'), async (req, res) => {
  res.json(getRulesVersion());
});

router.get('/system/templates', authenticate, async (req, res) => {
  try {
    const { getRules } = require('../utils/rulesLoader');
    const rules = getRules('templates');
    res.json(rules.templates || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/reload-rules', authenticate, authorize('admin'), async (req, res) => {
  try {
    reloadRules();
    res.json({ success: true, message: 'Rules reloaded', ...getRulesVersion() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/system/knowledge', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { getRules } = require('../utils/rulesLoader');
    res.json(getRules('knowledge') || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/knowledge', authenticate, authorize('admin'), async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const kbPath = path.join(__dirname, '..', '..', '.agent', 'rules', 'knowledge-base.json');
    
    const data = req.body;
    fs.writeFileSync(kbPath, JSON.stringify(data, null, 2), 'utf-8');
    
    // Reload cache
    reloadRules();
    
    res.json({ success: true, message: 'Knowledge base updated' });
  } catch (err) {
    logger.error('KB Save error', { error: err.message });
    res.status(500).json({ error: 'Failed to save knowledge base' });
  }
});

router.get('/system/rules/:ruleset', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    let { ruleset } = req.params;
    if (ruleset === 'intent-routing') ruleset = 'intentRouting';
    const { getRules } = require('../utils/rulesLoader');
    const rules = getRules(ruleset);
    if (!rules) return res.status(404).json({ error: 'Ruleset not found' });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/rules/:ruleset', authenticate, authorize('admin'), async (req, res) => {
  try {
    let { ruleset } = req.params;
    if (ruleset === 'intent-routing') ruleset = 'intentRouting';
    const fs = require('fs');
    const path = require('path');
    
    const files = {
      workspace: 'workspace-rules.json',
      agent: 'agent-rules.json',
      compliance: 'compliance-rules.json',
      intentRouting: 'intent-routing.json',
      templates: 'templates.json',
      knowledge: 'knowledge-base.json',
    };

    const filename = files[ruleset];
    if (!filename) return res.status(400).json({ error: 'Invalid ruleset key' });

    const rulesPath = path.join(__dirname, '..', '..', '.agent', 'rules', filename);
    const data = req.body;
    fs.writeFileSync(rulesPath, JSON.stringify(data, null, 2), 'utf-8');
    
    reloadRules();
    
    res.json({ success: true, message: `${ruleset} rules updated` });
  } catch (err) {
    logger.error('Rules save error', { ruleset, error: err.message });
    res.status(500).json({ error: `Failed to save ruleset ${ruleset}` });
  }
});

router.get('/notifications', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scheduled-messages', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM scheduled_messages ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// SETTINGS / INTEGRATIONS
// ─────────────────────────────────────

router.get('/system/public-settings', async (req, res) => {
  try {
    const { getPublicSettings } = require('../utils/settings');
    const settings = await getPublicSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// SYSTEM MAINTENANCE / BACKUP
// ─────────────────────────────────────

router.get('/system/backups', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { getAdapter } = require('../config/database');
    if (getAdapter() !== 'sqlite') {
      return res.status(501).json({ error: 'Backup is only supported for SQLite.' });
    }
    const { listBackups } = require('../utils/backup');
    res.json({ backups: listBackups() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/backup', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { getAdapter } = require('../config/database');
    if (getAdapter() !== 'sqlite') {
      return res.status(501).json({ error: 'Backup is only supported for SQLite.' });
    }
    const { backupDatabase } = require('../utils/backup');
    const result = await backupDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/system/download-db', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { getAdapter } = require('../config/database');
    if (getAdapter() !== 'sqlite') {
      return res.status(501).json({ error: 'Database download is only supported for SQLite.' });
    }
    const path = require('path');
    const fs = require('fs');
    const dbPath = path.join(__dirname, '..', '..', 'data', 'procrm.db');
    
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    
    res.download(dbPath, 'procrm_export.db');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings routes continue...

const getSettingsHandler = async (req, res) => {
  try {
    const { loadSettings } = require('../utils/settings');
    const settings = await loadSettings();
    
    // For security, mask sensitive keys in GET if they exist
    const masked = { ...settings };
    ['WHATSAPP_ACCESS_TOKEN', 'GEMINI_API_KEY', 'META_APP_SECRET', 'TELEGRAM_BOT_TOKEN', 'MESSENGER_PAGE_TOKEN'].forEach(k => {
      if (masked[k]) masked[k] = masked[k].substring(0, 8) + '...' + masked[k].substring(masked[k].length - 4);
    });
    
    res.json(masked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postSettingsHandler = async (req, res) => {
  try {
    const { setSetting } = require('../utils/settings');
    const { key, value } = req.body;
    
    if (!key) return res.status(400).json({ error: 'Key required' });
    
    await setSetting(key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.get('/system/settings', authenticate, authorize('admin'), getSettingsHandler);
router.get('/settings', authenticate, authorize('admin'), getSettingsHandler);

router.post('/system/settings', authenticate, authorize('admin'), postSettingsHandler);
router.post('/settings', authenticate, authorize('admin'), postSettingsHandler);

router.post('/system/test-integration', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { type, value } = req.body;
    const { getSetting } = require('../utils/settings');
    
    if (type === 'gemini') {
      const apiKey = value || await getSetting('GEMINI_API_KEY', 'GEMINI_API_KEY');
      if (!apiKey) return res.json({ success: false, error: 'API Key not set' });
      
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Attempt with timeout and retry for unstable networks
      let lastError = null;
      for (let i = 0; i < 2; i++) {
        try {
          await Promise.race([
            model.generateContent('Hi'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection Timeout')), 15000))
          ]);
          return res.json({ success: true, message: 'Gemini AI Connection Successful' });
        } catch (err) {
          lastError = err;
          logger.warn(`Gemini test attempt ${i+1} failed: ${err.message}`);
          await new Promise(r => setTimeout(r, 1000)); // Wait before retry
        }
      }
      throw lastError;
    }
    
    if (type === 'whatsapp') {
      const token = (type === 'whatsapp' && value) ? value : await getSetting('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN');
      const phoneId = await getSetting('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PHONE_NUMBER_ID');
      
      if (!token || !phoneId) return res.json({ success: false, error: 'Token or Phone ID missing' });
      
      const axios = require('axios');
      const response = await axios.get(`https://graph.facebook.com/v19.0/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      return res.json({ success: true, message: `WhatsApp Connected: ${response.data.display_phone_number || 'OK'}` });
    }
    
    res.status(400).json({ error: 'Invalid integration type' });
  } catch (err) {
    const errorDetail = err.response?.data?.error?.message || err.message;
    logger.error('Integration test failed', { 
      type: req.body.type, 
      error: err.response?.data || err.message 
    });
    res.json({ 
      success: false, 
      error: `${(req.body.type || 'Integration').charAt(0).toUpperCase() + (req.body.type || 'integration').slice(1)} Error: ${errorDetail}`,
      debug: err.response?.data || null
    });
  }
});



router.post('/system/register-webhook', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { appId, appSecret, verifyToken, baseUrl } = req.body;
    if (!appId || !appSecret || !verifyToken || !baseUrl) {
      return res.status(400).json({ error: 'All fields (App ID, App Secret, Verify Token, Base URL) are required' });
    }
    
    const { setSetting } = require('../utils/settings');
    await setSetting('META_APP_ID', appId);
    await setSetting('META_APP_SECRET', appSecret);
    await setSetting('WEBHOOK_VERIFY_TOKEN', verifyToken);
    await setSetting('PUBLIC_BASE_URL', baseUrl);
    
    const axios = require('axios');
    const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/whatsapp`;
    
    const response = await axios.post(`https://graph.facebook.com/v19.0/${appId}/subscriptions`, null, {
      params: {
        object: 'whatsapp_business_account',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: 'messages',
        access_token: `${appId}|${appSecret}`
      }
    });
    
    res.json({ success: true, message: 'Webhook registered successfully with Meta!' });
  } catch (err) {
    const errorDetail = err.response?.data?.error?.message || err.message;
    res.json({ success: false, error: `Meta API Error: ${errorDetail}` });
  }
});

// ─────────────────────────────────────
// BACKUP & RESTORE
// ─────────────────────────────────────

router.get('/system/backup', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { getAdapter } = require('../config/database');
    if (getAdapter() !== 'sqlite') {
      return res.status(501).json({ error: 'Backup is only supported for SQLite.' });
    }
    const dbPath = require('path').join(__dirname, '../../data/procrm.db');
    if (!require('fs').existsSync(dbPath)) return res.status(404).json({ error: 'DB not found.' });
    
    res.download(dbPath, `procrm_backup_${new Date().toISOString().split('T')[0]}.db`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/restore', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  try {
    const { getAdapter } = require('../config/database');
    if (getAdapter() !== 'sqlite') {
      return res.status(501).json({ error: 'Restore is only supported for SQLite.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No database file provided.' });
    }

    const uploadedPath = req.file.path;

    // Validate SQLite magic header: "SQLite format 3\u0000"
    const fd = fs.openSync(uploadedPath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (buffer.toString('utf-8', 0, 15) !== 'SQLite format 3') {
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Invalid file format. Must be a valid SQLite database.' });
    }

    const dbDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'procrm.db');
    const backupPath = path.join(dbDir, 'procrm.db.bak');

    // Create a backup of the current DB if it exists
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }

    try {
      // Replace the DB file
      fs.copyFileSync(uploadedPath, dbPath);
      logger.info('Database restored successfully from upload. Restarting server...');
      res.json({ success: true, message: 'Database restored successfully! Application is restarting.' });
      
      // Graceful process exit so PM2/Docker can restart it
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (copyErr) {
      // Attempt recovery from backup
      if (fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(backupPath, dbPath);
        } catch (restoreBackupErr) {
          logger.critical('Failed to restore database backup during recovery!', { error: restoreBackupErr.message });
        }
      }
      throw copyErr;
    }
  } catch (err) {
    logger.error('Database restore error', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        logger.error('Failed to cleanup temp restore file', { path: req.file.path, error: unlinkErr.message });
      }
    }
  }
});

// ─────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────

router.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    const [contacts, openConversations, todayMessages, slaBreaches, leadDistribution, topLeads] = await Promise.all([
      query("SELECT COUNT(*) as count FROM contacts WHERE status = 'active'"),
      query("SELECT COUNT(*) as count FROM conversations WHERE status IN ('open', 'assigned', 'pending')"),
      query("SELECT COUNT(*) as count FROM messages WHERE created_at >= CURRENT_DATE"),
      query("SELECT COUNT(*) as count FROM conversations WHERE sla_breached = 1 AND status != 'closed'"),
      query(`
        SELECT 
          COUNT(CASE WHEN lead_score >= 80 THEN 1 END) as hot,
          COUNT(CASE WHEN lead_score >= 40 AND lead_score < 80 THEN 1 END) as warm,
          COUNT(CASE WHEN lead_score < 40 THEN 1 END) as cold
        FROM contacts
      `),
      query(`
        SELECT id, display_name, phone_number, lead_score, status 
        FROM contacts 
        WHERE status != 'unsubscribed'
        ORDER BY lead_score DESC 
        LIMIT 5
      `)
    ]);

    res.json({
      active_contacts: parseInt(contacts.rows[0].count),
      open_conversations: parseInt(openConversations.rows[0].count),
      today_messages: parseInt(todayMessages.rows[0].count),
      sla_breaches: parseInt(slaBreaches.rows[0].count),
      lead_distribution: leadDistribution.rows[0],
      top_leads: topLeads.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard/charts', authenticate, async (req, res) => {
  try {
    const isSqlite = getAdapter() === 'sqlite';
    const result = isSqlite
      ? await query(`
          SELECT 
            date(created_at) as date,
            COUNT(*) as count,
            SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
            SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound
          FROM messages
          WHERE created_at >= datetime('now', '-7 days')
          GROUP BY date(created_at)
          ORDER BY date ASC
        `)
      : await query(`
          SELECT 
            created_at::date as date,
            COUNT(*) as count,
            SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
            SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound
          FROM messages
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY created_at::date
          ORDER BY date ASC
        `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// DATA EXPORT
// ─────────────────────────────────────

router.get('/system/export/:type', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { type } = req.params;
    let data = [];
    let filename = `export_${type}_${new Date().toISOString().split('T')[0]}.csv`;

    switch (type) {
      case 'contacts':
        const contacts = await query('SELECT * FROM contacts ORDER BY created_at DESC');
        data = contacts.rows;
        break;
      case 'conversations':
        const convs = await query(`
          SELECT c.*, ct.display_name as contact_name, ct.phone_number as contact_phone
          FROM conversations c
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          ORDER BY c.created_at DESC
        `);
        data = convs.rows;
        break;
      case 'audit':
        const logs = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000');
        data = logs.rows;
        break;
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    const csv = jsonToCsv(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(csv);
  } catch (err) {
    logger.error('Export error', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─────────────────────────────────────
// SYSTEM STREAM (SSE)
// ─────────────────────────────────────

const clients = new Set();

router.get('/system/stream', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, userId: req.user.id };
  clients.add(client);

  logger.info(`Dashboard client connected to stream (user: ${req.user.email})`);

  req.on('close', () => {
    clients.delete(client);
    logger.info(`Dashboard client disconnected from stream (user: ${req.user.email})`);
  });

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date() })}\n\n`);
});

// Helper to broadcast to all dashboard clients
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.res.write(payload));
}

// Subscribe to system events and broadcast to clients
events.on(events.MESSAGE_RECEIVED, (data) => broadcast({ type: 'message', ...data }));
events.on(events.MESSAGE_SENT, (data) => broadcast({ type: 'message', ...data }));
events.on(events.CONVERSATION_UPDATED, (data) => broadcast({ type: 'conversation', ...data }));

// ─────────────────────────────────────
// KNOWLEDGE BASE (Universal AI Brain)
// ─────────────────────────────────────

/**
 * GET /api/knowledge/documents
 */
const listKnowledgeDocsHandler = async (req, res) => {
  try {
    const result = await query(
      'SELECT id, title, doc_type, status, total_chunks, created_at, metadata FROM knowledge_documents ORDER BY created_at DESC'
    );
    
    // Extract category, usage, and expiry from metadata
    const documents = result.rows.map(row => {
      let category = 'general';
      let usage_count = 0;
      let expires_at = null;
      if (row.metadata) {
        try {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          if (meta.category) category = meta.category;
          if (meta.usage_count) usage_count = meta.usage_count;
          if (meta.expiresAt) expires_at = meta.expiresAt;
        } catch (e) {
          logger.error('Error parsing metadata', e);
        }
      }
      return {
        id: row.id,
        title: row.title,
        doc_type: row.doc_type,
        status: row.status,
        total_chunks: row.total_chunks,
        created_at: row.created_at,
        category: category,
        usage_count: usage_count,
        expires_at: expires_at
      };
    });

    res.json({ documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.get('/knowledge/documents', authenticate, authorize('admin', 'manager'), listKnowledgeDocsHandler);
router.get('/knowledge', authenticate, authorize('admin', 'manager'), listKnowledgeDocsHandler);

/**
 * POST /api/knowledge/upload (Manual Text)
 */
router.post('/knowledge/upload', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { title, category, content, expiresAt } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

    const knowledgeService = require('../services/knowledge');
    const metadata = {};
    if (expiresAt) metadata.expiresAt = expiresAt;

    const result = await knowledgeService.addDocument({
      title,
      content,
      category: category || 'general',
      type: 'manual_entry',
      metadata
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/knowledge/upload-file
 */
router.post('/knowledge/upload-file', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  const filePath = req.file ? req.file.path : null;
  
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    logger.info(`📤 File upload started: ${req.file.originalname} (${req.file.size} bytes)`);

    const knowledgeService = require('../services/knowledge');
    const originalName = req.file.originalname;
    const fileType = req.file.mimetype;
    let content = '';
    const ext = path.extname(originalName).toLowerCase();

    if (fileType === 'application/pdf' || ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      content = data.text;
      
      if (!content || content.trim().length === 0) {
        throw new Error('PDF content is empty or could not be extracted');
      }
    } else if (fileType === 'text/plain' || ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') {
      content = fs.readFileSync(filePath, 'utf8');
    } else {
      throw new Error('Unsupported file type. Use PDF or TXT/Markdown/JSON/CSV.');
    }

    const metadata = { originalName, fileType, size: req.file.size };
    if (req.body.expiresAt) metadata.expiresAt = req.body.expiresAt;

    const result = await knowledgeService.addDocument({
      title: req.body.title || originalName,
      content,
      category: req.body.category || 'general',
      type: 'file_upload',
      metadata
    });

    res.json(result);
  } catch (err) {
    logger.error('File upload failed', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    // Guaranteed cleanup of temp file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`🧹 Temporary file cleaned up: ${filePath}`);
      } catch (unlinkErr) {
        logger.error('Failed to cleanup temp file', { path: filePath, error: unlinkErr.message });
      }
    }
  }
});

/**
 * POST /api/knowledge/scrape
 */
router.post('/knowledge/scrape', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { url, title, category, expiresAt } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const knowledgeService = require('../services/knowledge');
    
    // 1. Scrape the content
    const content = await knowledgeService.scrapeWebsite(url);
    
    const metadata = { scrapedAt: new Date().toISOString() };
    if (expiresAt) metadata.expiresAt = expiresAt;

    // 2. Index the content
    const result = await knowledgeService.addDocument({
      title: title || url,
      content,
      category: category || 'general',
      type: 'web_scrape',
      sourceUrl: url,
      metadata
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/knowledge/documents/:id/content
 * Retrieves the raw text content of a knowledge document (for Quick Edit)
 */
router.get('/knowledge/documents/:id/content', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const knowledgeService = require('../services/knowledge');
    const content = await knowledgeService.getDocumentContent(id);
    
    if (!content) {
      return res.status(404).json({ error: 'Document not found or has no content' });
    }
    
    res.json({ content });
  } catch (err) {
    logger.error('Error fetching document content', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/knowledge/documents/:id
 * Updates the text content of a knowledge document (Quick Edit)
 */
router.put('/knowledge/documents/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content cannot be empty' });
    }

    const docRes = await query('SELECT id FROM knowledge_documents WHERE id = $1', [id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const knowledgeService = require('../services/knowledge');
    const result = await knowledgeService.updateDocument(id, content);

    res.json(result);
  } catch (err) {
    logger.error('Error updating document content', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/knowledge/documents/:id
 */
router.delete('/knowledge/documents/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await transaction(async (client) => {
      // 1. Delete associated chunks first (manual cascade)
      await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [id]);
      // 2. Delete the document
      await client.query('DELETE FROM knowledge_documents WHERE id = $1', [id]);
    });

    // Invalidate knowledge cache
    try {
      const knowledgeService = require('../services/knowledge');
      knowledgeService.invalidateCache();
    } catch (e) {
      logger.error('Failed to invalidate knowledge cache on document deletion:', e.message);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// CAMPAIGN MANAGEMENT
// ─────────────────────────────────────

router.post('/campaigns', authenticate, async (req, res) => {
  try {
    const campaignService = require('../services/campaign');
    const id = await campaignService.createCampaign(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campaigns/:id/execute', authenticate, async (req, res) => {
  try {
    const campaignService = require('../services/campaign');
    // Run in background
    campaignService.executeCampaign(req.params.id).catch(err => {
      logger.error('Background campaign execution failed', { error: err.message });
    });
    res.json({ success: true, message: 'Campaign execution started in background.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaigns', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM campaigns ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/appointments', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM appointments ORDER BY appointment_date DESC, appointment_time DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/appointments', authenticate, async (req, res) => {
  try {
    const { contactId, contactName, contactPhone, date, time, reason } = req.body;
    if (!contactId || !date || !time) {
      return res.status(400).json({ error: 'Contact ID, date, and time are required' });
    }
    const result = await bookingService.bookAppointment({
      contactId,
      contactName,
      contactPhone,
      date,
      time,
      reason
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/appointments/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.cancelAppointment(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// SHIFTS (Phase 7)
// ─────────────────────────────────────

router.get('/shifts/active', authenticate, async (req, res) => {
  try {
    const shiftService = require('../services/shift');
    const shift = await shiftService.getActiveShift(req.user.id);
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shifts/start', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    const shiftService = require('../services/shift');
    const shift = await shiftService.startShift(req.user.id, notes);
    res.json(shift);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shifts/end', authenticate, async (req, res) => {
  try {
    const shiftService = require('../services/shift');
    const shift = await shiftService.endShift(req.user.id);
    res.json(shift);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id/feedback', authenticate, async (req, res) => {
  try {
    const { score, note } = req.body;
    await query(
      'UPDATE messages SET feedback_score = $1, feedback_note = $2 WHERE id = $3',
      [score, note, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────
// ADVANCED FEATURES (Phase 8)
// ─────────────────────────────────────

/**
 * GET /api/analytics/advanced
 */
router.get('/analytics/advanced', authenticate, async (req, res) => {
  try {
    const data = await analyticsService.getAdvancedStats();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/system/flow-builder
 */
router.get('/system/flow-builder', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { getSetting } = require('../utils/settings');
    const layout = await getSetting('VISUAL_FLOW_LAYOUT', '{"nodes":[],"edges":[]}');
    const parsedLayout = typeof layout === 'string' ? JSON.parse(layout) : layout;
    res.json(parsedLayout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/system/flow-builder
 */
router.post('/system/flow-builder', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { setSetting } = require('../utils/settings');
    const { layout, compiledRules } = req.body;
    
    if (layout) {
      await setSetting('VISUAL_FLOW_LAYOUT', JSON.stringify(layout));
    }
    
    if (compiledRules) {
      const fs = require('fs');
      const path = require('path');
      const rulesPath = path.join(__dirname, '..', '..', '.agent', 'rules', 'intent-routing.json');
      fs.writeFileSync(rulesPath, JSON.stringify(compiledRules, null, 2), 'utf-8');
      reloadRules();
    }
    
    res.json({ success: true, message: 'Flow builder saved and compiled rules updated.' });
  } catch (err) {
    logger.error('Flow builder save error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/system/flow-builder/generate
 */
router.post('/system/flow-builder/generate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const gemini = require('../services/gemini');
    const generatedRules = await gemini.generateFlowBuilderRules(prompt);
    
    res.json({ success: true, rules: generatedRules });
  } catch (err) {
    logger.error('Flow builder generation error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to generate flow' });
  }
});

/**
 * POST /api/system/flow-builder/generate-from-kb
 */
router.post('/system/flow-builder/generate-from-kb', authenticate, authorize('admin'), async (req, res) => {
  try {
    // 1. Fetch all documents from KB
    const result = await query('SELECT title, metadata FROM knowledge_documents WHERE status = $1', ['active']);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Knowledge Base is empty. Please train the AI first.' });
    }

    // 2. Build summary
    const docsSummary = result.rows.map(row => {
      let category = 'general';
      if (row.metadata) {
        try {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          if (meta.category) category = meta.category;
        } catch(e) {}
      }
      return `- Title: ${row.title} (Category: ${category})`;
    }).join('\n');

    // 3. Generate Flow
    const gemini = require('../services/gemini');
    const generatedRules = await gemini.generateFlowFromKnowledge(docsSummary);
    
    res.json({ success: true, rules: generatedRules });
  } catch (err) {
    logger.error('Flow builder KB generation error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to generate flow from KB' });
  }
});

/**
 * GET /api/conversations/:id/copilot-suggest
 */
router.get('/conversations/:id/copilot-suggest', authenticate, async (req, res) => {
  try {
    const conversationId = req.params.id;
    // Get last 10 messages from the conversation history
    const messages = await conversationService.getConversationHistory(conversationId, 10);
    
    // Get conversation details to fetch contact name and intent
    const conversationRes = await query('SELECT c.*, co.display_name FROM conversations c JOIN contacts co ON c.contact_id = co.id WHERE c.id = $1', [conversationId]);
    const conversation = conversationRes.rows[0];
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Use last user message to retrieve context from knowledge base
    const lastUserMessage = [...messages].reverse().find(m => m.direction === 'inbound')?.content || '';
    
    const { findRelevantContext } = require('../services/knowledge');
    const contextText = lastUserMessage ? await findRelevantContext(lastUserMessage, 3) : '';
    
    const gemini = require('../services/gemini');
    const suggestion = await gemini.generateCopilotSuggestion({
      conversationHistory: messages,
      contextText,
      contactName: conversation.display_name
    });
    
    res.json({ success: true, suggestion });
  } catch (err) {
    logger.error('Copilot suggest error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/knowledge/test
 * Test the Knowledge Base search and AI response generation (Playground)
 */
router.post('/knowledge/test', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { query: queryText } = req.body;
    if (!queryText) return res.status(400).json({ error: 'Query is required' });

    const knowledgeService = require('../services/knowledge');
    
    // We pass testMode = true to findRelevantContext so it returns an object with chunksInfo
    const result = await knowledgeService.findRelevantContext(queryText, 5, true);
    
    let contextStr = '';
    let chunksInfo = [];

    if (typeof result === 'object' && result !== null) {
      contextStr = result.topContext;
      chunksInfo = result.chunksInfo || [];
    } else {
      contextStr = result;
    }

    if (!contextStr) {
      return res.json({ answer: "I couldn't find any relevant information in the Knowledge Hub to answer your question.", chunksInfo: [] });
    }

    const { getGenerativeModel } = require('../services/gemini');
    const model = await getGenerativeModel();

    if (!model) {
      return res.json({ answer: "Gemini AI is not configured. Context retrieved successfully, but cannot generate a response.", chunksInfo });
    }

    const prompt = `You are a helpful AI assistant. Answer the user's question using ONLY the provided context from our knowledge base. 
If the context doesn't contain the answer, say "I don't know based on the provided context."

Context:
${contextStr}

Question: ${queryText}
Answer:`;

    const aiRes = await model.generateContent(prompt);
    const answer = aiRes.response.text();

    res.json({ answer, chunksInfo });
  } catch (err) {
    logger.error('Playground Test Failed', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
