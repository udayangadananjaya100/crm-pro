const axios = require('axios');

async function test() {
  try {
    // Note: This will fail auth, but we want to see if it's 401 (Auth Fail) or 404 (Not Found)
    const res = await axios.post('http://localhost:3000/api/system/test-integration', 
      { type: 'gemini' },
      { validateStatus: false }
    );
    console.log('STATUS:', res.status);
    console.log('DATA:', res.data);
  } catch (err) {
    console.log('ERROR:', err.message);
  }
}

test();
