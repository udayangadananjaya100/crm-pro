const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { getSetting, setSetting } = require('../utils/settings');
const logger = require('../utils/logger');

async function saveSettingOrThrow(...args) {
  const ok = await setSetting(...args);
  if (!ok) throw new Error(`Failed to save setting: ${args[0]}`);
}

// Middleware to check if setup is already complete
async function ensureNotSetup(req, res, next) {
  try {
    const isSetup = await getSetting('setup_completed');
    if (isSetup === 'true' || isSetup === true) {
      return res.status(403).json({ error: 'Setup is already complete' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/setup/status
 * Returns whether the system requires setup
 */
router.get('/status', async (req, res) => {
  try {
    const isSetup = await getSetting('setup_completed');
    res.json({ 
      setup_required: isSetup !== 'true' && isSetup !== true 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check setup status', details: err.message });
  }
});

/**
 * POST /api/setup/complete
 * Completes the setup wizard (creates admin, sets API keys, sets branding)
 */
router.post('/complete', ensureNotSetup, async (req, res) => {
  try {
    const { 
      adminEmail, 
      adminPassword, 
      adminName,
      companyName,
      licenseKey,
      whatsappToken,
      whatsappPhoneId,
      geminiApiKey
    } = req.body;

    if (!adminEmail || !adminPassword || !adminName) {
      return res.status(400).json({ error: 'Admin details are required' });
    }

    // 1. Create Super Admin User
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    
    // Ensure agents table exists (migrations should have run)
    await query(
      `INSERT INTO agents (email, password_hash, display_name, role, team)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE 
       SET password_hash = EXCLUDED.password_hash, 
           role = EXCLUDED.role`,
      [adminEmail, passwordHash, adminName, 'admin', 'general_pool']
    );

    // 2. Save Settings
    if (companyName) await saveSettingOrThrow('company_name', companyName, 'branding');
    if (licenseKey) await saveSettingOrThrow('license_key', licenseKey, 'system');
    
    if (whatsappToken) await saveSettingOrThrow('WHATSAPP_ACCESS_TOKEN', whatsappToken, 'meta');
    if (whatsappPhoneId) await saveSettingOrThrow('WHATSAPP_PHONE_NUMBER_ID', whatsappPhoneId, 'meta');
    if (geminiApiKey) await saveSettingOrThrow('GEMINI_API_KEY', geminiApiKey, 'ai');

    // 3. Mark setup as complete
    await saveSettingOrThrow('setup_completed', 'true', 'system');

    logger.info('🎉 Setup wizard completed successfully!');
    
    res.json({ success: true, message: 'Setup completed successfully' });
  } catch (err) {
    logger.error('Setup failed', { error: err.message });
    res.status(500).json({ error: 'Setup failed', details: err.message });
  }
});

module.exports = router;
