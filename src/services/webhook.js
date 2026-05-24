/**
 * Pro CRM — Webhook Dispatcher Service
 * Delivers outbound webhooks to third-party integrations (Zapier, Make, etc.)
 */
const { query } = require('../config/database');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

async function listWebhooks() {
  const result = await query('SELECT * FROM webhooks WHERE is_active = true');
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
  const timestamp = Date.now();
  const body = JSON.stringify({ event, timestamp, data: payload });
  
  const headers = { 'Content-Type': 'application/json' };
  if (webhook.secret) {
    const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
    headers['X-ProCRM-Signature'] = signature;
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(webhook.target_url, body, { headers, timeout: 5000 });
      logger.info('Webhook delivered', { url: webhook.target_url, event, attempt });
      return; // Success, exit retry loop
    } catch (err) {
      logger.warn(`Webhook delivery attempt ${attempt} failed`, { url: webhook.target_url, error: err.message });
      if (attempt === maxRetries) {
        logger.error('Webhook delivery failed permanently after max retries', { url: webhook.target_url, event });
      } else {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
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

async function getAllWebhooks() {
  const result = await query('SELECT * FROM webhooks ORDER BY created_at DESC');
  return result.rows;
}

async function deleteWebhook(id) {
  await query('DELETE FROM webhooks WHERE id = $1', [id]);
  return true;
}

module.exports = {
  dispatchEvent,
  createWebhook,
  listWebhooks,
  getAllWebhooks,
  deleteWebhook
};
