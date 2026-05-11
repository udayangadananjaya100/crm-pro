const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function check() {
  await db.initializeDatabase();
  console.log('ADAPTER:', db.getAdapter());
}

check();
