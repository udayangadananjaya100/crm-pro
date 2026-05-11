/**
 * Pro CRM — Audit Logger Agent
 * Creates immutable audit trail for every pipeline decision
 */
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Log a pipeline decision to the audit_logs table
 */
async function logDecision({
  messageId = null,
  conversationId = null,
  agentType,
  action,
  intent = null,
  confidence = null,
  ruleApplied = null,
  flags = [],
  inputSummary = null,
  outputSummary = null,
  responseTimeMs = null,
  metadata = {},
}) {
  try {
    const result = await query(
      `INSERT INTO audit_logs (
        message_id, conversation_id, agent_type, action,
        intent, confidence, rule_applied, flags,
        input_summary, output_summary, response_time_ms, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        messageId,
        conversationId,
        agentType,
        action,
        intent,
        confidence,
        ruleApplied,
        flags,
        inputSummary,
        outputSummary,
        responseTimeMs,
        JSON.stringify(metadata),
      ]
    );

    return { logged: true, log_id: result.rows[0]?.id };
  } catch (err) {
    // Audit logging failure is critical — log to console as fallback
    logger.error('❌ CRITICAL: Audit logging failed', {
      error: err.message,
      agentType,
      action,
    });

    // Fallback: write to file log
    logger.error('AUDIT_FALLBACK', {
      messageId,
      conversationId,
      agentType,
      action,
      intent,
      confidence,
      flags,
      timestamp: new Date().toISOString(),
    });

    return { logged: false, error: err.message };
  }
}

/**
 * Log the full pipeline execution
 */
async function logPipelineExecution(pipelineResult) {
  const context = pipelineResult._context || {};

  try {
    // Log pre-filter decision
    await logDecision({
      conversationId: context.conversation?.id,
      agentType: 'pre_filter',
      action: pipelineResult.next_action,
      flags: pipelineResult.flags.filter((f) =>
        ['spam_detected', 'blocked_sender', 'off_hours', 'new_contact', 'opt_out_attempt'].includes(f)
      ),
      responseTimeMs: context.prefilter_time_ms,
    });

    // Log orchestrator decision
    await logDecision({
      conversationId: context.conversation?.id,
      agentType: 'orchestrator',
      action: pipelineResult.next_action,
      intent: pipelineResult.intent,
      confidence: pipelineResult.confidence,
      flags: pipelineResult.flags.filter((f) =>
        ['low_confidence', 'ai_error', 'angry_customer', 'urgent_request'].includes(f)
      ),
      outputSummary: pipelineResult.reply_text?.substring(0, 200),
      metadata: {
        language: pipelineResult.metadata?.language_detected,
        ai_success: pipelineResult.metadata?.ai_success,
      },
    });

    // Log compliance decision
    await logDecision({
      conversationId: context.conversation?.id,
      agentType: 'compliance',
      action: pipelineResult.compliant === false ? 'blocked' : 'approved',
      flags: pipelineResult.flags.filter((f) =>
        ['pii_detected', 'prompt_injection_suspected', 'tone_review_needed'].includes(f)
      ),
      metadata: { violations: pipelineResult.violations || [] },
    });

    // Log routing decision
    await logDecision({
      conversationId: context.conversation?.id,
      agentType: 'routing',
      action: pipelineResult.next_action,
      intent: pipelineResult.intent,
      confidence: pipelineResult.confidence,
      ruleApplied: `route_to_${pipelineResult.assigned_team}`,
      flags: pipelineResult.flags,
      responseTimeMs: pipelineResult.total_pipeline_time_ms,
      metadata: {
        delivery_success: pipelineResult.delivery?.success,
        priority: pipelineResult.priority,
      },
    });

    logger.info('Pipeline audit logged successfully');
  } catch (err) {
    logger.error('Pipeline audit logging failed', { error: err.message });
  }
}

/**
 * Query audit logs (for admin dashboard)
 */
async function getAuditLogs({ page = 1, limit = 50, agentType, action, startDate, endDate }) {
  const offset = (page - 1) * limit;
  let conditions = [];
  let params = [];
  let paramIndex = 1;

  if (agentType) {
    conditions.push(`agent_type = $${paramIndex++}`);
    params.push(agentType);
  }
  if (action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(action);
  }
  if (startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  const countResult = await query(`SELECT COUNT(*) FROM audit_logs ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  return { logs: result.rows, total, page, totalPages: Math.ceil(total / limit) };
}

module.exports = { logDecision, logPipelineExecution, getAuditLogs };
