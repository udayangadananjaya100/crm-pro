/**
 * Pro CRM — Test/Dev Routes
 * Endpoints for testing the pipeline without real WhatsApp connection
 * Only available in development mode
 */
const express = require('express');
const router = express.Router();
const env = require('../config/environment');
const { processMessage } = require('../pipeline/messagePipeline');
const { sendTextMessage } = require('../services/whatsapp');
const realtime = require('../services/realtime');
const logger = require('../utils/logger');

// Guard: Only available in dev mode
router.use((req, res, next) => {
  if (!env.isDev) {
    return res.status(403).json({ error: 'Test routes disabled in production' });
  }
  next();
});

/**
 * POST /api/test/simulate
 * Simulate an incoming WhatsApp message
 * Body: { phone: "+94771234567", text: "Hello", name: "Test User" }
 */
router.post('/simulate', async (req, res) => {
  try {
    const { phone, text, name } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text field is required' });
    }

    const messageData = {
      type: 'message',
      messageId: `test_${Date.now()}`,
      from: phone || '+94771234567',
      timestamp: Math.floor(Date.now() / 1000).toString(),
      messageType: 'text',
      text: text,
      contactName: name || 'Test User',
    };

    logger.info('🧪 Test message simulation', { from: messageData.from.slice(-4), text: text.substring(0, 50), bypassRules: !!req.body.bypassRules });

    const result = await processMessage(messageData, { bypassRules: !!req.body.bypassRules });

    // Emit real-time events
    realtime.emitNewMessage({
      direction: 'inbound',
      contactName: messageData.contactName,
      conversationId: result.conversation_id,
      intent: result.intent,
      confidence: result.confidence,
    });

    res.json({
      success: true,
      simulation: true,
      bypass_applied: !!req.body.bypassRules,
      result,
    });
  } catch (err) {
    logger.error('Simulation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/test/send
 * Send a real WhatsApp message (for testing outbound)
 * Body: { phone: "+94771234567", text: "Hello from Pro CRM!" }
 */
router.post('/send', async (req, res) => {
  try {
    const { phone, text } = req.body;

    if (!phone || !text) {
      return res.status(400).json({ error: 'phone and text are required' });
    }

    const result = await sendTextMessage(phone, text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/test/pipeline-check
 * Quick pipeline health check — runs a dummy message through all agents
 */
router.get('/pipeline-check', async (req, res) => {
  try {
    const testMessage = {
      type: 'message',
      messageId: `healthcheck_${Date.now()}`,
      from: '+94770000000',
      timestamp: Math.floor(Date.now() / 1000).toString(),
      messageType: 'text',
      text: 'pipeline health check',
      contactName: 'Health Check Bot',
    };

    const start = Date.now();
    const result = await processMessage(testMessage);
    const duration = Date.now() - start;

    res.json({
      pipeline_healthy: true,
      duration_ms: duration,
      intent_detected: result.intent,
      action: result.next_action,
      confidence: result.confidence,
      flags: result.flags,
    });
  } catch (err) {
    res.json({
      pipeline_healthy: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/test/intents
 * Test intent detection for various sample messages
 */
router.get('/intents', (req, res) => {
  const { matchIntent } = require('../utils/intentMatcher');

  const testMessages = [
    'Hello',
    'I want to know the price',
    'මිල කීයද?',
    'I have a problem with my account',
    'උදව් කරන්න',
    'I need a refund',
    'stop',
    'නවත්වන්න',
    '1',
    '2',
    '3',
    'Tell me about your services',
    'This is terrible service! I want to speak to a manager!',
    'urgent help needed asap',
  ];

  const results = testMessages.map((msg) => ({
    message: msg,
    ...matchIntent(msg),
  }));

  res.json({ tests: results });
});

module.exports = router;
