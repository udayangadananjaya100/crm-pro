const axios = require('axios');

async function testLogin() {
  try {
    const response = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'admin@procrm.com',
      password: 'admin123'
    });
    console.log('Login Success:', response.data);
  } catch (error) {
    console.error('Login Failed:', error.response ? error.response.data : error.message);
  }
}

testLogin();
