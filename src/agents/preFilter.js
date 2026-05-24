/**
 * Pro CRM — Pre-Filter Agent
 * Gatekeeper: validates sender status, spam, opt-out, business hours
 */
const { getRules } = require('../utils/rulesLoader');
const { getContactByPhone } = require('../services/contact');
const logger = require('../utils/logger');

// Opt-out keywords from compliance rules
function getOptOutKeywords() {
  const compliance = getRules('compliance');
  if (!compliance?.opt_out) return [];
  return [
    ...(compliance.opt_out.keywords_en || []),
    ...(compliance.opt_out.keywords_si || []),
  ];
}

// Resubscribe keywords
function getResubscribeKeywords() {
  const compliance = getRules('compliance');
  if (!compliance?.opt_out) return [];
  return [
    ...(compliance.opt_out.resubscribe_keywords_en || []),
    ...(compliance.opt_out.resubscribe_keywords_si || []),
  ];
}

/**
 * Check if current time is within business hours
 */
function isBusinessHours() {
  const workspace = getRules('workspace');
  if (!workspace?.business_hours?.enabled) return true;

  const schedule = workspace.business_hours.schedule;
  const tz = workspace.business_hours.timezone || 'Asia/Colombo';

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase();
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const daySchedule = schedule[weekday];
  if (!daySchedule) return false;

  return currentTime >= daySchedule.start && currentTime <= daySchedule.end;
}

/**
 * Check for opt-out attempt
 */
function isOptOutAttempt(messageText) {
  const keywords = getOptOutKeywords();
  const text = messageText.toLowerCase().trim();
  return keywords.some((kw) => text === kw.toLowerCase() || text.includes(kw.toLowerCase()));
}

/**
 * Check for resubscribe attempt
 */
function isResubscribeAttempt(messageText) {
  const keywords = getResubscribeKeywords();
  const text = messageText.toLowerCase().trim();
  return keywords.some((kw) => text === kw.toLowerCase());
}

/**
 * Run spam detection
 */
function checkSpam(messageText, senderHistory = []) {
  const workspace = getRules('workspace');
  if (!workspace?.spam_detection?.enabled) return { isSpam: false };

  // Check for repeated identical messages
  if (senderHistory.length >= 3) {
    const lastThree = senderHistory.slice(-3);
    if (lastThree.every((msg) => msg === messageText)) {
      return { isSpam: true, reason: 'repeated_identical_messages' };
    }
  }

  // Check message rate
  const rateLimit = workspace.spam_detection.rate_limit_per_sender;
  if (senderHistory.length > (rateLimit?.max_messages_per_minute || 10)) {
    return { isSpam: true, reason: 'rapid_fire_messages' };
  }

  return { isSpam: false };
}

/**
 * Main pre-filter processing
 */
async function process(messageData) {
  const startTime = Date.now();
  const flags = [];
  let senderStatus = 'unknown';

  logger.info('Pre-filter agent processing', { from: messageData.from?.slice(-4) });

  // 1. Check sender status in database
  const contact = await getContactByPhone(messageData.from);

  if (contact) {
    senderStatus = contact.status;

    // Blocked sender
    if (contact.status === 'blocked') {
      logger.warn('Blocked sender attempted contact', { contactId: contact.id });
      return {
        pass: false,
        action: 'suppress',
        flags: ['blocked_sender'],
        sender_status: 'blocked',
        contact,
        response_time_ms: Date.now() - startTime,
      };
    }

    // Unsubscribed sender — check if resubscribing
    if (contact.status === 'unsubscribed') {
      if (isResubscribeAttempt(messageData.text || '')) {
        flags.push('resubscribe_attempt');
        senderStatus = 'resubscribing';
      } else {
        // Allow message through but flag it
        flags.push('unsubscribed_sender');
      }
    }
  } else {
    senderStatus = 'new';
    flags.push('new_contact');
  }

  // 2. Check opt-out
  if (isOptOutAttempt(messageData.text || '')) {
    flags.push('opt_out_attempt');
    return {
      pass: true, // Pass through so the orchestrator can handle confirmation
      action: 'opt_out',
      flags,
      sender_status: senderStatus,
      contact,
      response_time_ms: Date.now() - startTime,
    };
  }

  // 3. Check spam
  let senderHistory = [];
  if (contact) {
    const db = require('../config/database');
    const recentMessages = await db.query(
      `SELECT content FROM messages 
       WHERE contact_id = $1 AND direction = 'inbound' AND created_at >= NOW() - INTERVAL '1 minute'
       ORDER BY created_at ASC`,
      [contact.id]
    );
    senderHistory = recentMessages.rows.map(r => r.content);
  }

  const spamCheck = checkSpam(messageData.text || '', senderHistory);
  if (spamCheck.isSpam) {
    flags.push('spam_detected');
    logger.warn('Spam detected', { reason: spamCheck.reason });
    return {
      pass: false,
      action: 'drop',
      flags,
      sender_status: senderStatus,
      contact,
      response_time_ms: Date.now() - startTime,
    };
  }

  // 4. Check business hours
  if (!isBusinessHours()) {
    flags.push('off_hours');
  }

  return {
    pass: true,
    action: flags.includes('off_hours') ? 'off_hours_reply' : 'continue',
    flags,
    sender_status: senderStatus,
    contact,
    is_business_hours: !flags.includes('off_hours'),
    response_time_ms: Date.now() - startTime,
  };
}

module.exports = { process, isBusinessHours, isOptOutAttempt };
