const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

async function listAll() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  try {
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    console.log('--- AVAILABLE MODELS FOR YOUR KEY ---');
    res.data.models.forEach(m => {
      if (m.supportedGenerationMethods.includes('generateContent')) {
        console.log(`- ${m.name}`);
      }
    });
    console.log('--- END ---');
  } catch (err) {
    console.log('FAILED TO LIST:', err.message);
  }
}

listAll();
