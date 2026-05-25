/**
 * Pro CRM — Gemini AI Service
 * AI-powered response generation with Vision and Autonomous Action Agents
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/environment');
const { getRules } = require('../utils/rulesLoader');
const { getSetting } = require('../utils/settings');
const logger = require('../utils/logger');

let currentApiKey = null;
let genAI = null;

/**
 * Tool definitions for Autonomous Agents
 */
const tools = [
  {
    functionDeclarations: [
      {
        name: "book_appointment",
        description: "Books an appointment for a customer on a specific date and time.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "The date of the appointment (YYYY-MM-DD)" },
            time: { type: "STRING", description: "The time of the appointment (HH:MM)" },
            reason: { type: "STRING", description: "The reason for the appointment" },
          },
          required: ["date", "time"]
        }
      },
      {
        name: "check_availability",
        description: "Checks if a specific date and time slot is available for an appointment.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "The date to check (YYYY-MM-DD)" },
            time: { type: "STRING", description: "The time to check (HH:MM)" },
          },
          required: ["date", "time"]
        }
      }
    ]
  }
];

/**
 * Initialize Gemini client with dynamic API key
 */
async function getGenAI() {
  const apiKey = await getSetting('GEMINI_API_KEY', 'GEMINI_API_KEY');
  if (!apiKey || apiKey.startsWith('AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c') || apiKey === 'placeholder') {
    logger.warn('Gemini API key not set or placeholder — AI responses disabled/mocked');
    return null;
  }

  if (apiKey !== currentApiKey || !genAI) {
    currentApiKey = apiKey;
    genAI = new GoogleGenerativeAI(apiKey);
    logger.info('✅ Gemini AI Engine Initialized');
  }
  return genAI;
}


/**
 * Helper to retrieve Gemini Model instance
 */
async function getModel(modelName, options = {}) {
  const genAIClient = await getGenAI();
  if (!genAIClient) {
    throw new Error('Gemini API key is not configured');
  }
  return genAIClient.getGenerativeModel({ model: modelName, ...options });
}

/**
 * Public helper to retrieve Gemini Model instance (returns null if not configured instead of throwing)
 */
async function getGenerativeModel(modelName = 'gemini-1.5-flash', options = {}) {
  const genAIClient = await getGenAI();
  if (!genAIClient) {
    return null;
  }
  return genAIClient.getGenerativeModel({ model: modelName, ...options });
}

/**
 * Generate AI Response with optional image analysis (Vision) and Function Calling
 */
/**
 * Generate a high quality mock response for dev mode when Gemini API key is missing/invalid
 */
function getMockResponse(messageText, intent, language, contactName, aiOverrides) {
  const isSinhala = language === 'si' || (messageText && /[\u0d80-\u0dff]/.test(messageText));
  
  if (messageText) {
    const wordCountMatch = messageText.match(/exactly\s+(\d+)\s+words/i) || messageText.match(/වචන\s+(\d+)(කින්)?/i);
    if (wordCountMatch) {
      const count = parseInt(wordCountMatch[1], 10);
      if (count > 0) {
        const words = isSinhala 
          ? ["මෙය", "සිමියුලේටර්", "ක්‍රමයේ", "සුභ", "පැතුම්", "පිළිතුරක්", "වේ", "ඔබට", "සහය", "වීමට", "සතුටුයි"]
          : ["This", "is", "a", "mock", "response", "generated", "by", "simulator", "for", "testing", "purposes"];
        return words.slice(0, count).join(' ');
      }
    }
  }

  if (intent === 'greeting') {
    return isSinhala 
      ? `ආයුබෝවන් ${contactName || ''}! Pro CRM වෙත සාදරයෙන් පිළිගනිමු. අද ඔබට කෙසේ උදව් කළ හැකිද?`
      : `Hello ${contactName || ''}! Welcome to Pro CRM. How can I assist you today?`;
  }
  if (intent === 'pricing') {
    return isSinhala
      ? "Pro CRM පැකේජ මසකට රු. 5,000 සිට ආරම්භ වේ. වැඩි විස්තර සඳහා අපගේ අලෙවි අංශය හා සම්බන්ධ වන්න."
      : "Pro CRM plans start at LKR 5,000 per month. Please contact our sales team for detailed pricing.";
  }
  if (intent === 'support') {
    return isSinhala
      ? "ඔබගේ ගැටළුව අප වෙත ලැබුණි. තාක්ෂණික සහාය නියෝජිතයෙකු කෙටි වේලාවකින් ඔබ හා සම්බන්ධ වනු ඇත."
      : "We have received your support request. A technical agent will contact you shortly.";
  }
  if (intent === 'sales') {
    return isSinhala
      ? "Pro CRM මිලදී ගැනීම පිළිබඳව උනන්දු වීම ගැන ස්තුතියි. අපගේ නියෝජිතයෙකු ඉක්මනින්ම ඔබ අමතනු ඇත."
      : "Thank you for your interest in Pro CRM. A sales representative will contact you shortly.";
  }
  if (intent === 'billing') {
    return isSinhala
      ? "බිල්පත් සම්බන්ධ ගැටළුවක්ද? අපගේ මුදල් අංශය මෙය පරීක්ෂා කරමින් පවතී."
      : "Billing issue? Our finance team is reviewing this and will update you shortly.";
  }
  
  if (isSinhala) {
    return "මෙය සිමියුලේටරයෙන් ලබාදෙන ස්වයංක්‍රීය පිළිතුරකි. ඔබගේ පණිවිඩය: " + (messageText || "");
  }
  return "This is a simulated AI response for: " + (messageText || "hello");
}

async function generateResponse({ messageText, conversationHistory, intent, language, contactName, mediaData = null, context = {}, aiOverrides = {} }) {
  if (aiOverrides.forceFailure) {
    logger.error('Forced AI Outage Failure triggered via aiOverrides');
    return { success: false, error: 'Forced AI Service Outage for testing', reply: null };
  }
  try {
    const agentRules = getRules('agent');
    const aiConfig = agentRules?.ai_config || {};
    const modelName = aiOverrides.model || aiConfig.model || "gemini-1.5-flash";

    const generationConfig = {};
    if (aiOverrides.temperature !== undefined) {
      generationConfig.temperature = parseFloat(aiOverrides.temperature);
    } else if (aiConfig.temperature !== undefined) {
      generationConfig.temperature = parseFloat(aiConfig.temperature);
    }

    // 1. Fetch relevant knowledge from the vector engine
    const { findRelevantContext } = require('./knowledge');
    const dynamicContext = await findRelevantContext(messageText || (mediaData ? 'Analyze image' : ''), 3);

    // Fetch active products/services for marketing
    let activeProductsText = '';
    try {
      const productService = require('./product');
      const products = await productService.listProducts();
      const activeProducts = products.filter(p => p.is_active === 1 || p.is_active === true);
      if (activeProducts.length > 0) {
        activeProductsText = activeProducts.map(p => `- Name: ${p.name}\n  Price: ${p.price ? `$${p.price}` : 'Price on request'}\n  Description: ${p.description || 'No description available.'}`).join('\n');
      }
    } catch (productErr) {
      logger.error('Failed to load active products for prompt context', productErr);
    }

    // 2. Build system context
    const toneGuidelines = agentRules?.tone_guidelines || {};
    const baseSystemPrompt = aiOverrides.systemPrompt || buildSystemPrompt(aiConfig, toneGuidelines, intent, language, contactName, dynamicContext, activeProductsText);

    // 3. Define fallback chain of models to try
    const modelsToTry = [
      modelName,
      aiConfig.fallback_model,
      "gemini-1.5-flash",
      "gemini-pro"
    ].filter(Boolean);
    const uniqueModels = [...new Set(modelsToTry)];

    let result = null;
    let response = null;
    let finalModelUsed = modelName;
    let lastError = null;
    let activeChat = null;

    for (const modelToTry of uniqueModels) {
      try {
        logger.info(`🤖 Attempting response generation using model: ${modelToTry}`);
        const model = await getModel(modelToTry, { tools, generationConfig });
        
        // Add time context for the booking agent
        const systemInstruction = `${baseSystemPrompt}\n\nToday is ${new Date().toISOString().split('T')[0]}. Current time is ${new Date().toLocaleTimeString()}. 
        When booking appointments, always verify availability first if the user is unsure. 
        Customer ID: ${context.contactId || 'unknown'}.`;

        // Build chat with history (Ensure it starts with a 'user' message)
        let history = conversationHistory.slice(-10).map(msg => ({
          role: msg.direction === 'inbound' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));

        // Gemini requires the first message to be from 'user'
        while (history.length > 0 && history[0].role !== 'user') {
          history.shift();
        }

        const chat = model.startChat({
          history,
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemInstruction }]
          },
        });

        // Prepare message parts (text + image if available)
        const parts = [{ text: messageText || 'Analyze the attached media.' }];
        if (mediaData && mediaData.buffer) {
          parts.push({
            inlineData: {
              data: mediaData.buffer.toString('base64'),
              mimeType: mediaData.mimeType
            }
          });
          logger.info('📸 Including image data in Gemini request');
        }

        result = await chat.sendMessage(parts);
        response = result.response;
        finalModelUsed = modelToTry;
        activeChat = chat;
        lastError = null;
        break; // Success!
      } catch (err) {
        lastError = err;
        logger.warn(`Model ${modelToTry} generation failed: ${err.message}`);
        // If it's a API key auth error, don't try other models since they'll fail too
        if (err.message.includes('API_KEY_INVALID') || err.message.includes('API Key not found') || err.message.includes('API key') || err.message.includes('configured')) {
          break;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const candidate = response.candidates?.[0];
    let call = candidate?.content?.parts?.find(p => p.functionCall);

    if (call) {
      const toolName = call.functionCall.name;
      const toolArgs = call.functionCall.args;
      logger.info(`🤖 AI requesting tool call: ${toolName}`, toolArgs);

      let toolResult = { error: `Tool ${toolName} is not implemented or supported.` };
      if (toolName === 'book_appointment') {
        const bookingService = require('./booking');
        toolResult = await bookingService.bookAppointment({
          contactId: context.contactId,
          contactName: contactName,
          contactPhone: context.contactPhone,
          ...toolArgs
        });
      } else if (toolName === 'check_availability') {
        const bookingService = require('./booking');
        const available = await bookingService.isSlotAvailable(toolArgs.date, toolArgs.time);
        toolResult = { available, message: available ? 'This slot is free.' : 'This slot is already booked.' };
      }

      // Send tool result back to model
      // Use the model initialized for this run
      if (!activeChat) {
        throw new Error('No active chat session available for tool response execution');
      }

      result = await activeChat.sendMessage([{
        functionResponse: {
          name: toolName,
          response: toolResult
        }
      }]);
      response = result.response;
    }

    let responseText = '';
    try {
      responseText = response.text() || '';
    } catch (textErr) {
      logger.warn('Failed to extract text from response (possibly blocked)', { error: textErr.message });
      responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return {
      success: true,
      reply: responseText.trim(),
      model: finalModelUsed,
    };

  } catch (err) {
    if (env.isDev) {
      logger.warn(`⚠️ Dev mode fallback activated: AI call failed (${err.message}). Returning mock response.`);
      const mockReply = getMockResponse(messageText, intent, language, contactName, aiOverrides);
      return {
        success: true,
        reply: mockReply,
        model: 'dev-mock-model',
        mocked: true
      };
    }
    logger.error('Gemini AI generation failed', { error: err.message });
    return { success: false, error: err.message, reply: null };
  }
}

/**
 * Build system prompt from rules
 */
function buildSystemPrompt(aiConfig, toneGuidelines, intent, language, contactName, dynamicContext = '', activeProductsText = '') {
  const culturalNotes = toneGuidelines.cultural_sensitivity?.notes?.join('\n- ') || '';
  const kb = getRules('knowledge');
  
  let kbSection = '';
  if (kb) {
    kbSection = `
BUSINESS CONTEXT:
- Name: ${kb.business_profile?.name}
- Industry: ${kb.business_profile?.industry}
- Hours: ${kb.business_profile?.operating_hours}
- Description: ${kb.business_profile?.description}

FAQS & POLICIES:
${kb.faqs?.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}
- Refund Policy: ${kb.policies?.refund}
- Privacy Policy: ${kb.policies?.privacy}
`;
  }

  let productsSection = '';
  if (activeProductsText) {
    productsSection = `
ACTIVE PRODUCTS & SERVICES FOR MARKETING:
${activeProductsText}
- IMPORTANT: Proactively promote or suggest these products/services to the customer when relevant to their inquiries!
`;
  }

  let retrievedSection = '';
  if (dynamicContext) {
    retrievedSection = `
ADDITIONAL BUSINESS KNOWLEDGE (RETRIEVED):
${dynamicContext}
`;
  }

  return `${aiConfig.system_context || 'You are the AI assistant for Pro CRM.'}

${kbSection}
${productsSection}
${retrievedSection}

RULES:
- Respond in ${language === 'si' ? 'Sinhala (සිංහල)' : 'English'}
- Tone: ${toneGuidelines.style || 'professional_friendly'}
- Maximum ${toneGuidelines.max_emojis_per_message || 2} emojis per message
- Customer name: ${contactName || 'Customer'}
- Use the BUSINESS CONTEXT and ACTIVE PRODUCTS & SERVICES provided above to answer accurately
- EMOTIONAL INTELLIGENCE: Detect if the customer is angry, frustrated, or urgent. If they are angry, be extremely apologetic and professional.
- ESCALATION: If the customer expresses severe dissatisfaction or asks for a manager, acknowledge it and state that a human agent will follow up shortly.
- If an appointment is requested, use the booking tools. If date/time is missing, ask for it nicely.
- If an image or audio is provided, analyze it based on the business context.

CULTURAL GUIDELINES:
- ${culturalNotes}`;
}

/**
 * Generate a concise summary of a conversation transcript
 */
async function generateSummary(transcript) {
  try {
    const model = await getModel("gemini-1.5-flash");
    
    const prompt = `
    Analyze the following customer conversation transcript and provide a concise summary (max 100 words).
    Focus on:
    1. Primary intent/needs of the customer.
    2. Sentiment (happy, frustrated, etc.).
    3. Key mentioned items (products, prices, dates).
    4. Recommended next action.

    TRANSCRIPT:
    ${transcript}

    SUMMARY (Professional Tone):`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    if (env.isDev) {
      logger.warn(`⚠️ Dev mode fallback activated: Summary generation failed (${err.message}). Returning mock summary.`);
      return "Mock conversation summary: Customer contacted Pro CRM regarding sales inquiry. Sentiment is neutral.";
    }
    logger.error('Gemini summary generation failed', { error: err.message });
    throw err;
  }
}

/**
 * Transcribe audio message using Gemini 1.5
 */
async function transcribeAudio(audioBuffer, mimeType) {
  try {
    const model = await getModel('gemini-1.5-flash');
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: mimeType || 'audio/ogg'
        }
      },
      { text: "Please transcribe this audio message accurately. If it's in a different language, transcribe it in that language but provide an English translation in brackets." }
    ]);

    return result.response.text();
  } catch (err) {
    if (env.isDev) {
      logger.warn(`⚠️ Dev mode fallback activated: Audio transcription failed (${err.message}). Returning mock transcription.`);
      return "This is a mock transcription of the voice message. [මෙය හඬ පණිවිඩයේ ආදර්ශ පිටපතකි]";
    }
    logger.error('Error transcribing audio', { error: err.message });
    return null;
  }
}

/**
 * Analyze sentiment of a message using Gemini
 */
async function analyzeSentimentAI(messageText) {
  try {
    const model = await getModel('gemini-1.5-flash', {
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `
    Analyze the sentiment and emotion of the following customer message. 
    Classify it into one of these categories: "positive", "negative", "neutral", "angry", "frustrated", "urgent", or "satisfied".
    Also provide a confidence score between 0.0 and 1.0.

    Respond STRICTLY in JSON format with keys: "sentiment" (string) and "confidence" (number).

    MESSAGE: "${messageText}"
    JSON:`;

    const result = await model.generateContent(prompt);
    const jsonText = result.response.text().trim();
    return JSON.parse(jsonText);
  } catch (err) {
    if (env.isDev) {
      logger.warn(`⚠️ Dev mode fallback: Sentiment analysis failed (${err.message}). Mocking.`);
      // Mock logic: detect keywords
      let sentiment = 'neutral';
      const text = (messageText || '').toLowerCase();
      if (text.includes('bad') || text.includes('poor') || text.includes('worst') || text.includes('not working') || text.includes('aul') || text.includes('hari na')) {
        sentiment = 'negative';
      } else if (text.includes('angry') || text.includes('dushata') || text.includes('modaya') || text.includes('කේන්ති')) {
        sentiment = 'angry';
      } else if (text.includes('urgent') || text.includes('ikman') || text.includes('ikmanata') || text.includes('asap') || text.includes('ඉක්මනින්')) {
        sentiment = 'urgent';
      } else if (text.includes('good') || text.includes('great') || text.includes('nice') || text.includes('thank') || text.includes('supiri') || text.includes('elakiri') || text.includes('ස්තූතියි')) {
        sentiment = 'positive';
      }
      return { sentiment, confidence: 0.9 };
    }
    logger.error('Error analyzing sentiment', { error: err.message });
    return { sentiment: 'neutral', confidence: 0.5 };
  }
}

/**
 * Generate a co-pilot response suggestion draft based on conversation history and knowledge context
 */
async function generateCopilotSuggestion({ conversationHistory, contextText, contactName }) {
  try {
    const genAIClient = await getGenAI();
    if (!genAIClient) {
      // Mock suggestion if Gemini API key is missing
      const isSinhala = conversationHistory.some(m => m.content && /[\u0d80-\u0dff]/.test(m.content));
      return isSinhala 
        ? `ආයුබෝවන් ${contactName || 'ගනුදෙනුකරු'}! අපගේ පද්ධතියට අනුව ඔබගේ ප්‍රශ්නයට පිළිතුර: [සිමියුලේටර් මඟින් උත්පාදනය කරන ලදි]. ඔබට වෙනත් සහයක් අවශ්‍යද?`
        : `Hello ${contactName || 'Customer'}! Based on our records, here is the suggested info: [Mock Co-pilot Draft Response]. How else can I help you today?`;
    }

    const model = genAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Map conversation history to simple readable log
    const historyLog = conversationHistory.map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n');

    const prompt = `You are an expert AI Co-pilot for a customer support agent. 
Based on the conversation history and the provided knowledge base context, draft a helpful, professional, and concise response to the customer. 
Ensure the response directly addresses the customer's last query.
Use the same language as the customer's messages (e.g. Sinhala, English, or mixed Singlish).

Customer Name: ${contactName || 'Customer'}

Conversation History:
${historyLog}

Knowledge Base Context:
${contextText}

Draft Response (Write only the response text, no greetings like "Co-pilot:" or metadata):`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6 }
    });

    const response = result.response;
    return response.text()?.trim() || '';
  } catch (err) {
    logger.error('Error generating copilot suggestion', { error: err.message });
    return `Hello! How can we assist you today? (Failed to generate AI suggestion)`;
  }
}

/**
 * Generate a flow builder intents routing JSON block based on user prompt
 */
async function generateFlowBuilderRules(userPrompt) {
  try {
    const genAIClient = await getGenAI();
    if (!genAIClient) {
      throw new Error('Gemini API key is not configured. Cannot auto-generate flow.');
    }

    const model = genAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `You are an AI assistant helping to build a WhatsApp CRM routing flow.
Based on the following business description, generate a JSON object representing the routing intents.
You must output ONLY valid JSON without Markdown blocks or any extra text.

The JSON schema must be an object with an "intents" property. Inside "intents", each key is an intent_id (e.g., "sales_inquiry", "support_issue").
Each intent object must have:
- keywords_en: array of english keywords
- keywords_si: array of sinhala (සිංහල) keywords
- auto_responses: object with "en" and "si" text responses acknowledging the intent
- assigned_team: string, must be EXACTLY ONE of: "sales", "support", "finance", "general_pool"
- priority: string, must be ONE of: "low", "medium", "high"

Business Description:
${userPrompt}

Example Output Format:
{
  "intents": {
    "pricing_query": {
      "keywords_en": ["price", "cost", "how much"],
      "keywords_si": ["මිල", "කීයද"],
      "auto_responses": {
        "en": "Let me transfer you to our sales team for pricing details.",
        "si": "මිල ගණන් සඳහා මම ඔබව විකුණුම් අංශයට සම්බන්ධ කරන්නම්."
      },
      "assigned_team": "sales",
      "priority": "low"
    }
  }
}

Generate the JSON now:`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    });

    let rawOutput = result.response.text()?.trim() || '';
    // Strip markdown formatting if AI still includes it
    if (rawOutput.startsWith('\`\`\`json')) {
      rawOutput = rawOutput.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    }
    
    return JSON.parse(rawOutput);
  } catch (err) {
    logger.error('Error generating flow builder rules', { error: err.message });
    throw err;
  }
}

/**
 * Generate a flow builder routing JSON block strictly based on the provided Knowledge Base documents.
 */
async function generateFlowFromKnowledge(kbDocsSummary) {
  try {
    const genAIClient = await getGenAI();
    if (!genAIClient) {
      throw new Error('Gemini API key is not configured. Cannot auto-generate flow.');
    }

    const model = genAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `You are an AI assistant helping to build a WhatsApp CRM routing flow based strictly on the user's Knowledge Base.
Based on the following summary of uploaded documents and packages, generate a JSON object representing the routing intents.
You must output ONLY valid JSON without Markdown blocks or any extra text.

The JSON schema must be an object with an "intents" property. Inside "intents", each key is an intent_id (e.g., "package_maldives", "refund_policy").
For each Package/Product listed, create an intent that routes to "sales".
For each Policy/SOP that a customer might ask about, create an intent that routes to "support" or "general_pool".

Each intent object must have:
- keywords_en: array of english keywords related to the package/policy
- keywords_si: array of sinhala (සිංහල) keywords related to the package/policy
- auto_responses: object with "en" and "si" text responses acknowledging the specific package/policy inquiry
- assigned_team: string, must be EXACTLY ONE of: "sales", "support", "finance", "general_pool"
- priority: string, must be ONE of: "low", "medium", "high"

Knowledge Base Summary:
${kbDocsSummary}

Generate the JSON now:`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5 }
    });

    let rawOutput = result.response.text()?.trim() || '';
    if (rawOutput.startsWith('\`\`\`json')) {
      rawOutput = rawOutput.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    }
    
    return JSON.parse(rawOutput);
  } catch (err) {
    logger.error('Error generating flow from KB', { error: err.message });
    throw err;
  }
}

module.exports = {
  generateResponse,
  generateSummary,
  transcribeAudio,
  analyzeSentimentAI,
  generateCopilotSuggestion,
  generateFlowBuilderRules,
  generateFlowFromKnowledge,
  getGenerativeModel
};
