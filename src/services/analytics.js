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
    const { getAdapter } = require('../config/database');
    const isSqlite = getAdapter() === 'sqlite';
    const result = isSqlite
      ? await query(
          `SELECT 
             date(created_at) as date,
             SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
             SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound
           FROM messages
           WHERE created_at >= datetime('now', '-' || $1 || ' days')
           GROUP BY date(created_at)
           ORDER BY date(created_at) ASC`,
          [days]
        )
      : await query(
          `SELECT 
             created_at::date as date,
             COUNT(*) filter (where direction = 'inbound') as inbound,
             COUNT(*) filter (where direction = 'outbound') as outbound
           FROM messages
           WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
           GROUP BY created_at::date
           ORDER BY date ASC`,
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
    const { getAdapter } = require('../config/database');
    const isSqlite = getAdapter() === 'sqlite';
    const result = isSqlite
      ? await query(
          `SELECT 
             a.display_name,
             a.role,
             a.team,
             SUM(CASE WHEN c.status = 'resolved' THEN 1 ELSE 0 END) as resolutions,
             CAST(AVG((julianday(c.updated_at) - julianday(c.created_at)) * 1440) AS INTEGER) as avg_resolution_time_mins
           FROM agents a
           LEFT JOIN conversations c ON c.assigned_agent_id = a.id
           WHERE a.status = 'active'
           GROUP BY a.id
           ORDER BY resolutions DESC
           LIMIT 10`
        )
      : await query(
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
    const { getAdapter } = require('../config/database');
    const isSqlite = getAdapter() === 'sqlite';
    const result = isSqlite
      ? await query(
          `SELECT 
             CAST(strftime('%w', created_at) AS INTEGER) as day,
             CAST(strftime('%H', created_at) AS INTEGER) as hour,
             COUNT(*) as count
           FROM messages
           WHERE created_at >= datetime('now', '-30 days')
           GROUP BY day, hour
           ORDER BY day, hour`
        )
      : await query(
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
    const totalAICount = await query("SELECT COUNT(*) as count FROM messages WHERE ai_generated = 1 OR ai_generated = true");
    const totalOutboundCount = await query("SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'");
    const totalConversationsCount = await query("SELECT COUNT(*) as count FROM conversations");
    const handoffsCount = await query("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'human_queue' OR action = 'conversation_assigned'");
    const avgConfidenceResult = await query("SELECT AVG(confidence) as avg_conf FROM audit_logs WHERE agent_type = 'orchestrator' AND confidence IS NOT NULL");

    const totalAI = parseInt(totalAICount.rows[0].count) || 0;
    const totalOutbound = parseInt(totalOutboundCount.rows[0].count) || 0;
    const totalConversations = parseInt(totalConversationsCount.rows[0].count) || 0;
    const systemHandoffs = parseInt(handoffsCount.rows[0].count) || 0;
    const avgConf = parseFloat(avgConfidenceResult.rows[0].avg_conf) || 0.8;

    const aiResponseRate = totalOutbound > 0 ? Math.round((totalAI / totalOutbound) * 100) : 0;
    const handoffRate = totalConversations > 0 ? Math.round((systemHandoffs / totalConversations) * 100) : 0;
    const accuracyScore = Math.round(avgConf * 100);

    return {
      ai_response_rate: Math.min(100, aiResponseRate),
      handoff_rate: Math.min(100, handoffRate),
      accuracy_score: Math.min(100, accuracyScore),
      total_ai_messages: totalAI,
      system_handoffs: systemHandoffs
    };
  } catch (err) {
    logger.error('Error fetching dynamic AI metrics', { error: err.message });
    return { ai_response_rate: 0, handoff_rate: 0, accuracy_score: 0, total_ai_messages: 0, system_handoffs: 0 };
  }
}

/**
 * Get advanced SLA, Response Time, and CSAT stats
 */
async function getAdvancedStats() {
  try {
    const { getAdapter } = require('../config/database');
    const isSqlite = getAdapter() === 'sqlite';

    // 1. SLA Breach Rate
    const slaResult = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN sla_breached = 1 OR sla_breached = true THEN 1 ELSE 0 END) as breached
      FROM conversations
    `);
    const totalConvs = parseInt(slaResult.rows[0]?.total) || 0;
    const breachedConvs = parseInt(slaResult.rows[0]?.breached) || 0;
    const breachRate = totalConvs > 0 ? Math.round((breachedConvs / totalConvs) * 100) : 0;

    // 2. Average Response Time (in minutes)
    const respTimeResult = isSqlite
      ? await query(`
          SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 1440) as avg_time
          FROM conversations 
          WHERE first_response_at IS NOT NULL
        `)
      : await query(`
          SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))/60) as avg_time
          FROM conversations 
          WHERE first_response_at IS NOT NULL
        `);
    const avgResponseTimeMins = Math.round(parseFloat(respTimeResult.rows[0]?.avg_time) || 0);

    // 3. Average CSAT
    const csatResult = await query(`
      SELECT 
        AVG(csat_score) as avg_csat,
        COUNT(csat_score) as total_feedback
      FROM conversations 
      WHERE csat_score IS NOT NULL
    `);
    const avgCsat = Math.round((parseFloat(csatResult.rows[0]?.avg_csat) || 0) * 10) / 10;
    const totalFeedback = parseInt(csatResult.rows[0]?.total_feedback) || 0;

    return {
      total_conversations: totalConvs,
      sla_breached_count: breachedConvs,
      sla_breach_rate: breachRate,
      avg_response_time_mins: avgResponseTimeMins,
      avg_csat: avgCsat,
      total_feedback: totalFeedback
    };
  } catch (err) {
    logger.error('Error fetching advanced stats', { error: err.message });
    return {
      total_conversations: 0,
      sla_breached_count: 0,
      sla_breach_rate: 0,
      avg_response_time_mins: 0,
      avg_csat: 0,
      total_feedback: 0
    };
  }
}

module.exports = {
  getMessageVolume,
  getConversionFunnel,
  getAgentLeaderboard,
  getActivityHeatmap,
  getAIMetrics,
  getAdvancedStats
};
