/**
 * Test Script: Vector Knowledge Engine
 * Verifies document indexing and semantic retrieval
 */
const { addDocument, findRelevantContext } = require('./src/services/knowledge');
const { initializeDatabase, close } = require('./src/config/database');
const logger = require('./src/utils/logger');

async function runTest() {
  logger.info('🚀 Starting Vector Brain Test...');

  try {
    await initializeDatabase();

    // 1. Add a test document
    logger.info('📝 Step 1: Indexing a test document...');
    const testContent = `
      Pro CRM Premium features include:
      - Advanced AI Vision: The system can analyze images and receipts sent by customers.
      - Multilingual Voice-to-Text: Supports Sinhala and English voice messages.
      - Automated Lead Nurturing: Uses lead scoring to send follow-up templates.
      - Whitelabel Dashboard: You can customize the logo and brand colors for your clients.
      
      Our pricing for the Premium plan is $99/month per instance.
      The Enterprise plan includes unlimited instances and dedicated support for $499/month.
    `;

    const result = await addDocument({
      title: 'Advanced Features Guide',
      content: testContent,
      type: 'manual_entry'
    });
    
    logger.info(`✅ Document indexed successfully. ID: ${result.docId}`);

    // 2. Perform semantic search
    logger.info('🔍 Step 2: Testing semantic search...');
    const query = 'how much is the premium plan and does it support voice?';
    logger.info(`Query: "${query}"`);

    const context = await findRelevantContext(query, 2);
    
    logger.info('📊 Retrieved Context:');
    console.log('--------------------------------------------------');
    console.log(context);
    console.log('--------------------------------------------------');

    if (context.includes('$99/month') && context.includes('voice messages')) {
      logger.info('🎉 SUCCESS: Semantic search found the correct information!');
    } else {
      logger.warn('⚠️ WARNING: Search results might be incomplete.');
    }

  } catch (err) {
    logger.error('💥 Test failed', { error: err.message, stack: err.stack });
  } finally {
    await close();
    process.exit(0);
  }
}

runTest();
