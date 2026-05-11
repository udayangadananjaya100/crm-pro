const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  console.log('Final Proving Test with gemini-1.5-flash...');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Hello, are you there?');
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.log('FAILED:', err.message);
  }
}

test();
