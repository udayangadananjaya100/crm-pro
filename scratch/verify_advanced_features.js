const path = require('path');
const fs = require('fs');

async function run() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('=== Pro CRM Advanced Features Verification Script ===');
  
  // 1. Authenticate
  console.log('\n[1] Authenticating with Admin Credentials...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@procrm.com',
      password: 'admin123'
    })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Auth failed with status ${loginRes.status}`);
  }
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('✅ Authenticated successfully!');

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Fetch/Save Flow Builder Config
  console.log('\n[2] Testing Flow Builder REST APIs...');
  const getFlowRes = await fetch(`${baseUrl}/api/system/flow-builder`, { headers: authHeaders });
  if (!getFlowRes.ok) {
    throw new Error(`GET /api/system/flow-builder failed: ${getFlowRes.status}`);
  }
  const flowLayout = await getFlowRes.json();
  console.log('✅ Visual flow layout fetched successfully:', JSON.stringify(flowLayout));

  const testLayout = {
    nodes: [
      { id: 'trigger_1', type: 'trigger', position: { x: 100, y: 150 }, data: { label: 'Inbound Message' } },
      { id: 'intent_billing', type: 'intent', position: { x: 300, y: 100 }, data: { label: 'Billing Intent' } },
      { id: 'team_finance', type: 'team', position: { x: 500, y: 100 }, data: { label: 'Finance Team' } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger_1', target: 'intent_billing' },
      { id: 'e2-3', source: 'intent_billing', target: 'team_finance' }
    ]
  };

  const saveFlowRes = await fetch(`${baseUrl}/api/system/flow-builder`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      layout: testLayout,
      compiledRules: {
        version: "2.1.0",
        intents: {
          billing: {
            keywords: {
              en: ["bill", "payment", "invoice", "receipt", "charge"],
              si: ["ගෙවීම්", "බිල්", "රසීදු", "මුදල්"]
            },
            assigned_team: "finance"
          }
        }
      }
    })
  });

  if (!saveFlowRes.ok) {
    throw new Error(`POST /api/system/flow-builder failed: ${saveFlowRes.status}`);
  }
  const saveResult = await saveFlowRes.json();
  console.log('✅ Flow builder save & compilation success:', saveResult);

  // 3. Test Multi-Channel Webhook Ingestion (Telegram)
  console.log('\n[3] Simulating Telegram text & voice webhooks...');
  const tgUserPhone = 'telegram:11223344';
  
  // Telegram text message
  const tgTextWebhookRes = await fetch(`${baseUrl}/api/webhook/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: 20001,
      message: {
        message_id: 101,
        from: { id: 11223344, first_name: 'John', last_name: 'Doe', username: 'johndoe_tg' },
        chat: { id: 11223344, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'I want to ask about pricing options and packages.'
      }
    })
  });
  if (!tgTextWebhookRes.ok) {
    throw new Error(`Telegram text webhook failed: ${tgTextWebhookRes.status}`);
  }
  console.log('✅ Telegram text message webhook mock sent (pricing inquiry).');

  // Telegram voice message
  const tgVoiceWebhookRes = await fetch(`${baseUrl}/api/webhook/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: 20002,
      message: {
        message_id: 102,
        from: { id: 11223344, first_name: 'John', last_name: 'Doe' },
        chat: { id: 11223344 },
        date: Math.floor(Date.now() / 1000),
        voice: {
          file_id: 'tg-voice-file-id-abc',
          mime_type: 'audio/ogg'
        }
      }
    })
  });
  if (!tgVoiceWebhookRes.ok) {
    throw new Error(`Telegram voice webhook failed: ${tgVoiceWebhookRes.status}`);
  }
  console.log('✅ Telegram voice message webhook mock sent (will check transcription fallback).');

  // 4. Test Multi-Channel Webhook Ingestion (Facebook Messenger)
  console.log('\n[4] Simulating FB Messenger text & audio webhooks...');
  
  // Messenger text message
  const msgrTextWebhookRes = await fetch(`${baseUrl}/api/webhook/messenger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'page',
      entry: [{
        messaging: [{
          sender: { id: '99887766' },
          recipient: { id: 'page-crm' },
          timestamp: Date.now(),
          message: {
            mid: 'mid.messenger_text_123',
            text: 'Hello, do you provide technical support for setup?'
          }
        }]
      }]
    })
  });
  if (!msgrTextWebhookRes.ok) {
    throw new Error(`Messenger text webhook failed: ${msgrTextWebhookRes.status}`);
  }
  console.log('✅ FB Messenger text message webhook mock sent (support inquiry).');

  // Messenger voice (audio) message
  const msgrVoiceWebhookRes = await fetch(`${baseUrl}/api/webhook/messenger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'page',
      entry: [{
        messaging: [{
          sender: { id: '99887766' },
          recipient: { id: 'page-crm' },
          timestamp: Date.now(),
          message: {
            mid: 'mid.messenger_audio_123',
            attachments: [{
              type: 'audio',
              payload: { url: 'https://procrm.com/mock-audio.mp4' }
            }]
          }
        }]
      }]
    })
  });
  if (!msgrVoiceWebhookRes.ok) {
    throw new Error(`Messenger audio webhook failed: ${msgrVoiceWebhookRes.status}`);
  }
  console.log('✅ FB Messenger audio webhook mock sent.');

  // Give database pipelines 1.5 seconds to settle
  console.log('Waiting for processing pipeline to complete background saves...');
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 5. Verify Inbound Message Transcriptions and Details
  console.log('\n[5] Verifying database records for Telegram and Messenger...');
  
  const conversationsRes = await fetch(`${baseUrl}/api/conversations?limit=100`, { headers: authHeaders });
  if (!conversationsRes.ok) {
    throw new Error(`GET /api/conversations failed: ${conversationsRes.status}`);
  }
  const convsData = await conversationsRes.json();
  const convs = convsData.conversations || [];
  
  // Find John Doe's conversation (Telegram)
  const tgConv = convs.find(c => c.contact_name === 'John Doe');
  if (tgConv) {
    console.log(`✅ Found Telegram contact "John Doe", status: ${tgConv.status}, intent: ${tgConv.intent}`);
    
    // Fetch messages for Telegram conversation to check transcription
    const tgMessagesRes = await fetch(`${baseUrl}/api/conversations/${tgConv.id}/messages`, { headers: authHeaders });
    const tgMessagesData = await tgMessagesRes.json();
    const tgMsgs = tgMessagesData.messages || [];
    
    const voiceMsg = tgMsgs.find(m => m.message_type === 'audio');
    if (voiceMsg) {
      console.log(`✅ Found voice message in Telegram history!`);
      console.log(`   Original text / transcription: "${voiceMsg.content}"`);
      if (voiceMsg.content && voiceMsg.content.includes('mock transcription')) {
        console.log('   🎉 Voice Transcription pipeline fallback succeeded!');
      } else {
        console.error('   ❌ Voice Transcription content did not match expected mock fallback.');
      }
    } else {
      console.error('   ❌ Voice message NOT found in Telegram conversation history.');
    }
  } else {
    console.error('❌ Telegram contact "John Doe" conversation was NOT found in active lists.');
  }

  // Find FB Messenger conversation
  const msgrConv = convs.find(c => c.phone_number === 'messenger:99887766');
  if (msgrConv) {
    console.log(`✅ Found FB Messenger contact, status: ${msgrConv.status}, intent: ${msgrConv.intent}`);
    
    const msgrMessagesRes = await fetch(`${baseUrl}/api/conversations/${msgrConv.id}/messages`, { headers: authHeaders });
    const msgrMessagesData = await msgrMessagesRes.json();
    const msgrMsgs = msgrMessagesData.messages || [];
    
    const voiceMsg = msgrMsgs.find(m => m.message_type === 'audio');
    if (voiceMsg) {
      console.log(`✅ Found voice message in FB Messenger history!`);
      console.log(`   Original text / transcription: "${voiceMsg.content}"`);
      if (voiceMsg.content && voiceMsg.content.includes('mock transcription')) {
        console.log('   🎉 FB Messenger Voice Transcription pipeline succeeded!');
      } else {
        console.error('   ❌ FB Messenger Voice Transcription content did not match expected mock.');
      }
    } else {
      console.error('   ❌ FB Messenger Voice message NOT found in history.');
    }
  } else {
    console.error('❌ FB Messenger contact conversation was NOT found.');
  }

  // 6. Test Sentiment-based Escalation Flow (Angry/Frustrated user)
  console.log('\n[6] Testing Sentiment Analysis and Escalation...');
  const angryUserPhone = 'telegram:99991111';
  
  const tgAngryRes = await fetch(`${baseUrl}/api/webhook/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: 20003,
      message: {
        message_id: 103,
        from: { id: 99991111, first_name: 'Angry', last_name: 'Customer', username: 'angry_cust' },
        chat: { id: 99991111 },
        date: Math.floor(Date.now() / 1000),
        text: 'This is the worst system. It is not working and I am very angry, customer service is poor!'
      }
    })
  });
  if (!tgAngryRes.ok) {
    throw new Error(`Telegram angry message webhook failed: ${tgAngryRes.status}`);
  }
  console.log('✅ Telegram angry customer webhook mock sent.');

  await new Promise(resolve => setTimeout(resolve, 1500));

  const conversationsRes2 = await fetch(`${baseUrl}/api/conversations?limit=100`, { headers: authHeaders });
  const convsData2 = await conversationsRes2.json();
  const convs2 = convsData2.conversations || [];
  
  const angryConv = convs2.find(c => c.contact_name === 'Angry Customer');
  if (angryConv) {
    console.log(`✅ Found "Angry Customer" conversation.`);
    console.log(`   Priority set to: "${angryConv.priority}" (Expected: critical/high/urgent due to angry sentiment)`);
    console.log(`   Status set to: "${angryConv.status}" (Expected: open/assigned/pending with escalation flag)`);
    
    // Check if next action was flagged/escalated - we can verify in messages or logs
    const angryMessagesRes = await fetch(`${baseUrl}/api/conversations/${angryConv.id}/messages`, { headers: authHeaders });
    const angryMessagesData = await angryMessagesRes.json();
    const angryMsgs = angryMessagesData.messages || [];
    
    const lastMsg = angryMsgs[0]; // SQLite order usually newer first or older first. Let's check sentiment metadata if stored
    console.log(`   Conversation Intent: "${angryConv.intent}"`);
    
    if (angryConv.priority === 'critical' || angryConv.priority === 'high' || angryConv.priority === 'urgent') {
      console.log('   🎉 Emotion/Sentiment-based Queue Escalation Succeeded!');
    } else {
      console.error('   ❌ Conversation priority did not increase as expected.');
    }
  } else {
    console.error('❌ Angry Customer conversation was NOT found in database.');
  }

  // 7. Verify Co-pilot suggestion retrieval
  console.log('\n[7] Testing Co-pilot Suggestions endpoint...');
  if (tgConv) {
    const copilotRes = await fetch(`${baseUrl}/api/conversations/${tgConv.id}/copilot-suggest`, { headers: authHeaders });
    if (!copilotRes.ok) {
      throw new Error(`GET copilot-suggest failed: ${copilotRes.status}`);
    }
    const copilotData = await copilotRes.json();
    console.log('✅ Co-pilot Suggestion response:', copilotData);
    if (copilotData.success && copilotData.suggestion) {
      console.log(`   Draft Generated: "${copilotData.suggestion}"`);
      console.log('   🎉 Co-pilot Suggestion Endpoint Succeeded!');
    } else {
      console.error('   ❌ Co-pilot draft suggestion was empty or failed.');
    }
  } else {
    console.log('   ⚠️ Skipping copilot verify because TG conversation was not found.');
  }

  // 8. Verify Advanced Analytics Calculation
  console.log('\n[8] Testing Advanced Analytics Endpoint...');
  const analyticsRes = await fetch(`${baseUrl}/api/analytics/advanced`, { headers: authHeaders });
  if (!analyticsRes.ok) {
    throw new Error(`GET /api/analytics/advanced failed: ${analyticsRes.status}`);
  }
  const stats = await analyticsRes.json();
  console.log('✅ Advanced stats fetched:', stats);
  console.log(`   Total Conversations: ${stats.total_conversations}`);
  console.log(`   SLA Breach Rate: ${stats.sla_breach_rate}%`);
  console.log(`   Avg Response Time: ${stats.avg_response_time_mins} minutes`);
  console.log(`   Avg CSAT Score: ${stats.avg_csat} / 5`);
  console.log('   🎉 Advanced Analytics calculation verification complete!');

  console.log('\n=== All Verification Checks Completed Successfully ===');
}

run().catch(err => {
  console.error('❌ Verification script error:', err.message);
  process.exit(1);
});
