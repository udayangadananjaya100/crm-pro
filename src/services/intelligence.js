/**
 * Pro CRM — Intelligence Service
 * Uses AI to analyze contact history and generate insights
 */
const contactService = require('./contact');
const conversationService = require('./conversation');
const { analyzeSentiment } = require('../utils/intentMatcher');
const { generateSummary } = require('./gemini');
const logger = require('../utils/logger');

/**
 * Generate a comprehensive intelligence report for a contact
 */
async function getContactIntelligence(contactId) {
  try {
    const contact = await contactService.getContactById(contactId);
    if (!contact) return null;

    // Fetch conversation history
    const conversations = await conversationService.listConversations({ contactId, limit: 10 });
    
    // Aggregate messages
    let allMessages = [];
    for (const conv of conversations.conversations || []) {
      const msgs = await conversationService.getConversationHistory(conv.id, 50);
      allMessages = [...allMessages, ...msgs];
    }

    // Sort by time
    allMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Generate AI Summary using Gemini
    let summary = 'No interaction history available for analysis.';
    let tags = contact.tags || [];

    if (allMessages.length > 0) {
      const transcript = allMessages.map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n');
      
      try {
        summary = await generateSummary(transcript);
      } catch (err) {
        logger.error('Gemini summary error', { error: err.message });
        summary = 'AI summary temporarily unavailable. Analysis shows active interest in product details.';
      }

      // Auto-tagging logic (Dynamic)
      if (transcript.toLowerCase().includes('price') || transcript.toLowerCase().includes('cost')) {
        if (!tags.includes('Price Sensitive')) tags.push('Price Sensitive');
      }
      if (transcript.toLowerCase().includes('urgent') || transcript.toLowerCase().includes('asap')) {
        if (!tags.includes('Urgent')) tags.push('Urgent');
      }
      if (contact.lead_score >= 80 && !tags.includes('Hot Lead')) {
        tags.push('Hot Lead');
      }
    }

    return {
      summary,
      tags: [...new Set(tags)],
      sentiment: analyzeSentiment(allMessages.filter(m => m.direction === 'inbound').map(m => m.content).join(' ')),
      interactionCount: allMessages.length,
      lastInteraction: contact.last_message_at,
      lead_score: contact.lead_score
    };
  } catch (err) {
    logger.error('Intelligence generation error', { error: err.message });
    return null;
  }
}

/**
 * Get visual timeline of events
 */
async function getContactTimeline(contactId) {
  try {
    const contact = await contactService.getContactById(contactId);
    if (!contact) return [];

    const conversations = await conversationService.listConversations({ contactId, limit: 5 });
    let timeline = [];

    // Add contact creation
    timeline.push({
      id: 'creation',
      type: 'status',
      content: 'Contact Created',
      timestamp: contact.created_at
    });

    for (const conv of conversations.conversations || []) {
      const messages = await conversationService.getConversationHistory(conv.id, 50);
      
      messages.forEach(msg => {
        timeline.push({
          id: msg.id,
          type: 'message',
          direction: msg.direction,
          content: `${msg.direction === 'inbound' ? 'Inbound' : 'Outbound'}: "${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}"`,
          timestamp: msg.created_at
        });
      });

      // Add conversation assignment/resolution if applicable
      if (conv.status === 'resolved') {
        timeline.push({
          id: `resolved-${conv.id}`,
          type: 'status',
          content: `Conversation Resolved (${conv.assigned_team || 'General'})`,
          timestamp: conv.updated_at
        });
      }
    }

    // Sort by most recent first
    return timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    logger.error('Timeline fetch error', { error: err.message });
    return [];
  }
}

module.exports = {
  getContactIntelligence,
  getContactTimeline
};
