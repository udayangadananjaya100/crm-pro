/**
 * Pro CRM — Notification Service
 * Sends alerts via Slack, Email (console), and in-app notifications
 */
const axios = require('axios');
const env = require('../config/environment');
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Send a Slack notification
 */
async function sendSlack(message, channel = 'alerts') {
  if (!env.SLACK_WEBHOOK_URL || env.SLACK_WEBHOOK_URL.includes('xxx')) {
    logger.debug('Slack notification skipped (no webhook configured)', { message });
    return false;
  }

  try {
    await axios.post(env.SLACK_WEBHOOK_URL, {
      channel: `#procrm-${channel}`,
      username: 'Pro CRM Bot',
      icon_emoji: ':robot_face:',
      text: message,
    });
    logger.info('Slack notification sent', { channel });
    return true;
  } catch (err) {
    logger.error('Slack notification failed', { error: err.message });
    return false;
  }
}

/**
 * Send email notification (logs to console in dev, uses service in prod)
 */
async function sendEmail(to, subject, body) {
  // In development, just log the email
  if (env.isDev) {
    logger.info('📧 EMAIL NOTIFICATION (dev mode)', { to, subject, body: body.substring(0, 200) });
    return true;
  }

  // In production, integrate with your email service (SendGrid, SES, etc.)
  logger.warn('Email service not configured for production');
  return false;
}

/**
 * Store in-app notification (for dashboard)
 */
async function createInAppNotification({ title, message, type = 'info', targetRole = null, targetAgentId = null }) {
  try {
    await query(
      `INSERT INTO notifications (title, message, type, target_role, target_agent_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [title, message, type, targetRole, targetAgentId]
    );
    return true;
  } catch (err) {
    // Table might not exist yet — just log
    logger.debug('In-app notification stored (or skipped)', { title, type });
    return false;
  }
}

// ─────────────────────────────────────
// Pre-built notification triggers
// ─────────────────────────────────────

/**
 * SLA Breach Alert
 */
async function alertSLABreach(conversationId, team, breachType) {
  const message = `🚨 *SLA BREACH* — Conversation \`${conversationId}\`\n` +
    `Team: ${team}\nBreach: ${breachType}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;

  await Promise.all([
    sendSlack(message, 'sla-alerts'),
    sendEmail(env.MANAGER_EMAIL, `[SLA BREACH] ${breachType}`, message),
    createInAppNotification({
      title: 'SLA Breach',
      message: `${breachType} — Team: ${team}`,
      type: 'warning',
      targetRole: 'manager',
    }),
  ]);
}

/**
 * Escalation Alert
 */
async function alertEscalation(conversationId, reason, level) {
  const levelEmoji = { 1: '⚠️', 2: '🔶', 3: '🔴', 4: '💀' };
  const emoji = levelEmoji[level] || '⚠️';

  const message = `${emoji} *ESCALATION (Level ${level})* — Conversation \`${conversationId}\`\n` +
    `Reason: ${reason}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;

  await Promise.all([
    sendSlack(message, 'escalations'),
    level >= 3 && sendEmail(env.MANAGER_EMAIL, `[ESCALATION L${level}] ${reason}`, message),
    createInAppNotification({
      title: `Escalation Level ${level}`,
      message: reason,
      type: level >= 3 ? 'critical' : 'warning',
      targetRole: level >= 3 ? 'manager' : 'team_lead',
    }),
  ]);
}

/**
 * Compliance Violation Alert
 */
async function alertComplianceViolation(conversationId, violations) {
  const message = `🛡️ *COMPLIANCE VIOLATION* — Conversation \`${conversationId}\`\n` +
    `Violations: ${violations.join(', ')}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;

  await Promise.all([
    sendSlack(message, 'compliance'),
    sendEmail(env.MANAGER_EMAIL, '[COMPLIANCE] Violation Detected', message),
    createInAppNotification({
      title: 'Compliance Violation',
      message: violations.join(', '),
      type: 'critical',
      targetRole: 'admin',
    }),
  ]);
}

/**
 * New Lead Alert
 */
async function alertNewLead(contactName, phone) {
  const maskedPhone = `***-***-${phone.slice(-4)}`;
  const message = `🆕 *NEW LEAD* — ${contactName} (${maskedPhone})\n` +
    `Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;

  await sendSlack(message, 'leads');
  await createInAppNotification({
    title: 'New Lead',
    message: `${contactName} contacted via WhatsApp`,
    type: 'info',
    targetRole: 'agent',
  });
}

/**
 * System Error Alert
 */
async function alertSystemError(component, error) {
  const message = `💥 *SYSTEM ERROR* — ${component}\n` +
    `Error: ${error}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;

  await Promise.all([
    sendSlack(message, 'system-errors'),
    sendEmail(env.MANAGER_EMAIL, `[SYSTEM ERROR] ${component}`, message),
  ]);
}

module.exports = {
  sendSlack,
  sendEmail,
  createInAppNotification,
  alertSLABreach,
  alertEscalation,
  alertComplianceViolation,
  alertNewLead,
  alertSystemError,
};
