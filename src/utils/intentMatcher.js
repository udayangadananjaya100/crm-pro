/**
 * Pro CRM — Intent Matcher
 * Keyword-based intent classification with confidence scoring
 */
const { getRules } = require('./rulesLoader');
const { detectLanguage } = require('./languageDetector');
const logger = require('./logger');

/**
 * Match intent from message text using keyword rules
 */
function matchIntent(messageText) {
  const routing = getRules('intentRouting');
  if (!routing || !routing.intents) {
    logger.warn('Intent routing rules not loaded, defaulting to general');
    return { intent: 'general', confidence: 0.3, matched_keywords: [] };
  }

  const text = messageText.toLowerCase().trim();
  const lang = detectLanguage(messageText);

  // Check menu-based routing first (e.g., user replied "1", "2", etc.)
  if (routing.menu_routing?.enabled && routing.menu_routing.options[text]) {
    return {
      intent: routing.menu_routing.options[text],
      confidence: 0.95,
      matched_keywords: [`menu_option_${text}`],
      source: 'menu',
    };
  }

  let bestMatch = { intent: 'general', confidence: 0.3, matched_keywords: [], source: 'default' };

  for (const [intentName, intentConfig] of Object.entries(routing.intents)) {
    if (intentName === 'general' || intentName === 'unknown') continue;

    const allKeywords = [
      ...(intentConfig.keywords_en || []),
      ...(intentConfig.keywords_si || []),
      ...(intentConfig.keywords?.en || []),
      ...(intentConfig.keywords?.si || []),
    ];

    const matchedKeywords = allKeywords.filter((kw) => text.includes(kw.toLowerCase()));

    if (matchedKeywords.length > 0) {
      // Calculate confidence based on keyword match density
      const baseConfidence = 0.6;
      const boost = routing.intent_classification?.confidence_boost_on_keyword_match || 0.15;
      const confidence = Math.min(baseConfidence + matchedKeywords.length * boost, 0.95);

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          intent: intentName,
          confidence,
          matched_keywords: matchedKeywords,
          source: 'keyword',
        };
      }
    }
  }

  // Check sentiment modifiers for priority boosting
  const sentiment = checkSentiment(text, routing.sentiment_modifiers);

  return {
    ...bestMatch,
    language: lang.language,
    sentiment,
  };
}

/**
 * Check for sentiment indicators (anger, urgency)
 */
function checkSentiment(text, modifiers) {
  if (!modifiers) return { angry: false, urgent: false };

  const angryKeywords = [
    ...(modifiers.angry_keywords_en || []),
    ...(modifiers.angry_keywords_si || []),
  ];
  const urgentKeywords = [
    ...(modifiers.urgent_keywords_en || []),
    ...(modifiers.urgent_keywords_si || []),
  ];

  const angry = angryKeywords.some((kw) => text.includes(kw.toLowerCase()));
  const urgent = urgentKeywords.some((kw) => text.includes(kw.toLowerCase()));

  return { angry, urgent };
}

/**
 * Get auto-response for a detected intent
 */
function getAutoResponse(intent, language) {
  const routing = getRules('intentRouting');
  if (!routing?.intents?.[intent]) return null;

  const responses = routing.intents[intent].auto_responses;
  if (!responses) return null;

  return responses[language] || responses['en'] || null;
}

/**
 * Get assigned team for intent
 */
function getAssignedTeam(intent) {
  const routing = getRules('intentRouting');
  if (!routing?.intents?.[intent]) return 'general_pool';
  return routing.intents[intent].assigned_team || 'general_pool';
}

module.exports = { matchIntent, getAutoResponse, getAssignedTeam, analyzeSentiment: (text) => checkSentiment(text, getRules('intentRouting')?.sentiment_modifiers) };
