const path = require('path');
const fs = require('fs');

async function run() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('--- System Settings Verification ---');
  
  // 1. Authenticate
  console.log('Authenticating with API...');
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

  // 2. Test GET /api/system/settings
  console.log('Fetching private system settings...');
  const settingsRes = await fetch(`${baseUrl}/api/system/settings`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!settingsRes.ok) {
    throw new Error(`GET /api/system/settings failed: ${settingsRes.status}`);
  }
  const settings = await settingsRes.json();
  console.log('✅ Settings loaded.');
  console.log('Masking Check:');
  console.log('  GEMINI_API_KEY:', settings.GEMINI_API_KEY);
  console.log('  WHATSAPP_ACCESS_TOKEN:', settings.WHATSAPP_ACCESS_TOKEN);

  // 3. Test POST /api/system/settings (Save custom branding)
  console.log('Testing saving branding settings...');
  
  // Save COMPANY_NAME
  const saveNameRes = await fetch(`${baseUrl}/api/system/settings`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key: 'COMPANY_NAME', value: 'Antigravity Test CRM' })
  });
  if (!saveNameRes.ok) {
    throw new Error(`Failed to save COMPANY_NAME: ${saveNameRes.status}`);
  }
  console.log('✅ COMPANY_NAME saved.');

  // Save BRAND_COLOR
  const saveColorRes = await fetch(`${baseUrl}/api/system/settings`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key: 'BRAND_COLOR', value: '#FF5733' })
  });
  if (!saveColorRes.ok) {
    throw new Error(`Failed to save BRAND_COLOR: ${saveColorRes.status}`);
  }
  console.log('✅ BRAND_COLOR saved.');

  // 4. Test GET /api/system/public-settings
  console.log('Testing public settings API...');
  const pubRes = await fetch(`${baseUrl}/api/system/public-settings`);
  if (!pubRes.ok) {
    throw new Error(`GET /api/system/public-settings failed: ${pubRes.status}`);
  }
  const pubSettings = await pubRes.json();
  console.log('Public settings returned:', pubSettings);

  // Check if saved branding keys are in public settings
  if (pubSettings.COMPANY_NAME === 'Antigravity Test CRM' || pubSettings.company_name === 'Antigravity Test CRM') {
    console.log('✅ Company name branding propagated to public settings!');
  } else {
    console.error('❌ Custom company name NOT found in public settings!');
  }

  if (pubSettings.BRAND_COLOR === '#FF5733' || pubSettings.primary_color === '#FF5733') {
    console.log('✅ Brand color branding propagated to public settings!');
  } else {
    console.error('❌ Custom brand color NOT found in public settings!');
  }
}

run().catch(err => {
  console.error('Verification script error:', err.message);
  process.exit(1);
});
