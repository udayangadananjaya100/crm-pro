/**
 * Pro CRM - Scheduled Reporting Service
 */
const { query, getAdapter } = require('../config/database');
const logger = require('../utils/logger');

async function generateDailyReport() {
  try {
    const statsSql = getAdapter() === 'sqlite'
      ? `SELECT
           SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as total_inbound,
           SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as total_outbound,
           AVG(feedback_score) as avg_ai_score
         FROM messages
         WHERE created_at >= datetime('now', '-24 hours')`
      : `SELECT
           SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as total_inbound,
           SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as total_outbound,
           AVG(feedback_score) as avg_ai_score
         FROM messages
         WHERE created_at >= NOW() - INTERVAL '24 hours'`;

    const agentsSql = getAdapter() === 'sqlite'
      ? `SELECT COUNT(DISTINCT agent_id) as count
         FROM shift_logs
         WHERE start_time >= datetime('now', '-24 hours')`
      : `SELECT COUNT(DISTINCT agent_id) as count
         FROM shift_logs
         WHERE start_time >= NOW() - INTERVAL '24 hours'`;

    const stats = await query(statsSql);
    const activeAgents = await query(agentsSql);
    const messages = stats.rows[0] || {};

    const report = {
      date: new Date().toLocaleDateString(),
      messages,
      activeAgents: activeAgents.rows[0]?.count || 0,
      summary: `System processed ${messages.total_inbound || 0} inbound messages in the last 24h.`,
    };

    logger.info('Daily report generated', report);
    return report;
  } catch (err) {
    logger.error('Report generation failed', { error: err.message });
    throw err;
  }
}

module.exports = {
  generateDailyReport,
};
