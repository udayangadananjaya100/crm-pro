/**
 * Pro CRM — Backup Utility
 * Handles database snapshots and maintenance
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'procrm.db');
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

/**
 * Create a snapshot of the SQLite database
 */
async function backupDatabase() {
  try {
    // 1. Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // 2. Check if DB exists
    if (!fs.existsSync(DB_PATH)) {
      throw new Error('Source database file not found at ' + DB_PATH);
    }

    // 3. Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `procrm_backup_${timestamp}.db`;
    const destPath = path.join(BACKUP_DIR, filename);

    // 4. Copy file (SQLite is safe to copy if no active heavy writes, 
    // but better-sqlite3 handles WAL mode which is even safer)
    fs.copyFileSync(DB_PATH, destPath);

    // 5. Cleanup old backups (keep last 10)
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('procrm_backup_'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 10) {
      files.slice(10).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f.name));
        logger.debug(`🗑️ Old backup deleted: ${f.name}`);
      });
    }

    logger.info(`✅ Database backup created: ${filename}`);
    return { success: true, filename, path: destPath };
  } catch (err) {
    logger.error('❌ Backup failed', { error: err.message });
    throw err;
  }
}

/**
 * List available backups
 */
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        filename: f,
        size: stats.size,
        createdAt: stats.mtime
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { backupDatabase, listBackups };
