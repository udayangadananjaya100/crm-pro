/**
 * Pro CRM - SQLite Database Configuration (Development Fallback)
 * Provides a pg-like query interface for local/dev use.
 */
const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'data', 'procrm.db');
const UUID_SQL = "(lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))))";

let db = null;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info(`SQLite database opened: ${DB_PATH}`);
  }
  return db;
}

function normalizeParam(val) {
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (Array.isArray(val) || (typeof val === 'object' && val !== null)) return JSON.stringify(val);
  return val ?? null;
}

function convertSql(text, params = []) {
  const CURRENT_TIMESTAMP_TOKEN = '__PROCRM_NOW__';
  let sqliteText = text.replace(/\bCURRENT_TIMESTAMP\b/gi, CURRENT_TIMESTAMP_TOKEN);
  const expandedParams = [];
  const paramRegex = /\$(\d+)/g;
  let match;

  while ((match = paramRegex.exec(sqliteText)) !== null) {
    expandedParams.push(normalizeParam(params[parseInt(match[1], 10) - 1]));
  }

  sqliteText = sqliteText
    .replace(/\$\d+/g, '?')
    .replace(/::text\[\]/gi, '')
    .replace(/::text/gi, '')
    .replace(/::integer/gi, '')
    .replace(/ILIKE/gi, 'LIKE')
    .replace(/TIMESTAMPTZ/gi, 'TEXT')
    .replace(/TIMESTAMP/gi, 'TEXT')
    .replace(/SERIAL/gi, 'INTEGER')
    .replace(/JSONB/gi, 'TEXT')
    .replace(/\bUUID\b/gi, 'TEXT')
    .replace(/BOOLEAN/gi, 'INTEGER')
    .replace(/DECIMAL\(\d+,\d+\)/gi, 'REAL')
    .replace(/TEXT\[\]/gi, 'TEXT')
    .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'([^']+)'/gi, "datetime('now', '+$1')")
    .replace(/NOW\(\)\s*-\s*INTERVAL\s*'([^']+)'/gi, "datetime('now', '-$1')")
    .replace(/CURRENT_DATE/g, "date('now')")
    .replace(/NOW\(\)/g, "datetime('now')")
    .replace(/GREATEST\((\d+),\s*([^)]+)\)/gi, 'MAX($1, $2)')
    .replace(/NULLS\s+LAST/gi, '')
    .replace(/uuid_generate_v4\(\)/gi, UUID_SQL)
    .replace(new RegExp(CURRENT_TIMESTAMP_TOKEN, 'g'), 'CURRENT_TIMESTAMP');

  return { sqliteText, expandedParams };
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const normalized = {};
    for (const [key, val] of Object.entries(row)) {
      let normKey = key;
      if (key === 'COUNT(*)' || key.toLowerCase().includes('count(')) normKey = 'count';
      normalized[normKey] = val;
    }
    return normalized;
  });
}

async function query(text, params = []) {
  const conn = getDb();
  const { sqliteText, expandedParams } = convertSql(text, params);
  const trimmed = sqliteText.trim();
  const upper = trimmed.toUpperCase();
  const isSelect = upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA');
  const hasReturning = /\bRETURNING\b/i.test(trimmed);

  try {
    if (isSelect || hasReturning) {
      const rows = normalizeRows(conn.prepare(sqliteText).all(...expandedParams));
      return { rows, rowCount: rows.length };
    }

    if (/^(INSERT|UPDATE|DELETE)\b/i.test(trimmed)) {
      const info = conn.prepare(sqliteText).run(...expandedParams);
      const tableName = extractTableName(trimmed);
      if (/^INSERT\b/i.test(trimmed) && tableName && info.lastInsertRowid) {
        const row = conn.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
        return { rows: row ? [row] : [], rowCount: info.changes };
      }
      return { rows: [], rowCount: info.changes };
    }

    const statements = sqliteText.split(';').map((s) => s.trim()).filter(Boolean);
    let lastInfo = { changes: 0 };
    for (const statement of statements) {
      if (isPostgresOnlyStatement(statement)) continue;
      lastInfo = conn.prepare(statement).run(...expandedParams);
    }
    return { rows: [], rowCount: lastInfo.changes };
  } catch (err) {
    if (isPostgresOnlyStatement(sqliteText) || isPostgresOnlyError(err)) {
      return { rows: [], rowCount: 0 };
    }
    logger.error('SQLite query error:', { error: err.message, sql: sqliteText.substring(0, 300) });
    throw err;
  }
}

function isPostgresOnlyStatement(statement) {
  return /CREATE\s+EXTENSION|CREATE\s+OR\s+REPLACE\s+FUNCTION|CREATE\s+TRIGGER|EXECUTE\s+FUNCTION|\blanguage\s+'?plpgsql'?/i.test(statement);
}

function isPostgresOnlyError(err) {
  return /EXTENSION|FUNCTION|TRIGGER|plpgsql|language/i.test(err.message || '');
}

function extractTableName(sql) {
  const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  if (insertMatch) return insertMatch[1];
  const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
  if (updateMatch) return updateMatch[1];
  return null;
}

async function transaction(callback) {
  const conn = getDb();
  conn.exec('BEGIN');
  try {
    const client = { query: async (text, params) => query(text, params) };
    const result = await callback(client);
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

async function healthCheck() {
  try {
    const row = getDb().prepare("SELECT datetime('now') as current_time").get();
    return { status: 'healthy', timestamp: row.current_time, engine: 'sqlite' };
  } catch (err) {
    return { status: 'unhealthy', error: err.message, engine: 'sqlite' };
  }
}

function initSchema() {
  const conn = getDb();

  conn.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      phone_number TEXT NOT NULL UNIQUE,
      phone_number_masked TEXT,
      display_name TEXT DEFAULT 'Unknown',
      email TEXT,
      company TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','blocked','pending')),
      source TEXT DEFAULT 'whatsapp',
      lead_score INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      notes TEXT,
      opt_in_marketing INTEGER DEFAULT 0,
      opt_in_analytics INTEGER DEFAULT 0,
      language_preference TEXT DEFAULT 'en',
      last_message_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','pending','resolved','closed')),
      assigned_agent_id TEXT,
      assigned_team TEXT DEFAULT 'general_pool',
      intent TEXT,
      priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent','critical')),
      tags TEXT DEFAULT '[]',
      subject TEXT,
      resolution_notes TEXT,
      window_expires_at TEXT,
      first_response_at TEXT,
      resolved_at TEXT,
      sla_breached INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      csat_score INTEGER,
      csat_comment TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      whatsapp_message_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
      message_type TEXT NOT NULL DEFAULT 'text',
      content TEXT,
      content_masked TEXT,
      media_url TEXT,
      media_mime_type TEXT,
      template_name TEXT,
      template_language TEXT,
      status TEXT DEFAULT 'received',
      intent TEXT,
      confidence REAL,
      ai_generated INTEGER DEFAULT 0,
      pii_detected INTEGER DEFAULT 0,
      transcription TEXT,
      feedback_score INTEGER,
      feedback_note TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','manager','team_lead','agent')),
      team TEXT DEFAULT 'general_pool',
      status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','away','busy','suspended')),
      max_conversations INTEGER DEFAULT 20,
      active_conversations INTEGER DEFAULT 0,
      avatar_url TEXT,
      last_active_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
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

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      status TEXT DEFAULT 'approved',
      header_text TEXT,
      body_text TEXT NOT NULL,
      footer_text TEXT,
      buttons TEXT DEFAULT '[]',
      variables TEXT DEFAULT '[]',
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      meta_template_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opt_out_log (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
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
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
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
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding TEXT,
      chunk_index INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      contact_name TEXT,
      contact_phone TEXT,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      message_id TEXT,
      status TEXT,
      sent_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY DEFAULT ${UUID_SQL},
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      target_role TEXT,
      target_agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
      is_read INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS canned_responses (
      id TEXT PRIMARY KEY,
      shortcut TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shift_logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      target_url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '*',
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON contacts(last_message_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
  `);

  ensureColumn('contacts', 'notes', 'TEXT');
  ensureColumn('messages', 'media_mime_type', 'TEXT');
  ensureColumn('messages', 'template_language', 'TEXT');
  ensureColumn('messages', 'transcription', 'TEXT');
  ensureColumn('messages', 'feedback_score', 'INTEGER');
  ensureColumn('messages', 'feedback_note', 'TEXT');
  ensureColumn('conversations', 'csat_score', 'INTEGER');
  ensureColumn('conversations', 'csat_comment', 'TEXT');
  ensureColumn('agents', 'avatar_url', 'TEXT');
  ensureColumn('notifications', 'metadata', "TEXT DEFAULT '{}'");

  seedDefaultSettings(conn);
  logger.info('SQLite schema initialized');
}

function ensureColumn(table, column, definition) {
  const conn = getDb();
  const columns = conn.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((col) => col.name === column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDefaultSettings(conn) {
  const defaults = [
    ['company_name', '"Pro CRM"', 'branding', 'The name of the company using the CRM', 1],
    ['primary_color', '"#4F46E5"', 'branding', 'Primary brand color for the dashboard', 1],
    ['logo_url', '"/logo.png"', 'branding', 'URL for the company logo', 1],
    ['setup_completed', 'false', 'system', 'Whether the initial setup wizard has been completed', 1],
    ['license_key', 'null', 'system', 'Product license key', 0],
    ['license_status', '{"valid": false}', 'system', 'Current license validation status', 0],
  ];
  const stmt = conn.prepare(`
    INSERT INTO settings (key, value, category, description, is_public)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  defaults.forEach((row) => stmt.run(...row));
}

function getPool() {
  return getDb();
}

async function close() {
  if (db) {
    db.close();
    db = null;
    logger.info('SQLite database closed');
  }
}

module.exports = { getPool, query, transaction, healthCheck, close, initSchema, getDb };
