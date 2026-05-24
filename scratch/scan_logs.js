const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Udayanga Damunugama\\.gemini\\antigravity\\brain\\2a17d792-d6b7-44e4-903c-4b556e945d70\\.system_generated\\tasks\\task-6715.log';

try {
  if (!fs.existsSync(logPath)) {
    console.log('Log file does not exist at:', logPath);
    process.exit(0);
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`Scanning ${lines.length} lines for warnings/errors...\n`);
  
  let matchCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('warn') || line.toLowerCase().includes('fail')) {
      // Skip expected mock warnings/missing env vars to focus on real issues
      if (line.includes('Missing env vars') || line.includes('PostgreSQL unavailable') || line.includes('Redis not available') || line.includes('WhatsApp configuration missing')) {
        continue;
      }
      console.log(`Line ${i + 1}: ${line.trim()}`);
      matchCount++;
      if (matchCount > 50) {
        console.log('\n... Too many logs, capping at 50 results ...');
        break;
      }
    }
  }
  
  if (matchCount === 0) {
    console.log('🎉 No unexpected errors or warnings found in logs!');
  }
} catch (err) {
  console.error('Failed to read logs:', err.message);
}
