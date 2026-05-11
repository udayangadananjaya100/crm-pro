/**
 * Pro CRM — Campaign Service
 * Handles AI-driven automated marketing campaigns
 */
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { generateResponse } = require('./gemini');
const { sendTextMessage } = require('./whatsapp');
const logger = require('../utils/logger');

/**
 * Create a new campaign
 */
async function createCampaign({ name, targetSegment, messageTemplate, aiEnhanced = true }) {
  const id = uuidv4();
  await query(
    `INSERT INTO campaigns (id, name, target_segment, message_template, ai_enhanced, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name, targetSegment, messageTemplate, aiEnhanced, 'draft']
  );
  return id;
}

/**
 * Execute a campaign
 */
async function executeCampaign(campaignId) {
  try {
    // 1. Get campaign details
    const campaignResult = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    const campaign = campaignResult.rows[0];
    if (!campaign) throw new Error('Campaign not found');

    // 2. Identify target contacts based on segment
    let contactQuery = "SELECT * FROM contacts WHERE status = 'active'";
    if (campaign.target_segment === 'hot_leads') {
      contactQuery += " AND lead_score >= 80";
    } else if (campaign.target_segment === 'warm_leads') {
      contactQuery += " AND lead_score >= 40 AND lead_score < 80";
    }

    const contactsResult = await query(contactQuery);
    const contacts = contactsResult.rows;

    logger.info(`Starting campaign: ${campaign.name}`, { recipients: contacts.length });

    // 3. Update campaign status
    await query('UPDATE campaigns SET status = $1, total_recipients = $2, last_sent_at = CURRENT_TIMESTAMP WHERE id = $3', 
      ['sending', contacts.length, campaignId]);

    // 4. Send personalized messages
    let sentCount = 0;
    for (const contact of contacts) {
      let personalizedMessage = campaign.message_template;

      if (campaign.ai_enhanced) {
        const aiResult = await generateResponse({
          messageText: `Write a personalized promotional message for ${contact.display_name} based on this template: "${campaign.message_template}". Keep it friendly and relevant to their interests.`,
          conversationHistory: [], // No history needed for blast
          intent: 'marketing',
          language: 'en', // Default, can be dynamic
          contactName: contact.display_name
        });
        if (aiResult.success) personalizedMessage = aiResult.reply;
      }

      const result = await sendTextMessage(contact.phone_number, personalizedMessage);
      
      // Log individual send
      await query(
        `INSERT INTO campaign_logs (id, campaign_id, contact_id, message_id, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), campaignId, contact.id, result.messageId || null, result.success ? 'sent' : 'failed']
      );

      if (result.success) sentCount++;
    }

    // 5. Mark campaign as completed
    await query('UPDATE campaigns SET status = $1, sent_count = $2 WHERE id = $3', 
      ['completed', sentCount, campaignId]);

    logger.info(`Campaign completed: ${campaign.name}`, { sent: sentCount });
    return { success: true, sentCount };

  } catch (err) {
    logger.error('Campaign execution failed', { error: err.message });
    await query('UPDATE campaigns SET status = $1 WHERE id = $2', ['failed', campaignId]);
    throw err;
  }
}

module.exports = {
  createCampaign,
  executeCampaign
};
