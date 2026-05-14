/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                    PRO CRM v2.1.0                           ║
 * ║   Production-Grade WhatsApp CRM — Meta Cloud API            ║
 * ║   Node.js + Express + BullMQ + PostgreSQL + Gemini AI       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

// Load environment variables first
const env = require('./config/environment');
const logger = require('./utils/logger');
const { loadAllRules } = require('./utils/rulesLoader');
const { startSLALoop } = require('./agents/slaMonitor');
const db = require('./config/database');
const redis = require('./config/redis');
const realtime = require('./services/realtime');

// Routes
const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const healthRoutes = require('./routes/health');
const testRoutes = require('./routes/test');
const setupRoutes = require('./routes/setup');

// Middleware
const {
  apiLimiter,
  webhookLimiter,
  errorHandler,
  requestLogger,
} = require('./middleware');

// ─────────────────────────────────────
// Initialize Express
// ─────────────────────────────────────
const app = express();

// ─────────────────────────────────────
// Security & Parsing
// ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disable for admin dashboard
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: env.isDev ? '*' : env.ADMIN_DASHBOARD_URL,
  credentials: true,
}));
app.use(compression());
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => {
    req.rawBody = Buffer.from(buf);
  },
}));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(requestLogger);
if (env.isDev) {
  app.use(morgan('dev'));
}

// ─────────────────────────────────────
// Static Admin Dashboard
// ─────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'dashboard', 'public')));

// ─────────────────────────────────────
// Routes
// ─────────────────────────────────────

// Health check (no auth, no rate limit)
app.use('/api/health', healthRoutes);

// Setup routes (checks internally if setup is complete)
app.use('/api/setup', setupRoutes);

// WhatsApp webhook (higher rate limit, no auth — Meta validates via verify token)
app.use('/api/webhook/whatsapp', webhookLimiter, webhookRoutes);

// Test routes (dev only — auto-disabled in production, no api rate limit)
app.use('/api/test', testRoutes);

// REST API (authenticated + rate limited)
app.use('/api', apiLimiter, apiRoutes);

// Admin Dashboard SPA fallback
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'public', 'index.html'));
});

// ─────────────────────────────────────
// Root route
// ─────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'Pro CRM',
    version: '2.1.0',
    status: 'running',
    description: 'WhatsApp CRM powered by Meta Cloud API & Gemini AI',
    endpoints: {
      health: '/api/health',
      webhook: '/api/webhook/whatsapp',
      api: '/api',
      admin: '/admin',
      ...(env.isDev && {
        test_simulate: '/api/test/simulate',
        test_intents: '/api/test/intents',
        test_pipeline: '/api/test/pipeline-check',
      }),
    },
  });
});

// ─────────────────────────────────────
// Error Handler
// ─────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────
// Server Startup
// ─────────────────────────────────────
async function startServer() {
  try {
    // 1. Load rules
    logger.info('📋 Loading rules...');
    loadAllRules();

    // 2. Initialize database (PostgreSQL → SQLite fallback)
    logger.info('🗄️  Connecting to database...');
    await db.initializeDatabase();
    const dbHealth = await db.healthCheck();
    if (dbHealth.status === 'healthy') {
      logger.info(`✅ Database connected (${dbHealth.engine || 'unknown'})`);
    } else {
      logger.warn('⚠️  Database not available — running in limited mode');
    }

    // 3. Test Redis connection
    logger.info('📡 Connecting to Redis...');
    const redisHealth = await redis.healthCheck();
    if (redisHealth.status === 'healthy') {
      logger.info('✅ Redis connected');
    } else {
      logger.warn('⚠️  Redis not available — queue processing disabled');
    }

    // 4. Create HTTP server + WebSocket
    const server = http.createServer(app);
    realtime.initialize(server);

    server.listen(env.PORT, () => {
      logger.info('');
      logger.info('╔══════════════════════════════════════════════════╗');
      logger.info('║         🚀 PRO CRM Server is LIVE!              ║');
      logger.info('╚══════════════════════════════════════════════════╝');
      logger.info('');
      logger.info(`   🌐 URL:       http://localhost:${env.PORT}`);
      logger.info(`   📊 Dashboard: http://localhost:${env.PORT}/admin`);
      logger.info(`   🔗 API:       http://localhost:${env.PORT}/api`);
      logger.info(`   💚 Health:    http://localhost:${env.PORT}/api/health`);
      logger.info(`   📱 Webhook:   http://localhost:${env.PORT}/api/webhook/whatsapp`);
      logger.info(`   ⚡ WebSocket: ws://localhost:${env.PORT} (Real-time)`);
      if (env.isDev) {
        logger.info(`   🧪 Test:      http://localhost:${env.PORT}/api/test/intents`);
        logger.info(`   🔬 Simulate:  POST http://localhost:${env.PORT}/api/test/simulate`);
      }
      logger.info(`   🌍 Env:       ${env.NODE_ENV}`);
      logger.info('');

      // 5. Start background agents
      startSLALoop();
    });

    // ─────────────────────────────────────
    // Graceful Shutdown
    // ─────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`\n🛑 ${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await db.close();
        await redis.close();
        logger.info('✅ Server shut down cleanly');
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        logger.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('💥 Failed to start server', { error: err.message });
    process.exit(1);
  }
}

startServer();

module.exports = app;
