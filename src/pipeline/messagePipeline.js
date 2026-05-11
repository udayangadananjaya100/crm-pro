/**
 * Pro CRM — Message Processing Pipeline
 * Executes the full agent chain: PreFilter → Orchestrator → Compliance → Routing → Audit
 */
const preFilter = require('../agents/preFilter');
const orchestrator = require('../agents/orchestrator');
const compliance = require('../agents/compliance');
const routing = require('../agents/routing');
const auditLogger = require('../agents/auditLogger');
const logger = require('../utils/logger');

/**
 * Process a single incoming WhatsApp message through the full pipeline
 */
async function processMessage(messageData, options = {}) {
  const pipelineStart = Date.now();
  const { bypassRules = false } = options;

  logger.info('━━━ Pipeline Started ━━━', {
    from: messageData.from?.slice(-4),
    type: messageData.messageType,
    bypassRules
  });

  try {
    // ═══════════════════════════════════════
    // STAGE 1: PRE-FILTER
    // ═══════════════════════════════════════
    logger.info('▶ Stage 1: Pre-Filter');
    const preFilterResult = await preFilter.process(messageData);

    if (!preFilterResult.pass && !bypassRules) {
      logger.info('✋ Pre-filter blocked message', {
        action: preFilterResult.action,
        flags: preFilterResult.flags,
      });

      // Log the blocked message
      await auditLogger.logDecision({
        agentType: 'pre_filter',
        action: preFilterResult.action,
        flags: preFilterResult.flags,
        responseTimeMs: preFilterResult.response_time_ms,
      });

      return {
        reply_text: '',
        intent: 'blocked',
        confidence: 1.0,
        next_action: preFilterResult.action,
        assigned_team: 'general_pool',
        flags: preFilterResult.flags,
        metadata: {
          rule_version: '2.1.0',
          language_detected: 'unknown',
          requires_human_review: false,
        },
        pipeline_time_ms: Date.now() - pipelineStart,
      };
    }

    // ═══════════════════════════════════════
    // STAGE 2: ORCHESTRATOR
    // ═══════════════════════════════════════
    logger.info('▶ Stage 2: Orchestrator');
    const orchestratorResult = await orchestrator.process({
      messageData,
      preFilterResult,
    });

    // ═══════════════════════════════════════
    // STAGE 3: COMPLIANCE
    // ═══════════════════════════════════════
    logger.info('▶ Stage 3: Compliance');
    const complianceResult = await compliance.process(orchestratorResult);

    // ═══════════════════════════════════════
    // STAGE 4: ROUTING & DELIVERY
    // ═══════════════════════════════════════
    logger.info('▶ Stage 4: Routing');
    const routingResult = await routing.process(complianceResult);

    // ═══════════════════════════════════════
    // STAGE 5: AUDIT LOGGING
    // ═══════════════════════════════════════
    logger.info('▶ Stage 5: Audit');
    await auditLogger.logPipelineExecution({
      ...routingResult,
      _context: {
        ...complianceResult._context,
        prefilter_time_ms: preFilterResult.response_time_ms,
      },
      violations: complianceResult.violations,
      compliant: complianceResult.compliant,
    });

    const totalTime = Date.now() - pipelineStart;

    logger.info('━━━ Pipeline Complete ━━━', {
      intent: routingResult.intent,
      action: routingResult.next_action,
      confidence: routingResult.confidence,
      delivery: routingResult.delivery?.success,
      totalTime: `${totalTime}ms`,
    });

    return {
      ...routingResult,
      pipeline_time_ms: totalTime,
    };
  } catch (err) {
    logger.error('💥 Pipeline error', { error: err.message, stack: err.stack });

    // Emergency fallback — queue for human
    await auditLogger.logDecision({
      agentType: 'pipeline',
      action: 'emergency_escalation',
      flags: ['pipeline_error'],
      metadata: { error: err.message },
    });

    return {
      reply_text: '',
      intent: 'unknown',
      confidence: 0,
      next_action: 'human_queue',
      assigned_team: 'general_pool',
      flags: ['pipeline_error', 'ai_error'],
      metadata: {
        rule_version: '2.1.0',
        language_detected: 'unknown',
        requires_human_review: true,
      },
      pipeline_time_ms: Date.now() - pipelineStart,
    };
  }
}

module.exports = { processMessage };
