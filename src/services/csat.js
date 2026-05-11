/**
 * Pro CRM — CSAT Service
 * Manages customer satisfaction surveys after resolution
 */
const { query } = require('../config/database');
const logger = require('../utils/logger');
// const whatsapp = require('./whatsapp'); // Mocked for now

async function sendCSATSurvey(conversationId, contactId, phone) {
  try {
    const surveyText = "Thank you for contacting us! How would you rate your experience today? (1-5)";
    
    // In a real app, we'd call the WhatsApp API here
    // await whatsapp.sendMessage(phone, surveyText);
    
    logger.info('CSAT Survey sent', { conversationId, contactId, phone });
    return true;
  } catch (err) {
    logger.error('Error sending CSAT survey', { error: err.message });
    return false;
  }
}

async function recordCSAT(conversationId, score, comment = '') {
  try {
    await query(
      "UPDATE conversations SET csat_score = $1, csat_comment = $2 WHERE id = $3",
      [score, comment, conversationId]
    );
    logger.info('CSAT recorded', { conversationId, score });
    return true;
  } catch (err) {
    logger.error('Error recording CSAT', { error: err.message });
    throw err;
  }
}

module.exports = {
  sendCSATSurvey,
  recordCSAT
};
