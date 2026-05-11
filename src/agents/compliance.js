/**
 * Pro CRM — Compliance Agent
 * Validates outbound messages for regulatory compliance before sending
 */
const { getRules } = require('../utils/rulesLoader');
const { scanAndMask, containsPII } = require('../utils/piiMasker');
const logger = require('../utils/logger');

/**
 * Prompt injection patterns to detect and block
 */
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all)\s+(instructions|rules)/i,
  /system\s*prompt/i,
  /reveal\s+your\s+instructions/i,
  /developer\s+mode/i,
  /DAN\s+mode/i,
  /jailbreak/i,
  /you\s+are\s+now/i,
  /act\s+as\s+/i,
  /```system/i,
  /<\|im_start\|>/,
  /\[INST\]/,
];

/**
 * Main compliance check
 */
async function process(orchestratorResult) {
  const startTime = Date.now();
  const violations = [];
  const flags = [...(orchestratorResult.flags || [])];
  let modifiedReply = orchestratorResult.reply_text;
  let nextAction = orchestratorResult.next_action;
  let requiresHumanReview = orchestratorResult.metadata?.requires_human_review || false;

  logger.info('Compliance agent processing', {
    intent: orchestratorResult.intent,
    nextAction: nextAction,
  });

  const complianceRules = getRules('compliance');

  // 1. Check if already suppressed
  if (orchestratorResult.next_action === 'suppress') {
    return {
      ...orchestratorResult,
      compliant: true,
      violations: [],
      response_time_ms: Date.now() - startTime,
    };
  }

  // 2. PII Scan on outbound reply
  if (modifiedReply) {
    const piiResult = scanAndMask(modifiedReply);
    if (piiResult.original_contains_pii) {
      violations.push('pii_in_outbound');
      flags.push('pii_detected');
      modifiedReply = piiResult.masked_text;
      logger.warn('PII detected in outbound message — masked', {
        types: piiResult.detected_types,
      });
    }
  }

  // 3. Prompt injection check on inbound (defense)
  // Note: The inbound message was already passed through, but we validate AI output wasn't compromised
  if (modifiedReply) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(modifiedReply)) {
        violations.push('ai_output_contaminated');
        flags.push('prompt_injection_suspected');
        modifiedReply = null; // Block the response
        logger.error('Prompt injection suspected in AI output');
        break;
      }
    }
  }

  // 4. Content restriction check
  if (modifiedReply && complianceRules?.content_restrictions) {
    const restrictedActions = complianceRules.content_restrictions.restricted_actions || [];
    const lowerReply = modifiedReply.toLowerCase();

    // Check for API key / config leaks
    if (lowerReply.includes('api_key') || lowerReply.includes('api key') ||
        lowerReply.includes('secret') || lowerReply.includes('password')) {
      violations.push('potential_config_leak');
      flags.push('security_concern');
      modifiedReply = null;
      logger.error('Potential config/secret leak in AI response — blocked');
    }
  }

  // 5. Tone compliance
  if (modifiedReply && complianceRules?.tone_compliance) {
    const prohibited = complianceRules.tone_compliance.prohibited || [];
    // Basic tone checks (could be enhanced with AI sentiment analysis)
    const aggressivePatterns = [
      /you\s+must/i,
      /you\s+are\s+wrong/i,
      /stupid/i,
      /idiot/i,
    ];

    for (const pattern of aggressivePatterns) {
      if (pattern.test(modifiedReply)) {
        violations.push('tone_violation');
        flags.push('tone_review_needed');
        logger.warn('Tone violation detected in AI response');
        break;
      }
    }
  }

  // 6. Message length check
  const workspace = getRules('workspace');
  const maxLength = workspace?.messaging?.max_message_length || 4096;
  if (modifiedReply && modifiedReply.length > maxLength) {
    modifiedReply = modifiedReply.substring(0, maxLength - 50) + '\n\n... (message truncated)';
    violations.push('message_too_long');
  }

  // 7. 24h window enforcement (double-check)
  if (nextAction === 'auto_send' &&
      flags.includes('outside_24h_window')) {
    violations.push('24h_window_violation');
    nextAction = 'template_required';
  }

  // Determine final compliance status
  const criticalViolations = violations.filter((v) =>
    ['ai_output_contaminated', 'potential_config_leak', '24h_window_violation'].includes(v)
  );

  const compliant = criticalViolations.length === 0;

  if (!compliant && modifiedReply === null) {
    // Critical violation — route to human
    nextAction = 'human_queue';
    requiresHumanReview = true;
  }

  return {
    ...orchestratorResult,
    reply_text: modifiedReply || orchestratorResult.reply_text,
    next_action: nextAction,
    flags,
    compliant,
    violations,
    metadata: {
      ...orchestratorResult.metadata,
      requires_human_review: requiresHumanReview,
    },
    response_time_ms: Date.now() - startTime,
  };
}

module.exports = { process };
