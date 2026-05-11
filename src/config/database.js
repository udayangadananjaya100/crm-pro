/**
 * Pro CRM — Database Configuration
 * Auto-fallback: PostgreSQL → SQLite
 * Provides a unified API regardless of backend
 */
const env = require('./environment');
const logger = require('../utils/logger');

let adapter = null; // 'pg' or 'sqlite'
let pool = null;
let sqliteModule = null;

/**
 * Attempt PostgreSQL connection, fallback to SQLite
 */
async function initializeDatabase() {
  if (adapter) return; // Prevent multiple initializations

  // Try PostgreSQL first
  let testPool = null;
  try {
    const { Pool } = require('pg');
    testPool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    });

    // Quick connection test
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();

    pool = testPool;
    adapter = 'pg';

    pool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err.message);
    });

    logger.info('✅ Database: PostgreSQL connected');
    return;
  } catch (err) {
    if (testPool) {
      await testPool.end().catch(() => {});
    }
    logger.warn(`PostgreSQL unavailable (${err.message.substring(0, 50)}), falling back to SQLite...`);
  }

  // Fallback to SQLite
  try {
    sqliteModule = require('./sqlite');
    sqliteModule.initSchema();
    adapter = 'sqlite';
    logger.info('✅ Database: SQLite (development fallback)');
  } catch (err) {
    logger.error('SQLite fallback also failed:', err.message);
    adapter = null;
  }
}

/**
 * Execute a query
 */
async function query(text, params = []) {
  if (adapter === 'sqlite' && sqliteModule) {
    return sqliteModule.query(text, params);
  }

  if (adapter === 'pg' && pool) {
    const start = Date.now();
    const client = await pool.connect();
    try {
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      logger.debug(`Query executed in ${duration}ms`, { rows: result.rowCount });
      return result;
    } finally {
      client.release();
    }
  }

  throw new Error('No database connection available');
}

/**
 * Execute a transaction
 */
async function transaction(callback) {
  if (adapter === 'sqlite' && sqliteModule) {
    return sqliteModule.transaction(callback);
  }

  if (adapter === 'pg' && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  throw new Error('No database connection available');
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    if (adapter === 'sqlite' && sqliteModule) {
      return sqliteModule.healthCheck();
    }

    if (adapter === 'pg' && pool) {
      const result = await query('SELECT NOW() as current_time');
      return { status: 'healthy', timestamp: result.rows[0].current_time, engine: 'postgresql' };
    }

    // Not yet initialized — try to initialize
    await initializeDatabase();
    if (adapter) {
      return healthCheck(); // Retry after init
    }

    return { status: 'unhealthy', error: 'No database adapter available' };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Get current adapter info
 */
function getAdapter() {
  return adapter;
}

/**
 * Graceful shutdown
 */
async function close() {
  if (adapter === 'pg' && pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
  if (adapter === 'sqlite' && sqliteModule) {
    await sqliteModule.close();
  }
  adapter = null;
}

module.exports = { initializeDatabase, query, transaction, healthCheck, close, getAdapter };
