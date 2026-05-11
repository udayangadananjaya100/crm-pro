/**
 * Pro CRM — Webhook Dispatcher Service
 * Delivers outbound webhooks to third-party integrations (Zapier, Make, etc.)
 */
const { query } = require('../config/database');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

async function listWebhooks() {
  const result = await query('SELECT * FROM webhooks WHERE is_active = 1');
  return result.rows;
}

async function dispatchEvent(eventName, payload) {
  try {
    const webhooks = await listWebhooks();
    const subscribers = webhooks.filter(w => w.events.includes(eventName) || w.events.includes('*'));

    for (const webhook of subscribers) {
      sendWebhook(webhook, eventName, payload);
    }
  } catch (err) {
    logger.error('Webhook dispatch failed', { error: err.message });
  }
}

async function sendWebhook(webhook, event, payload) {
  try {
    const timestamp = Date.now();
    const body = JSON.stringify({ event, timestamp, data: payload });
    
    const headers = { 'Content-Type': 'application/json' };
    if (webhook.secret) {
      const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
      headers['X-ProCRM-Signature'] = signature;
    }

    await axios.post(webhook.target_url, body, { headers, timeout: 5000 });
    logger.info('Webhook delivered', { url: webhook.target_url, event });
  } catch (err) {
    logger.warn('Webhook delivery failed', { url: webhook.target_url, error: err.message });
  }
}

async function createWebhook({ targetUrl, events, secret }) {
  const id = crypto.randomUUID();
  await query(
    'INSERT INTO webhooks (id, target_url, events, secret) VALUES ($1, $2, $3, $4)',
    [id, targetUrl, Array.isArray(events) ? events.join(',') : events, secret]
  );
  return { id, targetUrl, events };
}

module.exports = {
  dispatchEvent,
  createWebhook
};
