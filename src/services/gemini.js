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
  if (!apiKey) {
    logger.warn('Gemini API key not set — AI responses disabled');
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
 * Generate AI Response with optional image analysis (Vision) and Function Calling
 */
async function generateResponse({ messageText, conversationHistory, intent, language, contactName, mediaData = null, context = {} }) {
  try {
    const genAIClient = await getGenAI();
    if (!genAIClient) return { success: false, error: 'AI model not initialized' };

    const agentRules = getRules('agent');
    const aiConfig = agentRules?.ai_config || {};
    const modelName = aiConfig.model || "gemini-1.5-flash";

    const model = genAIClient.getGenerativeModel({ 
      model: modelName,
      tools: tools,
    });

    // 1. Fetch relevant knowledge from the vector engine
    const { findRelevantContext } = require('./knowledge');
    const dynamicContext = await findRelevantContext(messageText || (mediaData ? 'Analyze image' : ''), 3);

    // 2. Build system context
    const toneGuidelines = agentRules?.tone_guidelines || {};
    const baseSystemPrompt = buildSystemPrompt(aiConfig, toneGuidelines, intent, language, contactName, dynamicContext);
    
    // Add time context for the booking agent
    const systemInstruction = `${baseSystemPrompt}\n\nToday is ${new Date().toISOString().split('T')[0]}. Current time is ${new Date().toLocaleTimeString()}. 
    When booking appointments, always verify availability first if the user is unsure. 
    Customer ID: ${context.contactId || 'unknown'}.`;

    // 3. Build chat with history (Ensure it starts with a 'user' message)
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

    // 4. Prepare message parts (text + image if available)
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

    // 5. Generate response & handle tool calls
    let result = await chat.sendMessage(parts);
    let response = result.response;
    let call = response.candidates[0].content.parts.find(p => p.functionCall);

    if (call) {
      const toolName = call.functionCall.name;
      const toolArgs = call.functionCall.args;
      logger.info(`🤖 AI requesting tool call: ${toolName}`, toolArgs);

      let toolResult;
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
      result = await chat.sendMessage([{
        functionResponse: {
          name: toolName,
          response: toolResult
        }
      }]);
      response = result.response;
    }

    const responseText = response.text() || '';

    return {
      success: true,
      reply: responseText.trim(),
      model: modelName,
    };

  } catch (err) {
    logger.error('Gemini AI generation failed', { error: err.message });
    return { success: false, error: err.message, reply: null };
  }
}

/**
 * Build system prompt from rules
 */
function buildSystemPrompt(aiConfig, toneGuidelines, intent, language, contactName, dynamicContext = '') {
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

ADDITIONAL BUSINESS KNOWLEDGE (RETRIEVED):
${dynamicContext}
`;
  }

  return `${aiConfig.system_context || 'You are the AI assistant for Pro CRM.'}

${kbSection}

RULES:
- Respond in ${language === 'si' ? 'Sinhala (සිංහල)' : 'English'}
- Tone: ${toneGuidelines.style || 'professional_friendly'}
- Maximum ${toneGuidelines.max_emojis_per_message || 2} emojis per message
- Customer name: ${contactName || 'Customer'}
- Use the BUSINESS CONTEXT provided above to answer accurately
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
    const genAIClient = await getGenAI();
    if (!genAIClient) return 'Summary unavailable (API key missing)';

    const model = genAIClient.getGenerativeModel({ model: "gemini-1.5-flash" });
    
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
    logger.error('Gemini summary generation failed', { error: err.message });
    throw err;
  }
}

/**
 * Transcribe audio message using Gemini 1.5
 */
async function transcribeAudio(audioBuffer, mimeType) {
  try {
    const genAIClient = await getGenAI();
    if (!genAIClient) return null;

    const model = genAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
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
    logger.error('Error transcribing audio', { error: err.message });
    return null;
  }
}

module.exports = {
  generateResponse,
  generateSummary,
  transcribeAudio
};
