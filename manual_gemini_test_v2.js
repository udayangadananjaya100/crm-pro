const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

async function test() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  console.log('Testing with high timeout...');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Increase timeout by using a custom fetch or just trying gemini-pro which might be lighter
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      // The library doesn't expose timeout easily, but let's try a simple request
    });
    
    const result = await Promise.race([
      model.generateContent('Hi'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_AFTER_30S')), 30000))
    ]);
    
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.log('FAILED:', err.message);
  }
}

test();
