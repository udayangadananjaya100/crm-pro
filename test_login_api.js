const axios = require('axios');

async function testLogin() {
  try {
    const res = await axios.post('http://127.0.0.1:3000/api/auth/login', {
      email: 'admin@procrm.com',
      password: 'admin123'
    });
    console.log('Login Success!');
    console.log('Token:', res.data.token);
    console.log('Agent:', res.data.agent);
  } catch (err) {
    console.error('Login Failed!');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data));
    } else {
      console.error('Error:', err);
    }
  }
}

testLogin();
