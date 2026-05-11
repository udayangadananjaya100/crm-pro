/**
 * Pro CRM — Environment Configuration
 * Loads and validates all environment variables
 */
require('dotenv').config();

const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  DB_SSL: process.env.DB_SSL === 'true',

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Meta WhatsApp Cloud API
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  META_API_VERSION: process.env.META_API_VERSION || 'v21.0',

  // AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '24h',

  // Notifications
  MANAGER_EMAIL: process.env.MANAGER_EMAIL,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Derived
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
};

/**
 * Validate required env vars for production
 */
function validateEnv() {
  const required = [
    'DATABASE_URL',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WEBHOOK_VERIFY_TOKEN',
    'GEMINI_API_KEY',
    'JWT_SECRET',
  ];

  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0 && env.isProd) {
    throw new Error(`❌ Missing required env vars: ${missing.join(', ')}`);
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars (OK for dev): ${missing.join(', ')}`);
  }
}

validateEnv();

module.exports = env;
