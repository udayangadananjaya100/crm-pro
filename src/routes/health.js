/**
 * Pro CRM — Health Check Route
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const redis = require('../config/redis');
const { getRulesVersion } = require('../utils/rulesLoader');

router.get('/', async (req, res) => {
  const [dbHealth, redisHealth, waHealth] = await Promise.all([
    db.healthCheck().catch((e) => ({ status: 'unhealthy', error: e.message })),
    redis.healthCheck().catch((e) => ({ status: 'unhealthy', error: e.message })),
    require('../services/whatsapp').healthCheck().catch((e) => ({ status: 'unhealthy', error: e.message })),
  ]);

  const overall =
    dbHealth.status === 'healthy' && redisHealth.status === 'healthy' && waHealth.status === 'healthy'
      ? 'healthy'
      : 'degraded';

  // Keep liveness/readiness usable during first-run setup when external
  // integrations are intentionally unconfigured.
  const statusCode = dbHealth.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status: overall,
    version: '2.1.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth,
      redis: redisHealth,
      whatsapp: waHealth,
    },
    rules: getRulesVersion(),
  });
});

module.exports = router;
