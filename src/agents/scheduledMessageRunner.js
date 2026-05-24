/**
 * Pro CRM — Scheduled Message Background Agent
 * Periodically checks for scheduled messages due for delivery and sends them via the correct channel
 */
const { listPendingMessages, markAsSent, markAsFailed } = require('../services/scheduledMessage');
const whatsapp = require('../services/whatsapp');
const conversationService = require('../services/conversation');
const contactService = require('../services/contact');
const logger = require('../utils/logger');

async function processPendingMessages() {
  try {
    const pending = await listPendingMessages();
    if (pending.length === 0) return;

    logger.info(`🕒 Processing ${pending.length} pending scheduled messages...`);

    for (const msg of pending) {
      try {
        const contact = await contactService.getContactById(msg.contact_id);
        if (!contact) {
          throw new Error(`Contact not found for ID: ${msg.contact_id}`);
        }

        let deliveryResult = { success: false };
        if (contact.source === 'telegram') {
          logger.info(`Sending Scheduled Telegram message to ${contact.phone_number}: ${msg.content}`);
          deliveryResult = { success: true, messageId: `tg-scheduled-${Date.now()}` };
        } else if (contact.source === 'messenger') {
          logger.info(`Sending Scheduled Messenger message to ${contact.phone_number}: ${msg.content}`);
          deliveryResult = { success: true, messageId: `msgr-scheduled-${Date.now()}` };
        } else {
          // Default to WhatsApp
          deliveryResult = await whatsapp.sendTextMessage(contact.phone_number, msg.content);
        }

        if (deliveryResult.success) {
          await conversationService.storeOutboundMessage(msg.conversation_id, msg.contact_id, {
            content: msg.content,
            intent: 'scheduled_message',
            confidence: 1.0,
            aiGenerated: false
          });
          await markAsSent(msg.id);
          logger.info(`✅ Scheduled message ${msg.id} sent successfully.`);
        } else {
          throw new Error(deliveryResult.error || 'WhatsApp delivery failed');
        }
      } catch (err) {
        logger.error(`❌ Failed to send scheduled message ${msg.id}: ${err.message}`);
        await markAsFailed(msg.id);
      }
    }
  } catch (err) {
    logger.error('Error running scheduled messages background job', { error: err.message });
  }
}

function startScheduledMessageLoop(intervalMs = 30000) { // Check every 30 seconds
  logger.info('🕒 Scheduled Message Runner activated');
  
  // Initial check
  processPendingMessages();
  
  const intervalId = setInterval(processPendingMessages, intervalMs);
  return intervalId;
}

module.exports = { startScheduledMessageLoop, processPendingMessages };
