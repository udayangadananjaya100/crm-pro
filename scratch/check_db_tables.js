const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/procrm.db');
const db = new sqlite3(dbPath);

console.log('=== CONTACTS ===');
const contacts = db.prepare('SELECT id, phone_number, display_name, source FROM contacts').all();
console.log(contacts);

console.log('=== CONVERSATIONS ===');
const conversations = db.prepare('SELECT id, contact_id, status, assigned_team, priority, created_at FROM conversations').all();
console.log(conversations);

console.log('=== MESSAGES ===');
const messages = db.prepare('SELECT id, conversation_id, direction, message_type, content, created_at FROM messages ORDER BY created_at DESC LIMIT 10').all();
console.log(messages);
