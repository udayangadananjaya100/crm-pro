/**
 * Pro CRM — Analytics Service
 * Aggregates data for charts, funnels, and performance metrics
 */
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Get message volume trends over time
 */
async function getMessageVolume(days = 7) {
  try {
    const result = await query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*) filter (where direction = 'inbound') as inbound,
         COUNT(*) filter (where direction = 'outbound') as outbound
       FROM messages
       WHERE created_at >= CURRENT_DATE - INTERVAL '$1 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [days]
    );
    return result.rows;
  } catch (err) {
    logger.error('Message volume query error', { error: err.message });
    return [];
  }
}

/**
 * Get lead conversion funnel data
 */
async function getConversionFunnel() {
  try {
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM contacts) as leads,
        (SELECT COUNT(*) FROM contacts WHERE lead_score > 20) as engaged,
        (SELECT COUNT(*) FROM contacts WHERE lead_score >= 80) as hot,
        (SELECT COUNT(*) FROM appointments) as converted
    `);

    const row = result.rows[0];
    return {
      leads: parseInt(row.leads) || 0,
      engaged: parseInt(row.engaged) || 0,
      hot: parseInt(row.hot) || 0,
      converted: parseInt(row.converted) || 0
    };
  } catch (err) {
    logger.error('Funnel query error', { error: err.message });
    return { leads: 0, engaged: 0, hot: 0, converted: 0 };
  }
}

/**
 * Get agent performance leaderboard
 */
async function getAgentLeaderboard() {
  try {
    const result = await query(
      `SELECT 
         a.display_name,
         a.role,
         a.team,
         COUNT(c.id) filter (where c.status = 'resolved') as resolutions,
         AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/60)::integer as avg_resolution_time_mins
       FROM agents a
       LEFT JOIN conversations c ON c.assigned_agent_id = a.id
       WHERE a.status = 'active'
       GROUP BY a.id
       ORDER BY resolutions DESC
       LIMIT 10`
    );
    return result.rows;
  } catch (err) {
    logger.error('Leaderboard query error', { error: err.message });
    return [];
  }
}

/**
 * Get peak activity heatmap data
 */
async function getActivityHeatmap() {
  try {
    const result = await query(
      `SELECT 
         EXTRACT(DOW FROM created_at) as day,
         EXTRACT(HOUR FROM created_at) as hour,
         COUNT(*) as count
       FROM messages
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY day, hour
       ORDER BY day, hour`
    );
    return result.rows;
  } catch (err) {
    logger.error('Heatmap query error', { error: err.message });
    return [];
  }
}

/**
 * Get comprehensive AI metrics
 */
async function getAIMetrics() {
  try {
    const totalAI = await query("SELECT COUNT(*) FROM messages WHERE ai_generated = true");
    const handoffs = await query("SELECT COUNT(*) FROM audit_logs WHERE action = 'conversation_assigned' AND agent_type = 'system'");
    
    return {
      ai_response_rate: 94, // Placeholder for actual calculation
      handoff_rate: 12,    // Placeholder
      accuracy_score: 88,  // Placeholder
      total_ai_messages: parseInt(totalAI.rows[0].count) || 0,
      system_handoffs: parseInt(handoffs.rows[0].count) || 0
    };
  } catch (err) {
    return { ai_response_rate: 0, handoff_rate: 0, accuracy_score: 0, total_ai_messages: 0, system_handoffs: 0 };
  }
}

module.exports = {
  getMessageVolume,
  getConversionFunnel,
  getAgentLeaderboard,
  getActivityHeatmap,
  getAIMetrics
};
