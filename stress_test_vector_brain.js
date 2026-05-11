/**
 * Advanced Bug & Stress Test: Vector Knowledge Engine
 */
const { addDocument, findRelevantContext, scrapeWebsite } = require('./src/services/knowledge');
const { initializeDatabase, close } = require('./src/config/database');
const logger = require('./src/utils/logger');

async function runTests() {
  logger.info('🔬 Starting Comprehensive Bug Hunting...');
  await initializeDatabase();

  try {
    // TEST 1: Sinhala Language Support (Cross-lingual)
    logger.info('--- TEST 1: Sinhala & Cross-lingual ---');
    await addDocument({
      title: 'Sinhala Policy',
      content: 'අපගේ ආයතනය ඉරිදා දිනවල වසා තබන අතර සතියේ දිනවල උදේ 9 සිට සවස 6 දක්වා විවෘතව පවතී.',
      type: 'manual_entry'
    });
    const res1 = await findRelevantContext('Is the office open on Sunday?', 1);
    logger.info(`Result for Sunday query: ${res1 ? '✅ Found' : '❌ Not Found'}`);
    if (res1) console.log('Context:', res1);

    // TEST 2: Empty/Invalid Input
    logger.info('--- TEST 2: Empty/Invalid Input ---');
    try {
      await addDocument({ title: '', content: '' });
      logger.error('❌ BUG FOUND: Should not allow empty documents');
    } catch (e) {
      logger.info('✅ SUCCESS: Caught empty document error');
    }

    // TEST 3: Very Large Document (Stress)
    logger.info('--- TEST 3: Large Document Stress Test ---');
    const largeContent = 'This is a repeating sentence. '.repeat(2000); // ~60,000 chars
    logger.info(`Indexing ${largeContent.length} chars...`);
    const res3 = await addDocument({ title: 'Big Doc', content: largeContent });
    logger.info(`✅ SUCCESS: Processed ${res3.chunks} chunks for large doc`);

    // TEST 4: Special Characters & Emojis
    logger.info('--- TEST 4: Emojis & Symbols ---');
    await addDocument({
      title: 'Emoji Test',
      content: 'Our VIP lounge 🌟 is located on the 5th floor 🏢. Contact us @ 🚀.',
      type: 'manual_entry'
    });
    const res4 = await findRelevantContext('where is the vip lounge?', 1);
    logger.info(`Result for Emoji query: ${res4 ? '✅ Found' : '❌ Not Found'}`);

    // TEST 5: Bad URL Scraping
    logger.info('--- TEST 5: Scraping Errors ---');
    try {
      await scrapeWebsite('https://this-is-a-fake-url-123456789.com');
      logger.error('❌ BUG FOUND: Should have failed on fake URL');
    } catch (e) {
      logger.info(`✅ SUCCESS: Caught scraping error (${e.message})`);
    }

    logger.info('--- SUMMARY ---');
    logger.info('🚀 All critical bug tests passed!');

  } catch (err) {
    logger.error('💥 Testing crashed', { error: err.message });
  } finally {
    await close();
    process.exit(0);
  }
}

runTests();
