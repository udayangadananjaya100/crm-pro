/**
 * Pro CRM — WhatsApp Webhook Routes
 * Handles Meta Cloud API webhook verification and incoming messages
 */
const express = require('express');
const router = express.Router();
const env = require('../config/environment');
const { parseWebhookPayload, markAsRead } = require('../services/whatsapp');
const { processMessage } = require('../pipeline/messagePipeline');
const { enqueueMessage } = require('../queues/messageQueue');
const realtime = require('../services/realtime');
const logger = require('../utils/logger');

/**
 * GET /api/webhook/whatsapp
 * Meta webhook verification (challenge-response)
 */
router.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const { getSetting } = require('../utils/settings');
  const validToken = await getSetting('WEBHOOK_VERIFY_TOKEN', env.WEBHOOK_VERIFY_TOKEN);

  if (mode === 'subscribe' && token === validToken) {
    logger.info('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('❌ Webhook verification failed', { mode, token: token?.slice(0, 5) });
  return res.sendStatus(403);
});

/**
 * POST /api/webhook/whatsapp
 * Incoming messages from Meta Cloud API
 */
router.post('/', async (req, res) => {
  // Always respond 200 quickly to Meta (they retry on non-200)
  res.sendStatus(200);

  try {
    const messageData = parseWebhookPayload(req.body);

    if (!messageData) {
      logger.debug('Webhook received non-message event');
      return;
    }

    // Handle status updates (delivery receipts)
    if (messageData.type === 'status') {
      logger.debug('Status update received', {
        messageId: messageData.messageId,
        status: messageData.status,
      });
      return;
    }

    // Handle incoming message
    if (messageData.type === 'message') {
      logger.info('📩 Incoming message', {
        from: messageData.from?.slice(-4),
        type: messageData.messageType,
        textLength: messageData.text?.length || 0,
      });

      // Mark as read immediately
      if (messageData.messageId) {
        markAsRead(messageData.messageId).catch(() => {});
      }

      // Process through the pipeline
      // In production, use queue for async processing:
      // await enqueueMessage(messageData);

      // For development, process synchronously:
      const result = await processMessage(messageData);

      logger.info('Pipeline result', {
        intent: result.intent,
        action: result.next_action,
        confidence: result.confidence,
        time: `${result.pipeline_time_ms}ms`,
      });

      // Emit real-time event to all connected dashboards
      realtime.emitNewMessage({
        direction: 'inbound',
        contactName: messageData.contactName || messageData.from,
        conversationId: result.conversation_id,
        intent: result.intent,
        confidence: result.confidence,
      });
    }
  } catch (err) {
    logger.error('Webhook processing error', { error: err.message });
  }
});

module.exports = router;
