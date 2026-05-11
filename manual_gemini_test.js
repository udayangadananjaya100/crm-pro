const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const apiKey = 'AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c';
  console.log('Testing with key:', apiKey.substring(0, 8) + '...');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    console.log('Calling generateContent...');
    const result = await model.generateContent('Hello');
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.log('FAILED:', err.message);
    if (err.response) {
      console.log('RESPONSE_DATA:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

test();
