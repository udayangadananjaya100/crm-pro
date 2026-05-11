/**
 * Pro CRM — Canned Response Service
 * Manages pre-built message templates for agents
 */
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

async function listCannedResponses() {
  try {
    const result = await query('SELECT * FROM canned_responses ORDER BY category, shortcut');
    return result.rows;
  } catch (err) {
    logger.error('Error listing canned responses', { error: err.message });
    return [];
  }
}

async function createCannedResponse({ shortcut, content, category }) {
  try {
    const id = uuidv4();
    await query(
      'INSERT INTO canned_responses (id, shortcut, content, category) VALUES ($1, $2, $3, $4)',
      [id, shortcut, content, category || 'General']
    );
    return { id, shortcut, content, category };
  } catch (err) {
    logger.error('Error creating canned response', { error: err.message });
    throw err;
  }
}

async function deleteCannedResponse(id) {
  try {
    await query('DELETE FROM canned_responses WHERE id = $1', [id]);
    return true;
  } catch (err) {
    logger.error('Error deleting canned response', { error: err.message });
    throw err;
  }
}

module.exports = {
  listCannedResponses,
  createCannedResponse,
  deleteCannedResponse
};
