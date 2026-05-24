/**
 * Pro CRM — SLA Monitoring Agent
 * Periodically checks for conversations that exceed target response/resolution times
 */
const { query } = require('../config/database');
const { getRules } = require('../utils/rulesLoader');
const notificationService = require('../services/notification');
const logger = require('../utils/logger');

/**
 * Check for SLA breaches across all active conversations
 */
async function checkSLABreaches() {
  try {
    const rules = getRules('agent');
    if (!rules || !rules.sla_config) return;

    const slaConfig = rules.sla_config;
    
    // Fetch active conversations that aren't already marked as breached
    const result = await query(`
      SELECT id, assigned_team, status, priority, updated_at, created_at
      FROM conversations 
      WHERE status IN ('open', 'assigned', 'pending')
      AND sla_breached = 0
    `);

    for (const conv of result.rows) {
      const updatedAt = new Date(conv.updated_at);
      const now = new Date();
      const diffMinutes = (now - updatedAt) / (1000 * 60);
      
      const team = conv.assigned_team || 'general';
      // Normalize team name to match rule keys
      const teamKey = team === 'general_pool' ? 'general' : team;
      const target = slaConfig.resolution_time[teamKey] || slaConfig.resolution_time.general;
      
      if (diffMinutes >= target.breach_minutes) {
        logger.warn(`SLA Breach detected for conversation ${conv.id}`, { 
          diffMinutes: Math.round(diffMinutes), 
          team,
          limit: target.breach_minutes 
        });
        
        // Mark as breached and upgrade priority
        await query(
          "UPDATE conversations SET sla_breached = 1, priority = CASE WHEN priority IN ('urgent', 'critical') THEN priority ELSE 'high' END WHERE id = $1", 
          [conv.id]
        );
        
        // Trigger multi-channel notifications
        await notificationService.alertSLABreach(
          conv.id, 
          team, 
          `Resolution Time Breach (> ${target.breach_minutes}m)`
        );
      }
    }
  } catch (err) {
    logger.error('SLA Monitor background check failed', { error: err.message });
  }
}

/**
 * Start the SLA monitoring loop
 */
function startSLALoop(intervalMs = 60000) { // Default 1 minute
  logger.info('🚀 SLA Monitor agent activated');
  
  // Initial check
  checkSLABreaches();
  
  // Schedule periodic checks
  const intervalId = setInterval(checkSLABreaches, intervalMs);
  
  return intervalId;
}

module.exports = { startSLALoop };
