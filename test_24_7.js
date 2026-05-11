const pipeline = require('./src/pipeline/messagePipeline');
const { loadAllRules } = require('./src/utils/rulesLoader');

async function test() {
  console.log('--- TESTING 24/7 AVAILABILITY ---');
  loadAllRules();
  
  const messageData = {
    from: '94771234567',
    text: 'Test message at midnight',
    messageType: 'text',
    contactName: 'Test User'
  };

  const result = await pipeline.processMessage(messageData, { bypassRules: false });
  console.log('RESULT ACTION:', result.next_action);
  console.log('FLAGS:', result.flags);
  console.log('REPLY:', result.reply_text);
  
  if (result.next_action === 'auto_send' && !result.flags.includes('off_hours')) {
    console.log('✅ SUCCESS: Bot is working 24/7!');
  } else {
    console.log('❌ FAILED: Bot still thinks it is off-hours.');
  }
}

test();
