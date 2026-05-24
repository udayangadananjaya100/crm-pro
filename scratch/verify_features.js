const axios = require('axios');

async function testAll() {
  const BASE_URL = 'http://localhost:3000';
  
  console.log('1. Logging in as admin...');
  const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: 'admin@procrm.com',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  console.log('Login successful. Token:', token.substring(0, 15) + '...');
  
  const client = axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  console.log('\n2. Testing GET /api/webhooks...');
  const getWebhooks = await client.get('/api/webhooks');
  console.log('Status:', getWebhooks.status, 'Count:', getWebhooks.data.length);
  
  console.log('\n3. Testing POST /api/webhooks...');
  const createWebhook = await client.post('/api/webhooks', {
    targetUrl: 'https://httpbin.org/post',
    events: '*',
    secret: 'mysecret'
  });
  console.log('Created webhook:', createWebhook.data);
  const createdWebhookId = createWebhook.data.id;
  
  console.log('\n4. Testing GET /api/webhooks again...');
  const getWebhooks2 = await client.get('/api/webhooks');
  console.log('Count:', getWebhooks2.data.length);
  
  console.log('\n5. Testing DELETE /api/webhooks/:id...');
  const delWebhook = await client.delete(`/api/webhooks/${createdWebhookId}`);
  console.log('Deleted status:', delWebhook.data);
  
  console.log('\n6. Testing GET /api/shifts/active...');
  const activeShift = await client.get('/api/shifts/active');
  console.log('Active shift:', activeShift.data);
  
  console.log('\n7. Testing POST /api/shifts/start...');
  const startShift = await client.post('/api/shifts/start', {
    notes: 'Testing shift clock-in'
  });
  console.log('Started shift:', startShift.data);
  
  console.log('\n8. Testing GET /api/shifts/active again...');
  const activeShift2 = await client.get('/api/shifts/active');
  console.log('Active shift:', activeShift2.data);
  
  console.log('\n9. Testing POST /api/shifts/end...');
  const endShift = await client.post('/api/shifts/end');
  console.log('Ended shift:', endShift.data);

  console.log('\n10. Testing GET /api/shifts/active (should be null/empty)...');
  const activeShift3 = await client.get('/api/shifts/active');
  console.log('Active shift:', activeShift3.data);

  console.log('\nAll API validations passed successfully!');
}

testAll().catch(err => {
  console.error('Test failed:', err.response?.data || err.message);
});
