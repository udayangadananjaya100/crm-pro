const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  console.log('FINAL PROVING RUN: gemini-3.1-flash-lite');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    const result = await model.generateContent('Verify connection');
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.log('FAILED:', err.message);
  }
}

test();
