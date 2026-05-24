/**
 * Pro CRM — Routing Agent
 * Determines final message delivery action and team assignment
 */
const { getRules } = require('../utils/rulesLoader');
const whatsapp = require('../services/whatsapp');
const conversationService = require('../services/conversation');
const logger = require('../utils/logger');

/**
 * Main routing logic
 */
async function process(complianceResult) {
  const startTime = Date.now();
  const agentRules = getRules('agent');

  logger.info('Routing agent processing', {
    intent: complianceResult.intent,
    nextAction: complianceResult.next_action,
    compliant: complianceResult.compliant,
  });

  const context = complianceResult._context || {};
  const contact = context.contact;
  const conversation = context.conversation;

  // Determine priority
  let priority = 'normal';
  if (complianceResult.flags.includes('angry_customer')) priority = 'high';
  if (complianceResult.flags.includes('urgent_request')) priority = 'urgent';
  if (complianceResult.flags.includes('sla_breach')) priority = 'critical';

  // Boost priority for sentiment
  if (complianceResult.metadata?.sentiment?.angry) priority = 'high';
  if (complianceResult.metadata?.sentiment?.urgent) priority = 'urgent';

  // Execute the routing action
  let deliveryResult = { success: false };

  switch (complianceResult.next_action) {
    case 'auto_send':
      if (complianceResult.reply_text && contact) {
        // Send the message via appropriate channel
        if (contact.source === 'telegram') {
          logger.info(`Sending Telegram message to ${contact.phone_number}: ${complianceResult.reply_text}`);
          deliveryResult = { success: true, messageId: `tg-out-${Date.now()}` };
        } else if (contact.source === 'messenger') {
          logger.info(`Sending Messenger message to ${contact.phone_number}: ${complianceResult.reply_text}`);
          deliveryResult = { success: true, messageId: `msgr-out-${Date.now()}` };
        } else {
          // Send the message via WhatsApp
          deliveryResult = await whatsapp.sendTextMessage(
            contact.phone_number,
            complianceResult.reply_text
          );
        }

        if (deliveryResult.success && conversation) {
          // Store outbound message
          await conversationService.storeOutboundMessage(
            conversation.id,
            contact.id,
            {
              content: complianceResult.reply_text,
              intent: complianceResult.intent,
              confidence: complianceResult.confidence,
              aiGenerated: true,
            }
          );

          // Mark first response
          await conversationService.markFirstResponse(conversation.id);

          // Assign conversation to team
          await conversationService.assignConversation(conversation.id, {
            team: complianceResult.assigned_team,
            intent: complianceResult.intent,
            priority,
          });
        }
      }
      break;

    case 'template_required':
      if (contact) {
        const templateName = complianceResult.metadata?.template_name || 'off_hours_auto_reply';
        const language = complianceResult.metadata?.language_detected || 'en';

        if (contact.source === 'telegram') {
          logger.info(`Sending Telegram template ${templateName} to ${contact.phone_number}`);
          deliveryResult = { success: true, messageId: `tg-template-out-${Date.now()}` };
        } else if (contact.source === 'messenger') {
          logger.info(`Sending Messenger template ${templateName} to ${contact.phone_number}`);
          deliveryResult = { success: true, messageId: `msgr-template-out-${Date.now()}` };
        } else {
          deliveryResult = await whatsapp.sendTemplateMessage(
            contact.phone_number,
            templateName,
            language,
            [
              {
                type: 'body',
                parameters: [{ type: 'text', text: contact.display_name || 'Customer' }],
              },
            ]
          );
        }

        if (deliveryResult.success && conversation) {
          // Store outbound message
          await conversationService.storeOutboundMessage(
            conversation.id,
            contact.id,
            {
              content: `[Template: ${templateName}]`,
              intent: complianceResult.intent,
              confidence: complianceResult.confidence,
              aiGenerated: true,
              templateName,
            }
          );

          // Mark first response
          await conversationService.markFirstResponse(conversation.id);

          // Assign conversation to team
          await conversationService.assignConversation(conversation.id, {
            team: complianceResult.assigned_team,
            intent: complianceResult.intent,
            priority,
          });
        }
      }
      break;

    case 'human_queue':
      // Send queue holding message if present (e.g. during AI failure/outage)
      if (complianceResult.reply_text && contact) {
        if (contact.source === 'telegram') {
          logger.info(`Sending Telegram queue holding message to ${contact.phone_number}: ${complianceResult.reply_text}`);
          deliveryResult = { success: true, messageId: `tg-hold-${Date.now()}` };
        } else if (contact.source === 'messenger') {
          logger.info(`Sending Messenger queue holding message to ${contact.phone_number}: ${complianceResult.reply_text}`);
          deliveryResult = { success: true, messageId: `msgr-hold-${Date.now()}` };
        } else {
          deliveryResult = await whatsapp.sendTextMessage(
            contact.phone_number,
            complianceResult.reply_text
          );
        }

        if (deliveryResult.success && conversation) {
          // Store outbound message
          await conversationService.storeOutboundMessage(
            conversation.id,
            contact.id,
            {
              content: complianceResult.reply_text,
              intent: complianceResult.intent,
              confidence: complianceResult.confidence,
              aiGenerated: true,
            }
          );

          // Mark first response
          await conversationService.markFirstResponse(conversation.id);
        }
      }

      // Assign to human agent queue
      if (conversation) {
        await conversationService.assignConversation(conversation.id, {
          team: complianceResult.assigned_team,
          intent: complianceResult.intent,
          priority: priority === 'normal' ? 'high' : priority,
        });
      }

      // Keep deliveryResult fields but ensure queued is true
      deliveryResult = { 
        success: deliveryResult.success !== undefined ? deliveryResult.success : true, 
        queued: true,
        messageId: deliveryResult.messageId || null
      };

      logger.info('Message queued for human agent', {
        team: complianceResult.assigned_team,
        priority,
      });
      break;

    case 'suppress':
      deliveryResult = { success: true, suppressed: true };
      logger.info('Message suppressed', {
        reason: complianceResult.flags.join(', '),
      });
      break;

    default:
      logger.warn('Unknown routing action', { action: complianceResult.next_action });
      deliveryResult = { success: false, error: 'Unknown action' };
  }

  const finalReplyText = complianceResult.reply_text || 
    (complianceResult.next_action === 'template_required' ? `[Template: ${complianceResult.metadata?.template_name || 'off_hours_auto_reply'}]` : '');

  // Build final output (clean JSON without internal context)
  const finalOutput = {
    conversation_id: conversation?.id || null,
    reply_text: finalReplyText,
    intent: complianceResult.intent,
    confidence: complianceResult.confidence,
    next_action: complianceResult.next_action,
    assigned_team: complianceResult.assigned_team,
    flags: complianceResult.flags,
    metadata: {
      ...(complianceResult.metadata || {}),
      rule_version: complianceResult.metadata?.rule_version || '2.1.0',
      language_detected: complianceResult.metadata?.language_detected || 'en',
      requires_human_review: complianceResult.metadata?.requires_human_review || false,
    },
    delivery: {
      success: deliveryResult.success,
      message_id: deliveryResult.messageId || null,
      queued: deliveryResult.queued || false,
      suppressed: deliveryResult.suppressed || false,
    },
    priority,
    response_time_ms: Date.now() - startTime,
    total_pipeline_time_ms:
      (complianceResult._context?.response_time_ms || 0) +
      (complianceResult.response_time_ms || 0) +
      (Date.now() - startTime),
  };

  return finalOutput;
}

module.exports = { process };
