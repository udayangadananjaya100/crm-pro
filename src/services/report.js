/**
 * Pro CRM — Scheduled Reporting Service
 * Generates automated performance summaries for management
 */
const { query } = require('../config/database');
const logger = require('../utils/logger');

async function generateDailyReport() {
  try {
    const { getAdapter } = require('../config/database');
    const isSqlite = getAdapter() === 'sqlite';

    const stats = isSqlite
      ? await query(`
          SELECT 
            SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as total_inbound,
            SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as total_outbound,
            AVG(feedback_score) as avg_ai_score
          FROM messages 
          WHERE created_at >= datetime('now', '-24 hours')
        `)
      : await query(`
          SELECT 
            COUNT(*) FILTER (WHERE direction = 'inbound') as total_inbound,
            COUNT(*) FILTER (WHERE direction = 'outbound') as total_outbound,
            AVG(feedback_score) as avg_ai_score
          FROM messages 
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `);

    const activeAgents = isSqlite
      ? await query(`
          SELECT COUNT(DISTINCT agent_id) as count 
          FROM shift_logs 
          WHERE start_time >= datetime('now', '-24 hours')
        `)
      : await query(`
          SELECT COUNT(DISTINCT agent_id) as count 
          FROM shift_logs 
          WHERE start_time >= NOW() - INTERVAL '24 hours'
        `);

    const report = {
      date: new Date().toLocaleDateString(),
      messages: stats.rows[0],
      activeAgents: activeAgents.rows[0].count,
      summary: `System processed ${stats.rows[0].total_inbound} inbound messages in the last 24h.`
    };

    logger.info('Daily report generated', report);
    return report;
  } catch (err) {
    logger.error('Report generation failed', { error: err.message });
    throw err;
  }
}

module.exports = {
  generateDailyReport
};
