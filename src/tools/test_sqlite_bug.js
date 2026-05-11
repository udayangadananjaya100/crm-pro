const { query, initSchema } = require('../config/sqlite');
const logger = require('../utils/logger');

async function test() {
  try {
    initSchema();
    console.log('Schema initialized');

    const conversationId = 'test-conv-id';
    const contactId = 'test-contact-id';
    const content = 'Hello world';
    const maskedContent = 'Hello world';
    const intent = 'greeting';
    const confidence = 0.95;
    const aiGenerated = 1;
    const templateName = null;

    console.log('Testing storeOutboundMessage style query...');
    const result = await query(
      `INSERT INTO messages (
        conversation_id, contact_id, direction, message_type,
        content, content_masked, status, intent, confidence,
        ai_generated, template_name, pii_detected
      ) VALUES ($1, $2, 'outbound', $3, $4, $5, 'sent', $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        conversationId,
        contactId,
        'text',
        content,
        maskedContent,
        intent,
        confidence,
        aiGenerated,
        templateName,
        false
      ]
    );

    console.log('Success:', result.rowCount, 'rows inserted');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

test();
