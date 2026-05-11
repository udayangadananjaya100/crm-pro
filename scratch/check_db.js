const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'procrm.db');
const db = new Database(DB_PATH);

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in database:');
  tables.forEach(t => console.log(`- ${t.name}`));

  console.log('\nExecuted Migrations:');
  const migrations = db.prepare("SELECT filename FROM _migrations").all();
  migrations.forEach(m => console.log(`- ${m.filename}`));
} catch (err) {
  console.error('Error checking tables:', err.message);
} finally {
  db.close();
}
