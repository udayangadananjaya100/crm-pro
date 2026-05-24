/**
 * Pro CRM — Agent Shift Service
 * Tracks agent clock-in, clock-out, and shift duration
 */
const { query } = require('../config/database');
const crypto = require('crypto');
const logger = require('../utils/logger');

async function startShift(agentId, notes = '') {
  const id = crypto.randomUUID();
  await query(
    'INSERT INTO shift_logs (id, agent_id, start_time, notes) VALUES ($1, $2, NOW(), $3)',
    [id, agentId, notes]
  );
  logger.info('Agent clocked in', { agentId, shiftId: id });
  return { id, startTime: new Date() };
}

async function endShift(agentId) {
  const result = await query(
    "UPDATE shift_logs SET end_time = NOW(), status = 'completed' WHERE agent_id = $1 AND status = 'active' RETURNING *",
    [agentId]
  );
  
  let shift = result.rows[0];
  if (!shift) {
    // SQLite fallback: since RETURNING * is not supported, find the recently updated shift
    const fetchResult = await query(
      "SELECT * FROM shift_logs WHERE agent_id = $1 AND status = 'completed' ORDER BY start_time DESC LIMIT 1",
      [agentId]
    );
    shift = fetchResult.rows[0];
  }

  if (!shift) {
    throw new Error('No active shift found');
  }

  logger.info('Agent clocked out', { agentId, shiftId: shift.id });
  return shift;
}

async function getActiveShift(agentId) {
  const result = await query(
    "SELECT * FROM shift_logs WHERE agent_id = $1 AND status = 'active' ORDER BY start_time DESC LIMIT 1",
    [agentId]
  );
  return result.rows[0];
}

module.exports = {
  startShift,
  endShift,
  getActiveShift
};
