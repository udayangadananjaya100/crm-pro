/**
 * Pro CRM — WhatsApp Cloud API Service
 * Handles sending messages via Meta Cloud API
 */
const axios = require('axios');
const env = require('../config/environment');
const { getSetting } = require('../utils/settings');
const logger = require('../utils/logger');

const META_BASE_URL = `https://graph.facebook.com/${env.META_API_VERSION}`;

/**
 * Get dynamic configuration for WhatsApp
 */
async function getConfig() {
  const token = await getSetting('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN');
  const phoneId = await getSetting('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PHONE_NUMBER_ID');
  
  if (!token || !phoneId) {
    logger.warn('WhatsApp configuration missing — message delivery may fail');
  }

  return { token, phoneId };
}

/**
 * Send a text message
 */
async function sendTextMessage(recipientPhone, text) {
  const config = await getConfig();
  if (!config.token || !config.phoneId) return { success: false, error: 'WhatsApp Config Missing' };

  try {
    const response = await axios.post(
      `${META_BASE_URL}/${config.phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('WhatsApp message sent', {
      to: recipientPhone.slice(-4),
      messageId: response.data?.messages?.[0]?.id,
    });

    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id,
      data: response.data,
    };
  } catch (err) {
    logger.error('Failed to send WhatsApp message', {
      error: err.response?.data || err.message,
      to: recipientPhone.slice(-4),
    });
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Send a template message (for outside 24h window)
 */
async function sendTemplateMessage(recipientPhone, templateName, language, components = []) {
  const config = await getConfig();
  if (!config.token || !config.phoneId) return { success: false, error: 'WhatsApp Config Missing' };

  try {
    const response = await axios.post(
      `${META_BASE_URL}/${config.phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language === 'si' ? 'si' : 'en' },
          components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Template message sent', {
      template: templateName,
      to: recipientPhone.slice(-4),
    });

    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id,
    };
  } catch (err) {
    logger.error('Failed to send template message', {
      error: err.response?.data || err.message,
      template: templateName,
    });
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Send interactive message with buttons
 */
async function sendInteractiveMessage(recipientPhone, body, buttons) {
  const config = await getConfig();
  if (!config.token || !config.phoneId) return { success: false, error: 'WhatsApp Config Missing' };

  try {
    const response = await axios.post(
      `${META_BASE_URL}/${config.phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.map((btn, i) => ({
              type: 'reply',
              reply: { id: `btn_${i}`, title: btn },
            })),
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true, messageId: response.data?.messages?.[0]?.id };
  } catch (err) {
    logger.error('Failed to send interactive message', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Mark message as read
 */
async function markAsRead(messageId) {
  const config = await getConfig();
  if (!config.token || !config.phoneId) return false;

  try {
    await axios.post(
      `${META_BASE_URL}/${config.phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return true;
  } catch (err) {
    logger.warn('Failed to mark as read', { messageId, error: err.message });
    return false;
  }
}

/**
 * Parse incoming webhook payload from Meta
 */
function parseWebhookPayload(body) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return null;

    // Status update (delivery receipts)
    if (value.statuses && value.statuses.length > 0) {
      const status = value.statuses[0];
      return {
        type: 'status',
        messageId: status.id,
        status: status.status,
        recipientId: status.recipient_id,
        timestamp: status.timestamp,
      };
    }

    // Incoming message
    if (value.messages && value.messages.length > 0) {
      const msg = value.messages[0];
      const contact = value.contacts?.[0];

      return {
        type: 'message',
        messageId: msg.id,
        from: msg.from,
        timestamp: msg.timestamp,
        messageType: msg.type,
        text: msg.text?.body || '',
        contactName: contact?.profile?.name || 'Unknown',
        // Media fields
        image: msg.image || null,
        document: msg.document || null,
        audio: msg.audio || null,
        video: msg.video || null,
        sticker: msg.sticker || null,
        // Interactive reply
        interactive: msg.interactive || null,
        button: msg.button || null,
      };
    }

    return null;
  } catch (err) {
    logger.error('Failed to parse webhook payload', { error: err.message });
    return null;
  }
}

/**
 * Download media from Meta Cloud API
 * @param {string} mediaId 
 * @returns {Promise<Buffer>}
 */
async function downloadMedia(mediaId) {
  const token = await getSetting('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN');
  if (!token) throw new Error('WhatsApp Access Token not configured');

  try {
    // 1. Get media URL
    const metaRes = await axios.get(`${META_BASE_URL}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const mediaUrl = metaRes.data.url;

    // 2. Download the actual content
    const response = await axios.get(mediaUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      responseType: 'arraybuffer'
    });

    return Buffer.from(response.data);
  } catch (err) {
    logger.error('Failed to download WhatsApp media', { mediaId, error: err.message });
    throw err;
  }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveMessage,
  markAsRead,
  parseWebhookPayload,
  downloadMedia,
  healthCheck: async () => {
    const config = await getConfig();
    if (!config.token || !config.phoneId) return { status: 'unconfigured' };
    
    try {
      // Small test call to Meta to verify token
      await axios.get(`${META_BASE_URL}/${config.phoneId}`, {
        headers: { Authorization: `Bearer ${config.token}` }
      });
      return { status: 'healthy' };
    } catch (err) {
      // If 400/401, it's unhealthy. If other, might be Meta down, but we report unhealthy for us.
      return { 
        status: 'unhealthy', 
        error: err.response?.data?.error?.message || err.message 
      };
    }
  }
};
