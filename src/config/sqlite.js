/**
 * Pro CRM — SQLite Database Configuration (Development Fallback)
 * Drop-in replacement for PostgreSQL when it's not available.
 * Uses better-sqlite3 for zero-dependency local development.
 */
const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'procrm.db');
let db = null;

/**
 * Get or create the SQLite database connection
 */
function getDb() {
  if (!db) {
    // Ensure data directory exists
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info(`✅ SQLite database opened: ${DB_PATH}`);
  }
  return db;
}

/**
 * Execute a query — mimics the pg Pool.query() interface
 * Converts $1, $2 PostgreSQL params to ? SQLite params
 */
async function query(text, params = []) {
  const conn = getDb();
  let sqliteText = text;
  
  // 1. Convert PostgreSQL $1, $2 style to ? for SQLite
  // We must extract parameters in the exact order they appear in the SQL
  const expandedParams = [];
  const paramRegex = /\$(\d+)/g;
  let match;
  while ((match = paramRegex.exec(sqliteText)) !== null) {
    const index = parseInt(match[1], 10) - 1;
    const val = params[index];
    expandedParams.push(typeof val === 'boolean' ? (val ? 1 : 0) : (Array.isArray(val) || (typeof val === 'object' && val !== null)) ? JSON.stringify(val) : (val ?? null));
  }
  
  // Replace all $n with ?
  sqliteText = sqliteText.replace(/\$\d+/g, '?');

  // 2. PostgreSQL to SQLite Syntax Mapping
  sqliteText = sqliteText
    .replace(/::text\[\]/g, '')
    .replace(/::text/g, '')
    .replace(/ILIKE/g, 'LIKE')
    .replace(/TIMESTAMPTZ/g, 'TEXT')
    .replace(/SERIAL/g, 'INTEGER')
    .replace(/JSONB/g, 'TEXT')
    .replace(/UUID/g, 'TEXT')
    .replace(/DECIMAL\(\d+,\d+\)/g, 'REAL')
    .replace(/TEXT\[\]/g, 'TEXT')
    .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'([^']+)'/gi, "datetime('now', '+$1')")
    .replace(/NOW\(\)\s*-\s*INTERVAL\s*'([^']+)'/gi, "datetime('now', '-$1')")
    .replace(/INTERVAL\s*'([^']+)'/gi, "'+$1'")
    .replace(/NOW\(\)/g, "(datetime('now'))")
    .replace(/CURRENT_DATE/g, "date('now')")
    .replace(/GREATEST\((\d+),\s*([^)]+)\)/gi, 'MAX($1, $2)')
    .replace(/array_cat\((\w+),\s*([^)]+)\)/gi, '$1')
    .replace(/NULLS\s+LAST/gi, '')
    .replace(/uuid_generate_v4\(\)/g, "(lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))))")
    .replace(/ON CONFLICT \((\w+)\) DO NOTHING/g, 'ON CONFLICT ($1) DO NOTHING')
    .replace(/RETURNING\s+\*/gi, '')
    .replace(/RETURNING\s+[\w, ]+/gi, '');

  const trimmed = sqliteText.trim();
  const isSelect = trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('WITH');
  const isInsert = trimmed.toUpperCase().startsWith('INSERT');

  try {
    // Safety check for parameter count
    const expectedCount = (sqliteText.match(/\?/g) || []).length;
    if (expandedParams.length !== expectedCount) {
      // If we have fewer params than placeholders, pad with nulls
      while (expandedParams.length < expectedCount) expandedParams.push(null);
      // If we have more, truncate (though this shouldn't happen with our regex)
      if (expandedParams.length > expectedCount) expandedParams.length = expectedCount;
    }

    if (isSelect) {
      const stmt = conn.prepare(sqliteText);
      let rows = stmt.all(...expandedParams);
      // Normalize COUNT(*) key to 'count' for PostgreSQL compat
      rows = rows.map(row => {
        const normalized = {};
        for (const [key, val] of Object.entries(row)) {
          const normKey = (key === 'COUNT(*)' || key.includes('count(')) ? 'count' : key;
          normalized[normKey] = val;
        }
        return normalized;
      });
      return { rows, rowCount: rows.length };
    } else if (isInsert) {
      const stmt = conn.prepare(sqliteText);
      const info = stmt.run(...expandedParams);
      const tableName = extractTableName(trimmed);
      if (tableName && info.lastInsertRowid) {
        // Fetch the inserted row to mimic RETURNING *
        const row = conn.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
        return { rows: row ? [row] : [], rowCount: info.changes };
      }
      return { rows: [], rowCount: info.changes };
    } else {
      // For multiple statements (common in migrations)
      const statements = sqliteText.split(';').filter(s => s.trim().length > 0);
      let lastInfo = { changes: 0 };
      
      for (const s of statements) {
        try {
          const stmt = conn.prepare(s);
          lastInfo = stmt.run(...expandedParams);
        } catch (err) {
          // If it's a PG-specific command we want to skip
          if (err.message.includes('CREATE EXTENSION') ||
              err.message.includes('EXTENSION') ||
              err.message.includes('CREATE OR REPLACE FUNCTION') ||
              err.message.includes('CREATE TRIGGER') ||
              err.message.includes('TRIGGER') ||
              err.message.includes('FUNCTION') ||
              err.message.includes('EXECUTE') ||
              err.message.includes('language')) {
            continue;
          }
          throw err;
        }
      }
      return { rows: [], rowCount: lastInfo.changes };
    }
  } catch (err) {
    // Silently skip certain PostgreSQL-specific operations
    if (err.message.includes('CREATE EXTENSION') ||
        err.message.includes('EXTENSION') ||
        err.message.includes('CREATE OR REPLACE FUNCTION') ||
        err.message.includes('CREATE TRIGGER') ||
        err.message.includes('TRIGGER') ||
        err.message.includes('FUNCTION') ||
        err.message.includes('language')) {
      return { rows: [], rowCount: 0 };
    }
    logger.error('SQLite query error:', { error: err.message, sql: sqliteText.substring(0, 200) });
    throw err;
  }
}

/**
 * Extract table name from SQL
 */
function extractTableName(sql) {
  const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  if (insertMatch) return insertMatch[1];
  const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
  if (updateMatch) return updateMatch[1];
  return null;
}

/**
 * Transaction support
 * Note: better-sqlite3 transactions are synchronous, but our query() is async.
 * We manually wrap BEGIN/COMMIT/ROLLBACK to support async callbacks.
 */
async function transaction(callback) {
  const conn = getDb();
  conn.exec('BEGIN');
  try {
    const client = {
      query: async (text, params) => query(text, params),
    };
    
    // Enforce a timeout to prevent hanging transactions from locking the DB
    const result = await Promise.race([
      callback(client),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction Timeout')), 10000))
    ]);

    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    const conn = getDb();
    const row = conn.prepare("SELECT datetime('now') as current_time").get();
    return { status: 'healthy', timestamp: row.current_time, engine: 'sqlite' };
  } catch (err) {
    return { status: 'unhealthy', error: err.message, engine: 'sqlite' };
  }
}

/**
 * Initialize SQLite schema
 */
function initSchema() {
  const conn = getDb();

  conn.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      phone_number TEXT NOT NULL UNIQUE,
      phone_number_masked TEXT,
      display_name TEXT DEFAULT 'Unknown',
      email TEXT,
      company TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','blocked','pending')),
      source TEXT DEFAULT 'whatsapp',
      lead_score INTEGER DEFAULT 0,
      tags TEXT DEFAULT '{}',
      opt_in_marketing INTEGER DEFAULT 0,
      opt_in_analytics INTEGER DEFAULT 0,
      language_preference TEXT DEFAULT 'en',
      last_message_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','pending','resolved','closed')),
      assigned_agent_id TEXT,
      assigned_team TEXT DEFAULT 'general_pool',
      intent TEXT,
      priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent','critical')),
      tags TEXT DEFAULT '{}',
      subject TEXT,
      resolution_notes TEXT,
      window_expires_at TEXT,
      first_response_at TEXT,
      resolved_at TEXT,
      sla_breached INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      whatsapp_message_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
      message_type TEXT NOT NULL DEFAULT 'text',
      content TEXT,
      content_masked TEXT,
      media_url TEXT,
      template_name TEXT,
      status TEXT DEFAULT 'received',
      intent TEXT,
      confidence REAL,
      ai_generated INTEGER DEFAULT 0,
      pii_detected INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','manager','team_lead','agent')),
      team TEXT DEFAULT 'general_pool',
      status TEXT DEFAULT 'active',
      max_conversations INTEGER DEFAULT 20,
      active_conversations INTEGER DEFAULT 0,
      last_active_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      message_id TEXT,
      conversation_id TEXT,
      agent_type TEXT NOT NULL,
      action TEXT NOT NULL,
      intent TEXT,
      confidence REAL,
      rule_applied TEXT,
      flags TEXT DEFAULT '[]',
      input_summary TEXT,
      output_summary TEXT,
      response_time_ms INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opt_out_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      action TEXT NOT NULL CHECK (action IN ('opt_out','opt_in')),
      keyword_used TEXT,
      channel TEXT DEFAULT 'whatsapp',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      description TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      title TEXT NOT NULL,
      filename TEXT,
      source_url TEXT,
      doc_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_chunks INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding TEXT,
      chunk_index INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(document_id);

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      contact_name TEXT,
      contact_phone TEXT,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_segment TEXT,
      message_template TEXT,
      ai_enhanced INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS campaign_logs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      message_id TEXT,
      status TEXT,
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      title TEXT NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'info',
      target_role TEXT,
      target_agent_id TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);


  logger.info('✅ SQLite schema initialized');
}

/**
 * Get pool (compatibility with pg interface)
 */
function getPool() {
  return getDb();
}

/**
 * Close the database
 */
async function close() {
  if (db) {
    db.close();
    db = null;
    logger.info('SQLite database closed');
  }
}

module.exports = { getPool, query, transaction, healthCheck, close, initSchema, getDb };
