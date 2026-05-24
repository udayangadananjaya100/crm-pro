/**
 * Pro CRM — WhatsApp, Telegram & Messenger Webhook Routes
 * Handles webhook verification and incoming messages with HMAC signature check and BullMQ async queuing.
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const env = require('../config/environment');
const redis = require('../config/redis');
const { parseWebhookPayload, markAsRead } = require('../services/whatsapp');
const { processMessage } = require('../pipeline/messagePipeline');
const { enqueueMessage } = require('../queues/messageQueue');
const realtime = require('../services/realtime');
const logger = require('../utils/logger');

/**
 * Middleware to verify HMAC SHA256 signature for Meta webhooks
 */
async function verifyMetaSignature(req, res, next) {
  try {
    const { getSetting } = require('../utils/settings');
    const appSecret = await getSetting('META_APP_SECRET');
    
    if (!appSecret) {
      // If Meta App Secret is not configured, skip validation (default fallback for dev/setup)
      return next();
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      logger.warn('❌ Meta webhook signature validation failed: Missing X-Hub-Signature-256 header');
      return res.sendStatus(401);
    }

    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      logger.warn('❌ Meta webhook signature validation failed: Invalid header format');
      return res.sendStatus(401);
    }

    const signatureHash = parts[1];
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody || '')
      .digest('hex');

    if (signatureHash !== expectedHash) {
      logger.warn('❌ Meta webhook signature validation failed: Signature mismatch');
      return res.sendStatus(401);
    }

    logger.debug('✅ Meta webhook signature validated successfully');
    next();
  } catch (err) {
    logger.error('Meta webhook signature validation error', { error: err.message });
    res.sendStatus(500);
  }
}

/**
 * GET /api/webhook/whatsapp
 * Meta webhook verification (challenge-response)
 */
router.get('/whatsapp', async (req, res) => {
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
router.post('/whatsapp', verifyMetaSignature, async (req, res) => {
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
      });

      // Mark as read immediately
      if (messageData.messageId) {
        markAsRead(messageData.messageId).catch(() => {});
      }

      // Add source 'whatsapp' explicitly
      messageData.source = 'whatsapp';

      // Process asynchronously if Redis is connected, else fallback to inline/sync processing
      let enqueued = false;
      try {
        const redisClient = redis.getRedis();
        if (redisClient && redisClient.status === 'ready') {
          await enqueueMessage(messageData);
          enqueued = true;
        }
      } catch (err) {
        logger.warn('Failed to enqueue WhatsApp message, falling back to synchronous processing', { error: err.message });
      }

      if (!enqueued) {
        const result = await processMessage(messageData);

        logger.info('Pipeline result (synchronous fallback)', {
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
    }
  } catch (err) {
    logger.error('Webhook processing error', { error: err.message });
  }
});

/**
 * POST /api/webhook/telegram
 * Incoming messages from Telegram Bot API
 */
router.post('/telegram', async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;
    const msg = update.message;
    if (!msg) return;

    const fromId = msg.chat?.id || msg.from?.id;
    if (!fromId) return;

    const contactName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || 'Telegram User';

    const messageData = {
      type: 'message',
      messageId: `tg-${msg.message_id}`,
      from: `telegram:${fromId}`,
      timestamp: msg.date,
      messageType: msg.voice ? 'audio' : 'text',
      text: msg.text || '',
      contactName: contactName,
      source: 'telegram',
      voice: msg.voice ? { id: msg.voice.file_id, mime_type: msg.voice.mime_type } : null
    };

    logger.info('📩 Incoming Telegram message', {
      from: messageData.from,
      type: messageData.messageType,
    });

    // Process asynchronously if Redis is connected, else fallback to inline/sync processing
    let enqueued = false;
    try {
      const redisClient = redis.getRedis();
      if (redisClient && redisClient.status === 'ready') {
        await enqueueMessage(messageData);
        enqueued = true;
      }
    } catch (err) {
      logger.warn('Failed to enqueue Telegram message, falling back to synchronous processing', { error: err.message });
    }

    if (!enqueued) {
      const result = await processMessage(messageData);

      logger.info('Telegram Pipeline result (synchronous fallback)', {
        intent: result.intent,
        action: result.next_action,
        confidence: result.confidence,
        time: `${result.pipeline_time_ms}ms`,
      });

      realtime.emitNewMessage({
        direction: 'inbound',
        contactName: messageData.contactName || messageData.from,
        conversationId: result.conversation_id,
        intent: result.intent,
        confidence: result.confidence,
      });
    }
  } catch (err) {
    logger.error('Telegram Webhook processing error', { error: err.message });
  }
});

/**
 * POST /api/webhook/messenger
 * Incoming messages from Facebook Messenger webhook
 */
router.post('/messenger', verifyMetaSignature, async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];
    if (!messaging || !messaging.message) return;

    const fromId = messaging.sender?.id;
    if (!fromId) return;

    const contactName = `Messenger User ${fromId.slice(-4)}`;

    let messageType = 'text';
    let voiceObj = null;

    const attachment = messaging.message.attachments?.[0];
    if (attachment && attachment.type === 'audio') {
      messageType = 'audio';
      voiceObj = {
        id: `msgr-media-${Date.now()}`,
        url: attachment.payload?.url,
        mime_type: 'audio/mp4'
      };
    }

    const messageData = {
      type: 'message',
      messageId: messaging.message.mid,
      from: `messenger:${fromId}`,
      timestamp: Math.floor(messaging.timestamp / 1000),
      messageType: messageType,
      text: messaging.message.text || '',
      contactName: contactName,
      source: 'messenger',
      voice: voiceObj
    };

    logger.info('📩 Incoming Messenger message', {
      from: messageData.from,
      type: messageData.messageType,
    });

    // Process asynchronously if Redis is connected, else fallback to inline/sync processing
    let enqueued = false;
    try {
      const redisClient = redis.getRedis();
      if (redisClient && redisClient.status === 'ready') {
        await enqueueMessage(messageData);
        enqueued = true;
      }
    } catch (err) {
      logger.warn('Failed to enqueue Messenger message, falling back to synchronous processing', { error: err.message });
    }

    if (!enqueued) {
      const result = await processMessage(messageData);

      logger.info('Messenger Pipeline result (synchronous fallback)', {
        intent: result.intent,
        action: result.next_action,
        confidence: result.confidence,
        time: `${result.pipeline_time_ms}ms`,
      });

      realtime.emitNewMessage({
        direction: 'inbound',
        contactName: messageData.contactName || messageData.from,
        conversationId: result.conversation_id,
        intent: result.intent,
        confidence: result.confidence,
      });
    }
  } catch (err) {
    logger.error('Messenger Webhook processing error', { error: err.message });
  }
});

module.exports = router;
