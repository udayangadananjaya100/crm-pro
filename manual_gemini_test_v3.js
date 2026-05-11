const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  console.log('Testing with gemini-pro...');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent('Hi');
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.log('FAILED:', err.message);
  }
}

test();
