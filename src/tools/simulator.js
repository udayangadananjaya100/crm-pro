/**
 * Pro CRM — Webhook Simulator
 * Test the message processing pipeline without a real WhatsApp connection
 * 
 * Usage: node src/tools/simulator.js
 */
const readline = require('readline');
const { processMessage } = require('../pipeline/messagePipeline');
const { loadAllRules } = require('../utils/rulesLoader');
const logger = require('../utils/logger');

// Load rules
loadAllRules();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const SAMPLE_SENDER = '+94771234567';
let messageCount = 0;

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║       📱 Pro CRM — WhatsApp Simulator           ║');
console.log('║                                                  ║');
console.log('║  Type messages as if you are a WhatsApp user.    ║');
console.log('║  The AI pipeline will process each message.      ║');
console.log('║                                                  ║');
console.log('║  Commands:                                       ║');
console.log('║    /lang si   — Switch to Sinhala mode           ║');
console.log('║    /lang en   — Switch to English mode           ║');
console.log('║    /phone X   — Change sender phone              ║');
console.log('║    /quit      — Exit simulator                   ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

let currentLang = 'en';
let currentPhone = SAMPLE_SENDER;

function prompt() {
  const phoneSuffix = currentPhone.slice(-4);
  rl.question(`📱 [***${phoneSuffix}] > `, async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    // Handle commands
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(' ');
      switch (cmd) {
        case 'quit':
        case 'exit':
          console.log('\n👋 Goodbye!');
          process.exit(0);
          break;
        case 'lang':
          currentLang = args[0] || 'en';
          console.log(`🌐 Language set to: ${currentLang}`);
          break;
        case 'phone':
          currentPhone = args[0] || SAMPLE_SENDER;
          console.log(`📱 Phone set to: ***${currentPhone.slice(-4)}`);
          break;
        default:
          console.log(`❓ Unknown command: ${cmd}`);
      }
      prompt();
      return;
    }

    // Process through pipeline
    messageCount++;
    const messageData = {
      type: 'message',
      messageId: `sim_${Date.now()}_${messageCount}`,
      from: currentPhone,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      messageType: 'text',
      text: trimmed,
      contactName: 'Simulator User',
    };

    console.log('');
    console.log('⏳ Processing through pipeline...');
    console.log('─'.repeat(50));

    try {
      const result = await processMessage(messageData);

      console.log('');
      console.log('┌─────────────── PIPELINE RESULT ───────────────┐');
      console.log(`│ Intent:     ${result.intent.padEnd(36)}│`);
      console.log(`│ Confidence: ${(result.confidence * 100).toFixed(1).padEnd(36)}%│`);
      console.log(`│ Action:     ${result.next_action.padEnd(36)}│`);
      console.log(`│ Team:       ${result.assigned_team.padEnd(36)}│`);
      console.log(`│ Language:   ${(result.metadata?.language_detected || 'unknown').padEnd(36)}│`);
      console.log(`│ Flags:      ${(result.flags?.join(', ') || 'none').padEnd(36).slice(0, 36)}│`);
      console.log(`│ Time:       ${(result.pipeline_time_ms + 'ms').padEnd(36)}│`);
      console.log('├───────────────────────────────────────────────┤');

      if (result.reply_text) {
        console.log('│ 🤖 AI Reply:                                  │');
        // Word-wrap the reply
        const words = result.reply_text.split(' ');
        let line = '│   ';
        for (const word of words) {
          if (line.length + word.length > 46) {
            console.log(line.padEnd(48) + '│');
            line = '│   ' + word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line.trim().length > 1) {
          console.log(line.padEnd(48) + '│');
        }
      } else {
        console.log('│ 🤖 No reply generated                        │');
      }

      console.log('└───────────────────────────────────────────────┘');
      console.log('');
    } catch (err) {
      console.log(`❌ Pipeline error: ${err.message}`);
      console.log('');
    }

    prompt();
  });
}

prompt();
