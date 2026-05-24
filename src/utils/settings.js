const { query } = require('../config/database');
const env = require('../config/environment');
const logger = require('./logger');
const redis = require('../config/redis');
const crypto = require('crypto');

// Sensitive keys that require encryption in the database
const SENSITIVE_KEYS = new Set([
  'GEMINI_API_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'MESSENGER_PAGE_TOKEN',
  'META_APP_SECRET'
]);

// Helper to derive a 256-bit key from the JWT_SECRET
const getEncryptionKey = () => {
  const secret = process.env.ENCRYPTION_KEY || env.JWT_SECRET || 'dev_fallback_secret_key_12345';
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypt plain text using AES-256-GCM
 */
function encrypt(text) {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(12);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${tag}`;
  } catch (err) {
    logger.error('Encryption failed for setting key', { error: err.message });
    return text;
  }
}

/**
 * Decrypt cipher text using AES-256-GCM
 */
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Legacy unencrypted settings fallback
      return encryptedText;
    }
    const [ivHex, encryptedHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.error('Decryption failed for setting key, returning raw value', { error: err.message });
    return encryptedText;
  }
}

let settingsCache = {};
let initialized = false;

// Map branding settings lowercase (db/setup seeds) and uppercase (dashboard settings UI) keys
const BRANDING_MAP = {
  'company_name': { alias: 'COMPANY_NAME', category: 'branding', isPublic: true },
  'COMPANY_NAME': { alias: 'company_name', category: 'branding', isPublic: true },
  'primary_color': { alias: 'BRAND_COLOR', category: 'branding', isPublic: true },
  'BRAND_COLOR': { alias: 'primary_color', category: 'branding', isPublic: true },
  'logo_url': { alias: 'COMPANY_LOGO', category: 'branding', isPublic: true },
  'COMPANY_LOGO': { alias: 'logo_url', category: 'branding', isPublic: true }
};

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

      if (SENSITIVE_KEYS.has(row.key) && typeof val === 'string') {
        val = decrypt(val);
      }

      dbSettings[row.key] = val;
    });

    // Back-populate aliases in loaded settings cache so they are immediately accessible in both cases
    for (const key of Object.keys(BRANDING_MAP)) {
      if (dbSettings[key] !== undefined) {
        const meta = BRANDING_MAP[key];
        if (dbSettings[meta.alias] === undefined) {
          dbSettings[meta.alias] = dbSettings[key];
        }
      }
    }

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

  // Try alias fallback
  const brandingMeta = BRANDING_MAP[key];
  if (brandingMeta && settingsCache[brandingMeta.alias] !== undefined) {
    return settingsCache[brandingMeta.alias];
  }

  if (envFallbackKey && env[envFallbackKey]) return env[envFallbackKey];
  return null;
}

/**
 * Set a setting value
 */
async function setSetting(key, value, category = 'general', description = null, isPublic = false) {
  try {
    let finalCategory = category;
    let finalIsPublic = isPublic;

    // Auto-detect branding and enforce category/isPublic attributes
    const brandingMeta = BRANDING_MAP[key];
    if (brandingMeta) {
      finalCategory = brandingMeta.category;
      finalIsPublic = brandingMeta.isPublic;
    }

    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
    const trimmedValue = typeof stringValue === 'string' ? stringValue.trim() : stringValue;
    
    const saveToDb = async (k) => {
      let valueToSave = trimmedValue;
      if (SENSITIVE_KEYS.has(k) && typeof trimmedValue === 'string') {
        valueToSave = encrypt(trimmedValue);
      }

      // Convert primitive values to JSON format so the database doesn't crash if it expects JSONB
      const finalValue = typeof valueToSave === 'string' && !valueToSave.startsWith('{') && !valueToSave.startsWith('[') ? `"${valueToSave}"` : valueToSave;

      await query(
        `INSERT INTO settings (key, value, category, description, is_public, updated_at) 
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE 
         SET value = EXCLUDED.value, 
             category = EXCLUDED.category,
             description = EXCLUDED.description,
             is_public = EXCLUDED.is_public,
             updated_at = CURRENT_TIMESTAMP`,
        [k, finalValue, finalCategory, description, finalIsPublic]
      );
      settingsCache[k] = value;
    };

    await saveToDb(key);

    // If branding key, also save alias key to database to keep them fully synced
    if (brandingMeta) {
      await saveToDb(brandingMeta.alias);
    }
    
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
    const result = await query("SELECT key, value FROM settings WHERE is_public = true OR is_public = 1 OR is_public = 'true'");
    const publicSettings = {};
    for (const row of result.rows) {
      let val = row.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) {}
      }

      if (SENSITIVE_KEYS.has(row.key) && typeof val === 'string') {
        val = decrypt(val);
      }

      publicSettings[row.key] = val;
    }

    // Ensure all branding aliases are present in the response
    for (const key of Object.keys(BRANDING_MAP)) {
      if (publicSettings[key] !== undefined) {
        const meta = BRANDING_MAP[key];
        if (publicSettings[meta.alias] === undefined) {
          publicSettings[meta.alias] = publicSettings[key];
        }
      }
    }

    return publicSettings;
  } catch (err) {
    logger.error('Failed to fetch public settings', { error: err.message });
    return {};
  }
}

module.exports = { getSetting, setSetting, loadSettings, getAllPublic, getPublicSettings: getAllPublic };
