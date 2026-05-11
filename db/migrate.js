/**
 * Pro CRM — Database Migration Runner
 * Executes SQL migration files in order
 */
const fs = require('fs');
const path = require('path');
const { query, close } = require('../src/config/database');
const logger = require('../src/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  logger.info('🔄 Running database migrations...');

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already executed migrations
  const executed = await query('SELECT filename FROM _migrations ORDER BY id');
  const executedSet = new Set(executed.rows.map((r) => r.filename));

  // Get migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;

  for (const file of files) {
    if (executedSet.has(file)) {
      logger.info(`⏭️  Skipping (already executed): ${file}`);
      continue;
    }

    logger.info(`▶️  Executing: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

    try {
      await query(sql);
      await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      logger.info(`✅ Completed: ${file}`);
      count++;
    } catch (err) {
      logger.error(`❌ Migration failed: ${file}`, { error: err.message });
      throw err;
    }
  }

  logger.info(`🎉 Migrations complete. ${count} new migration(s) applied.`);
}

// Run if called directly
if (require.main === module) {
  const { initializeDatabase } = require('../src/config/database');
  initializeDatabase()
    .then(() => runMigrations())
    .then(() => close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
