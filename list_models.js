const { GoogleGenerativeAI } = require('@google/generative-ai');

async function list() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  console.log('Listing available models...');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // There is no direct listModels in the new SDK easily exposed like this
    // but we can try to fetch from the raw endpoint
    const axios = require('axios');
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    console.log('MODELS:', JSON.stringify(res.data.models.map(m => m.name), null, 2));
  } catch (err) {
    console.log('FAILED:', err.message);
    if (err.response) console.log('DATA:', JSON.stringify(err.response.data, null, 2));
  }
}

list();
