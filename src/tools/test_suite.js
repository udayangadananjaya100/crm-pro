const axios = require('axios');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const BASE_URL = 'http://localhost:3000';
let authToken = '';

async function runTests() {
  console.log('🚀 Starting Pro CRM Bug Checker...');

  try {
    // 1. Health Check
    console.log('\n[1] Checking System Health...');
    const health = await axios.get(`${BASE_URL}/api/health`, { validateStatus: false });
    console.log('✅ Health:', health.data.status);
    if (health.data.status !== 'healthy' && health.data.status !== 'degraded') {
      throw new Error(`System unhealthy: ${health.data.status}`);
    }

    // 2. Auth Test
    console.log('\n[2] Testing Authentication...');
    const login = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@procrm.com',
      password: 'admin123'
    });
    authToken = login.data.token;
    console.log('✅ Login successful');

    const headers = { Authorization: `Bearer ${authToken}` };

    // 3. Stats Test
    console.log('\n[3] Testing Dashboard Stats...');
    const stats = await axios.get(`${BASE_URL}/api/dashboard/stats`, { headers });
    console.log('✅ Stats retrieved:', Object.keys(stats.data).join(', '));

    // 4. Conversations List Test
    console.log('\n[4] Testing Conversations List...');
    const convs = await axios.get(`${BASE_URL}/api/conversations`, { headers });
    console.log('✅ Conversations:', convs.data.conversations.length);

    // 5. AI Simulator Test
    console.log('\n[5] Testing AI Simulator (Integration Test)...');
    const simulate = await axios.post(`${BASE_URL}/api/test/simulate`, {
      phone: '+94771234567',
      text: 'I want to know about pricing',
      name: 'Test User'
    });
    console.log('✅ Simulator response:', simulate.data.result.intent);
    if (simulate.data.result.reply_text) {
      console.log('✅ AI Reply generated successfully');
    } else {
      console.warn('⚠️ No AI reply generated (might be expected for some intents)');
    }

    // 6. Manual Reply Test
    if (convs.data.conversations.length > 0) {
      const convId = convs.data.conversations[0].id;
      console.log(`\n[6] Testing Manual Reply for Conv ${convId}...`);
      const reply = await axios.post(`${BASE_URL}/api/conversations/${convId}/reply`, {
        text: 'This is a test manual reply from bug checker'
      }, { headers });
      console.log('✅ Manual reply sent');
    }

    // 7. Export Test
    console.log('\n[7] Testing CSV Export...');
    const exportRes = await axios.get(`${BASE_URL}/api/system/export/contacts`, { headers });
    if (exportRes.data.includes('phone_number')) {
      console.log('✅ CSV Export working');
    } else {
      throw new Error('CSV Export content invalid');
    }

    console.log('\n✨ ALL TESTS PASSED! No major bugs detected.');
  } catch (err) {
    console.error('\n❌ TEST FAILED!');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data));
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

runTests();
