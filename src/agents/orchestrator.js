/**
 * Pro CRM — Orchestrator Agent (Primary)
 * Central AI engine: intent detection, response generation, conversation management
 */
const { matchIntent, getAutoResponse, getAssignedTeam } = require('../utils/intentMatcher');
const { detectLanguage } = require('../utils/languageDetector');
const { getRules } = require('../utils/rulesLoader');
const { generateResponse } = require('../services/gemini');
const conversationService = require('../services/conversation');
const contactService = require('../services/contact');
const logger = require('../utils/logger');

/**
 * Main orchestrator processing
 */
async function process({ messageData, preFilterResult, options = {} }) {
  const startTime = Date.now();
  const flags = [...(preFilterResult.flags || [])];
  const aiOverrides = options.aiOverrides || {};

  logger.info('Orchestrator agent processing', {
    from: messageData.from?.slice(-4),
    action: preFilterResult.action,
  });

  const agentRules = getRules('agent');
  const confidenceThreshold = agentRules?.confidence_threshold?.auto_send || 0.7;

  // 1. Find or create contact
  const contact = preFilterResult.contact ||
    await contactService.findOrCreateContact(messageData.from, messageData.contactName, messageData.source || 'whatsapp');

  // 2. Handle opt-out
  if (preFilterResult.action === 'opt_out') {
    return await handleOptOut(contact, messageData);
  }

  // 3. Handle resubscribe
  if (flags.includes('resubscribe_attempt')) {
    return await handleResubscribe(contact, messageData);
  }

  // 4. Handle off-hours
  if (preFilterResult.action === 'off_hours_reply') {
    return await handleOffHours(contact, messageData);
  }

  // 5. Find or create conversation
  const conversation = await conversationService.findOrCreateConversation(contact.id);

  // 6. Store inbound message
  await conversationService.storeInboundMessage(conversation.id, contact.id, messageData);

  // 7. Detect language
  const lang = detectLanguage(messageData.text || '');

  // 8. Detect intent
  const intentResult = matchIntent(messageData.text || '');

  // AI Sentiment & Emotion Analysis
  let sentimentResult = { sentiment: 'neutral', confidence: 1.0 };
  if (messageData.text) {
    try {
      const { analyzeSentimentAI } = require('../services/gemini');
      sentimentResult = await analyzeSentimentAI(messageData.text);
      logger.info('🔮 AI Sentiment analyzed:', sentimentResult);
    } catch (e) {
      logger.error('Failed to analyze sentiment with Gemini:', e.message);
    }
  }

  // 9. Update lead score for new contacts
  if (flags.includes('new_contact')) {
    await contactService.updateLeadScore(contact.id, 10);
  }

  // 10. Generate AI response
  let replyText = '';
  let confidence = intentResult.confidence;
  let aiSuccess = true;
  let modelUsed = 'keyword_matching';

  // If high confidence keyword match, use auto-response
  if (intentResult.confidence >= 0.9 && intentResult.source === 'keyword') {
    replyText = getAutoResponse(intentResult.intent, lang.language) || '';
  }

  // If no auto-response or need AI enhancement, use Gemini
  if (!replyText) {
    modelUsed = aiOverrides.model || agentRules?.ai_config?.model || "gemini-1.5-flash";
    const history = await conversationService.getConversationHistory(conversation.id, 10);
    
    // Check for media (Image or Audio Analysis)
    let mediaData = null;
    const mediaObj = messageData.image || messageData.document || messageData.audio || messageData.voice;
    const isImage = messageData.messageType === 'image' || (mediaObj && messageData.mimeType?.startsWith('image/'));
    const isAudio = messageData.messageType === 'audio' || messageData.messageType === 'voice' || (mediaObj && messageData.mimeType?.startsWith('audio/'));

    if (mediaObj && mediaObj.id && (isImage || isAudio)) {
      try {
        const { downloadMedia } = require('../services/whatsapp');
        const buffer = await downloadMedia(mediaObj.id);
        mediaData = { 
          buffer, 
          mimeType: messageData.mimeType || (isAudio ? 'audio/ogg; codecs=opus' : 'image/jpeg') 
        };
        flags.push(isAudio ? 'voice_analysis' : 'image_analysis');
        logger.info(`📸/🎙️ Media (${messageData.messageType}) detected and downloaded for AI analysis`, { mediaId: mediaObj.id });
      } catch (err) {
        logger.error('Failed to download media for analysis', { mediaId: mediaObj.id, error: err.message });
      }
    }

    const aiResult = await generateResponse({
      messageText: messageData.text,
      conversationHistory: history,
      intent: intentResult.intent,
      language: lang.language,
      contactName: contact.display_name,
      mediaData: mediaData,
      context: {
        contactId: contact.id,
        contactPhone: contact.phone_number,
      },
      aiOverrides: aiOverrides
    });

    if (aiResult.success) {
      replyText = aiResult.reply;
    } else {
      aiSuccess = false;
      flags.push('ai_error');
      logger.error('AI generation failed in orchestrator');
      if (lang.language === 'si' || lang.language === 'mixed') {
        replyText = 'අපගේ AI සහකාර සේවාව තාවකාලිකව ක්‍රියාවිරහිත වී ඇත. ඔබව අපගේ පාරිභෝගික සහාය නියෝජිතයෙකු වෙත යොමු කෙරේ. කරුණාකර මොහොතක් රැඳී සිටින්න.';
      } else {
        replyText = 'Our AI assistant is temporarily unavailable. We are connecting you to a human agent immediately. Please wait a moment.';
      }
    }
  }

  // 11. Handle first-contact greeting
  if (flags.includes('new_contact') && intentResult.intent === 'greeting') {
    const greetings = agentRules?.greeting_flows?.first_contact;
    if (greetings) {
      replyText = greetings[lang.language] || greetings['en'] || replyText;
    }
  }

  // 12. Apply confidence flags
  if (confidence < confidenceThreshold) {
    flags.push('low_confidence');
  }

  // 13. Dynamic Lead Scoring
  let scoreAdjustment = 0;
  
  // Scoring based on defined intents in intent-routing.json
  const intentWeights = {
    'sales': 25,
    'support': 5,
    'billing': 10,
    'feedback': 15,
    'greeting': 2
  };
  scoreAdjustment += intentWeights[intentResult.intent] || 0;

  // Scoring based on sentiment & confidence
  if (intentResult.sentiment?.urgent) scoreAdjustment += 10;
  if (intentResult.sentiment?.angry) scoreAdjustment -= 15;
  if (intentResult.confidence > 0.85) scoreAdjustment += 5;

  if (scoreAdjustment !== 0) {
    await contactService.updateLeadScore(contact.id, scoreAdjustment);
    logger.debug('Lead score adjusted', { contact: contact.id, adjustment: scoreAdjustment, intent: intentResult.intent });
  }

  // 14. Check flags for labels and update conversation priority
  const isAngry = intentResult.sentiment?.angry || sentimentResult.sentiment === 'angry' || sentimentResult.sentiment === 'frustrated';
  const isUrgent = intentResult.sentiment?.urgent || sentimentResult.sentiment === 'urgent';

  if (isAngry) {
    if (!flags.includes('angry_customer')) flags.push('angry_customer');
    await conversationService.updateConversationPriority(conversation.id, 'critical');
  } else if (isUrgent) {
    if (!flags.includes('urgent_request')) flags.push('urgent_request');
    await conversationService.updateConversationPriority(conversation.id, 'urgent');
  }

  // 14. Determine next action
  let nextAction = 'auto_send';
  let requiresHumanReview = false;

  if (!aiSuccess) {
    nextAction = 'human_queue';
    requiresHumanReview = true;
  } else if (isAngry || isUrgent) {
    // Escalate to human queue immediately on angry/urgent emotion
    nextAction = 'human_queue';
    requiresHumanReview = true;
  } else if (confidence < (agentRules?.confidence_threshold?.human_review || 0.5)) {
    nextAction = 'human_queue';
    requiresHumanReview = true;
  } else if (confidence < confidenceThreshold) {
    requiresHumanReview = true;
  }

  // Check conversational window
  const withinWindow = !conversation._was_outside_window;
  if (!withinWindow) {
    flags.push('outside_24h_window');
    if (nextAction === 'auto_send') {
      nextAction = 'template_required';
    }
  }

  const assignedTeam = getAssignedTeam(intentResult.intent);

  return {
    reply_text: replyText,
    intent: intentResult.intent,
    confidence,
    next_action: nextAction,
    assigned_team: assignedTeam,
    flags,
    metadata: {
      rule_version: agentRules?.version || '2.1.0',
      language_detected: lang.language,
      requires_human_review: requiresHumanReview,
      matched_keywords: intentResult.matched_keywords || [],
      sentiment: sentimentResult.sentiment || (intentResult.sentiment?.angry ? 'angry' : intentResult.sentiment?.urgent ? 'urgent' : 'neutral'),
      ai_success: aiSuccess,
      model_used: modelUsed,
    },
    // Internal context (not sent to WhatsApp)
    _context: {
      contact,
      conversation,
      response_time_ms: Date.now() - startTime,
    },
  };
}

/**
 * Handle opt-out flow
 */
async function handleOptOut(contact, messageData) {
  const compliance = getRules('compliance');
  const lang = detectLanguage(messageData.text || '');
  let conversation = null;

  // Store the inbound message before processing opt-out
  if (contact) {
    conversation = await conversationService.findOrCreateConversation(contact.id);
    await conversationService.storeInboundMessage(conversation.id, contact.id, messageData);
    await contactService.optOutContact(contact.id, messageData.text);
  }

  const confirmMessage =
    lang.language === 'si'
      ? compliance?.opt_out?.confirmation_si
      : compliance?.opt_out?.confirmation_en;

  return {
    reply_text: confirmMessage || '✅ You have been unsubscribed.',
    intent: 'opt_out',
    confidence: 1.0,
    next_action: 'auto_send',
    assigned_team: 'general_pool',
    flags: ['opt_out_attempt'],
    metadata: {
      rule_version: '2.1.0',
      language_detected: lang.language,
      requires_human_review: false,
    },
    _context: { contact, conversation },
  };
}

/**
 * Handle resubscribe flow
 */
async function handleResubscribe(contact, messageData) {
  const lang = detectLanguage(messageData.text || '');
  let conversation = null;

  if (contact) {
    conversation = await conversationService.findOrCreateConversation(contact.id);
    await conversationService.storeInboundMessage(conversation.id, contact.id, messageData);
    await contactService.optInContact(contact.id, messageData.text);
  }

  const replyText =
    lang.language === 'si'
      ? '✅ ඔබ සාර්ථකව නැවත දායක වී ඇත! අපට කෙසේ උදව් කළ හැකිද?'
      : '✅ Welcome back! You\'ve been re-subscribed. How can we help you?';

  return {
    reply_text: replyText,
    intent: 'resubscribe',
    confidence: 1.0,
    next_action: 'auto_send',
    assigned_team: 'general_pool',
    flags: ['resubscribe_attempt'],
    metadata: {
      rule_version: '2.1.0',
      language_detected: lang.language,
      requires_human_review: false,
    },
    _context: { contact, conversation },
  };
}

/**
 * Handle off-hours message
 */
async function handleOffHours(contact, messageData) {
  const lang = detectLanguage(messageData.text || '');

  // Store the inbound message so it's not lost
  let conversation = null;
  if (contact) {
    conversation = await conversationService.findOrCreateConversation(contact.id);
    await conversationService.storeInboundMessage(conversation.id, contact.id, messageData);
  }

  return {
    reply_text: '[Automated Template: off_hours_auto_reply]',
    intent: 'general',
    confidence: 1.0,
    next_action: 'template_required',
    assigned_team: 'general_pool',
    flags: ['off_hours'],
    metadata: {
      rule_version: '2.1.0',
      language_detected: lang.language,
      requires_human_review: false,
      template_name: 'off_hours_auto_reply',
    },
    _context: { contact, conversation },
  };
}

module.exports = { process };
