const axios = require('axios');

async function testRBAC() {
  try {
    // 1. Login as agent
    console.log('Logging in as agent...');
    const loginRes = await axios.post('http://127.0.0.1:3000/api/auth/login', {
      email: 'auditagent@procrm.com',
      password: 'agent123'
    });
    const token = loginRes.data.token;
    console.log('Login successful. Token acquired.');

    // 2. Attempt to list agents (Requires admin/manager)
    console.log('Attempting to list agents (Requires admin/manager)...');
    try {
      await axios.get('http://127.0.0.1:3000/api/agents', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('❌ RBAC Bypass: Successfully listed agents as a low-privileged user!');
    } catch (err) {
      console.log('✅ RBAC Protected: Access denied to list agents (Status: ' + err.response?.status + ')');
    }

    // 3. Attempt to delete an agent (Requires admin)
    console.log('Attempting to delete an agent (Requires admin)...');
    try {
      // Trying to delete itself or any ID
      await axios.delete('http://127.0.0.1:3000/api/agents/some-id', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('❌ RBAC Bypass: Successfully triggered delete as a low-privileged user!');
    } catch (err) {
      console.log('✅ RBAC Protected: Access denied to delete agent (Status: ' + err.response?.status + ')');
    }

  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

testRBAC();
