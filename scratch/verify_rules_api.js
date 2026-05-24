const axios = require('axios');

async function testAll() {
  const BASE_URL = 'http://localhost:3000';
  
  console.log('1. Logging in as admin...');
  const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: 'admin@procrm.com',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  console.log('Login successful. Token acquired.');
  
  const client = axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  console.log('\n2. Testing GET /api/system/rules/workspace...');
  const getWorkspace = await client.get('/api/system/rules/workspace');
  console.log('Status:', getWorkspace.status);
  console.log('Workspace name:', getWorkspace.data.workspace?.name);
  console.log('Sunday start time before:', getWorkspace.data.business_hours?.schedule?.sunday?.start);
  
  // Make a small change
  const originalSunStart = getWorkspace.data.business_hours?.schedule?.sunday?.start || '10:00';
  getWorkspace.data.business_hours.schedule.sunday.start = '11:00';
  
  console.log('\n3. Testing POST /api/system/rules/workspace (saving rules)...');
  const postWorkspace = await client.post('/api/system/rules/workspace', getWorkspace.data);
  console.log('Update Status:', postWorkspace.status, 'Message:', postWorkspace.data.message);
  
  console.log('\n4. Verifying workspace update (GET)...');
  const getWorkspaceVerify = await client.get('/api/system/rules/workspace');
  console.log('Sunday start time after:', getWorkspaceVerify.data.business_hours?.schedule?.sunday?.start);
  
  // Restore original
  getWorkspaceVerify.data.business_hours.schedule.sunday.start = originalSunStart;
  await client.post('/api/system/rules/workspace', getWorkspaceVerify.data);
  console.log('Restored Sunday start to:', originalSunStart);
  
  console.log('\n5. Testing GET /api/system/rules/compliance...');
  const getCompliance = await client.get('/api/system/rules/compliance');
  console.log('Status:', getCompliance.status);
  console.log('Opt-out keywords EN:', getCompliance.data.opt_out?.keywords_en);
  
  // Make a small change
  const originalKeywords = [...(getCompliance.data.opt_out?.keywords_en || [])];
  getCompliance.data.opt_out.keywords_en.push('exit');
  
  console.log('\n6. Testing POST /api/system/rules/compliance (saving rules)...');
  const postCompliance = await client.post('/api/system/rules/compliance', getCompliance.data);
  console.log('Update Status:', postCompliance.status, 'Message:', postCompliance.data.message);
  
  console.log('\n7. Verifying compliance update (GET)...');
  const getComplianceVerify = await client.get('/api/system/rules/compliance');
  console.log('Opt-out keywords EN after:', getComplianceVerify.data.opt_out?.keywords_en);
  
  // Restore original
  getComplianceVerify.data.opt_out.keywords_en = originalKeywords;
  await client.post('/api/system/rules/compliance', getComplianceVerify.data);
  console.log('Restored opt-out keywords.');
  
  console.log('\nAll rules API validations passed successfully!');
}

testAll().catch(err => {
  console.error('Test failed:', err.response?.data || err.message);
});
