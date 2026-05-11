/**
 * Pro CRM — Scheduled Message Service
 * Manages messages queued for future delivery
 */
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

async function scheduleMessage({ conversationId, contactId, content, scheduledFor }) {
  try {
    const id = uuidv4();
    await query(
      'INSERT INTO scheduled_messages (id, conversation_id, contact_id, content, scheduled_for) VALUES ($1, $2, $3, $4, $5)',
      [id, conversationId, contactId, content, scheduledFor]
    );
    return { id, conversationId, contactId, content, scheduledFor };
  } catch (err) {
    logger.error('Error scheduling message', { error: err.message });
    throw err;
  }
}

async function listPendingMessages() {
  try {
    const result = await query(
      "SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduled_for <= CURRENT_TIMESTAMP"
    );
    return result.rows;
  } catch (err) {
    logger.error('Error listing pending scheduled messages', { error: err.message });
    return [];
  }
}

async function markAsSent(id) {
  await query("UPDATE scheduled_messages SET status = 'sent' WHERE id = $1", [id]);
}

async function markAsFailed(id) {
  await query("UPDATE scheduled_messages SET status = 'failed' WHERE id = $1", [id]);
}

module.exports = {
  scheduleMessage,
  listPendingMessages,
  markAsSent,
  markAsFailed
};
