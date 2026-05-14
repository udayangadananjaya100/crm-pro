const { query, getAdapter } = require('../config/database');
const env = require('../config/environment');
const logger = require('./logger');
const redis = require('../config/redis');

let settingsCache = {};
let initialized = false;

/**
 * Load all settings into memory
 */
async function loadSettings() {
  try {
    const { getAdapter } = require('../config/database');
    const adapter = getAdapter();
    let tableExists = false;

    if (adapter === 'pg') {
      const res = await query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'settings'
        ) as exists;
      `).catch(() => ({ rows: [{ exists: false }] }));
      tableExists = res.rows[0]?.exists;
    } else {
      const res = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").catch(() => ({ rows: [] }));
      tableExists = res.rows.length > 0;
    }

    if (!tableExists) {
      logger.warn('Settings table does not exist yet.');
      return {};
    }

    const result = await query('SELECT key, value FROM settings');
    const dbSettings = {};
    result.rows.forEach(row => {
      let val = row.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) {}
      }
      dbSettings[row.key] = val;
    });
    settingsCache = dbSettings;
    initialized = true;
    return dbSettings;
  } catch (err) {
    logger.error('Failed to load settings from DB', { error: err.message });
    return {};
  }
}

/**
 * Get a setting value
 * Priority: Cache (DB) -> Environment Variable
 */
async function getSetting(key, envFallbackKey) {
  if (!initialized) {
    await loadSettings();
  }

  if (settingsCache[key] !== undefined) return settingsCache[key];
  if (envFallbackKey && env[envFallbackKey]) return env[envFallbackKey];
  return null;
}

/**
 * Set a setting value
 */
async function setSetting(key, value, category = 'general', description = null, isPublic = false) {
  try {
    let finalValue;
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      finalValue = trimmedValue.startsWith('{') || trimmedValue.startsWith('[')
        ? trimmedValue
        : JSON.stringify(trimmedValue);
    } else {
      finalValue = JSON.stringify(value);
    }

    await query(
      `INSERT INTO settings (key, value, category, description, is_public, updated_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE 
       SET value = EXCLUDED.value, 
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           is_public = EXCLUDED.is_public,
           updated_at = CURRENT_TIMESTAMP`,
      [key, finalValue, category, description, isPublic]
    );
    
    settingsCache[key] = value;
    logger.info(`Setting updated: ${key}`);
    return true;
  } catch (err) {
    logger.error(`Failed to save setting: ${key}`, { error: err.message });
    return false;
  }
}

async function getAllPublic() {
  if (!initialized) await loadSettings();
  
  try {
    const result = await query(
      getAdapter() === 'sqlite'
        ? 'SELECT key, value FROM settings WHERE is_public = 1'
        : 'SELECT key, value FROM settings WHERE is_public = true'
    );
    const publicSettings = {};
    for (const row of result.rows) {
      let val = row.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) {}
      }
      publicSettings[row.key] = val;
    }
    return publicSettings;
  } catch (err) {
    logger.error('Failed to fetch public settings', { error: err.message });
    return {};
  }
}

module.exports = {
  getSetting,
  setSetting,
  loadSettings,
  getAllPublic,
  getPublicSettings: getAllPublic,
};
