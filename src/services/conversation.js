/**
 * Pro CRM — Conversation Service
 * Manages conversation lifecycle and message history
 */
const { query, transaction } = require('../config/database');
const { maskPII } = require('../utils/piiMasker');
const events = require('../utils/events');
const logger = require('../utils/logger');
const csatService = require('./csat');
const gemini = require('./gemini');

/**
 * Find or create an open conversation for a contact
 */
async function findOrCreateConversation(contactId) {
  // Find existing open conversation
  const existing = await query(
    `SELECT * FROM conversations
     WHERE contact_id = $1 AND status IN ('open', 'assigned', 'pending')
     ORDER BY created_at DESC LIMIT 1`,
    [contactId]
  );

  if (existing.rows.length > 0) {
    // Extend the conversational window
    await query(
      `UPDATE conversations SET window_expires_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id]
    );
    return existing.rows[0];
  }

  // Create new conversation
  const result = await query(
    `INSERT INTO conversations (contact_id, status, window_expires_at)
     VALUES ($1, 'open', NOW() + INTERVAL '24 hours')
     RETURNING *`,
    [contactId]
  );

  logger.info('New conversation created', {
    id: result.rows[0].id,
    contactId,
  });

  return result.rows[0];
}

/**
 * Store an inbound message
 */
async function storeInboundMessage(conversationId, contactId, messageData) {
  let content = messageData.text || '';
  let transcription = null;

  if (messageData.messageType === 'audio' && messageData.audioBuffer) {
    transcription = await gemini.transcribeAudio(messageData.audioBuffer, messageData.mimeType);
    if (transcription) {
      content = `[Audio Message]: ${transcription}`;
    } else {
      content = '[Audio Message: Transcription Failed]';
    }
  }

  const maskedContent = maskPII(content);

  return await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO messages (
        conversation_id, contact_id, whatsapp_message_id,
        direction, message_type, content, content_masked,
        status, pii_detected, transcription
      ) VALUES ($1, $2, $3, 'inbound', $4, $5, $6, 'received', $7, $8)
      RETURNING *`,
      [
        conversationId,
        contactId,
        messageData.messageId,
        messageData.messageType || 'text',
        content,
        maskedContent,
        maskedContent !== content,
        transcription
      ]
    );

    // Update conversation message count
    await client.query(
      `UPDATE conversations SET message_count = message_count + 1, updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    // Emit event for real-time dashboard
    events.emit(events.MESSAGE_RECEIVED, { conversationId, contactId, message: result.rows[0] });

    return result.rows[0];
  });
}

/**
 * Store an outbound message (AI response or human reply)
 */
async function storeOutboundMessage(conversationId, contactId, {
  content, intent, confidence, aiGenerated = true, templateName = null, whatsappMessageId = null,
}) {
  const maskedContent = maskPII(content || '');

  return await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO messages (
        conversation_id, contact_id, whatsapp_message_id, direction, message_type,
        content, content_masked, status, intent, confidence,
        ai_generated, template_name, pii_detected
      ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, 'sent', $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        conversationId,
        contactId,
        whatsappMessageId,
        templateName ? 'template' : 'text',
        content,
        maskedContent,
        intent,
        confidence,
        aiGenerated,
        templateName,
        maskedContent !== content,
      ]
    );

    // Update conversation message count
    await client.query(
      `UPDATE conversations SET message_count = message_count + 1, updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    // Emit event for real-time dashboard
    events.emit(events.MESSAGE_SENT, { conversationId, contactId, message: result.rows[0] });

    return result.rows[0];
  });
}

/**
 * Get conversation history (for AI context)
 */
async function getConversationHistory(conversationId, limit = 10) {
  const result = await query(
    `SELECT direction, content, message_type, intent, ai_generated, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  );

  return result.rows.reverse(); // Chronological order
}

async function getMessages(conversationId, limit = 100) {
  const result = await query(
    `SELECT *
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit]
  );

  return result.rows;
}

/**
 * Check if conversation is within 24h window
 */
async function isWithinWindow(conversationId) {
  const result = await query(
    `SELECT window_expires_at FROM conversations WHERE id = $1`,
    [conversationId]
  );

  if (!result.rows[0]) return false;

  const expiresAt = new Date(result.rows[0].window_expires_at);
  return expiresAt > new Date();
}

/**
 * Assign conversation to team/agent
 */
async function assignConversation(conversationId, { team, agentId, intent, priority }) {
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (team) {
    updates.push(`assigned_team = $${paramIndex++}`);
    params.push(team);
  }
  if (agentId) {
    updates.push(`assigned_agent_id = $${paramIndex++}`);
    params.push(agentId);
  }
  if (intent) {
    updates.push(`intent = $${paramIndex++}`);
    params.push(intent);
  }
  if (priority) {
    updates.push(`priority = $${paramIndex++}`);
    params.push(priority);
  }

  updates.push(`status = 'assigned'`);

  params.push(conversationId);

  const result = await query(
    `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  return result.rows[0];
}

/**
 * Update first response time (for SLA tracking)
 */
async function markFirstResponse(conversationId) {
  await query(
    `UPDATE conversations SET first_response_at = NOW()
     WHERE id = $1 AND first_response_at IS NULL`,
    [conversationId]
  );
}

/**
 * Close a conversation
 */
async function closeConversation(conversationId, notes = '') {
  const result = await query(
    `UPDATE conversations SET status = 'closed', resolved_at = NOW(), resolution_notes = $2
     WHERE id = $1 RETURNING *`,
    [conversationId, notes]
  );

  // Trigger CSAT Survey (Phase 5)
  if (result.rows[0]) {
    const conv = result.rows[0];
    csatService.sendCSATSurvey(conv.id, conv.contact_id, null); // Phone would be fetched in production
  }

  return result.rows[0];
}

/**
 * List conversations with filters
 */
async function listConversations({ page = 1, limit = 20, status, team, priority, search, contactId }) {
  const offset = (page - 1) * limit;
  let conditions = [];
  let params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`c.status = $${paramIndex++}`);
    params.push(status);
  }
  if (team) {
    conditions.push(`c.assigned_team = $${paramIndex++}`);
    params.push(team);
  }
  if (priority) {
    conditions.push(`c.priority = $${paramIndex++}`);
    params.push(priority);
  }
  if (contactId) {
    conditions.push(`c.contact_id = $${paramIndex++}`);
    params.push(contactId);
  }
  if (search) {
    conditions.push(`(ct.display_name ILIKE $${paramIndex} OR c.intent ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM conversations c LEFT JOIN contacts ct ON c.contact_id = ct.id ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT c.*, ct.display_name as contact_name, ct.phone_number_masked
     FROM conversations c
     LEFT JOIN contacts ct ON c.contact_id = ct.id
     ${where}
     ORDER BY
       CASE c.priority
         WHEN 'critical' THEN 0
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         WHEN 'low' THEN 4
       END,
       c.updated_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return { conversations: result.rows, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Transfer a conversation to another team
 */
async function transferConversation(conversationId, team, note, agentId) {
  return await transaction(async (client) => {
    // 1. Update conversation assignment
    await client.query(
      `UPDATE conversations SET assigned_team = $1, assigned_agent_id = NULL, updated_at = NOW() WHERE id = $2`,
      [team, conversationId]
    );

    // 2. Add an internal system message/note about the transfer
    await client.query(
      `INSERT INTO messages (conversation_id, contact_id, direction, message_type, content, status, ai_generated)
       SELECT id, contact_id, 'internal', 'transfer', $2, 'received', false
       FROM conversations
       WHERE id = $1`,
      [conversationId, `Handover to ${team}: ${note || 'No notes provided.'}`]
    );

    logger.info('Conversation transferred', { conversationId, team, agentId });
    return true;
  });
}

module.exports = {
  findOrCreateConversation,
  storeInboundMessage,
  storeOutboundMessage,
  getConversationHistory,
  getMessages,
  isWithinWindow,
  assignConversation,
  markFirstResponse,
  closeConversation,
  listConversations,
  transferConversation,
};
