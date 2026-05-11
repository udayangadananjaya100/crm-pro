const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing API Key:', apiKey.substring(0, 10) + '...');
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const result = await model.generateContent("Hello");
    console.log('Success:', result.response.text());
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

test();
