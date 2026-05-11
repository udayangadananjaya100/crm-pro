/**
 * Pro CRM — Redis Configuration
 * Used for BullMQ queues, caching, and session management
 */
const Redis = require('ioredis');
const env = require('./environment');
const logger = require('../utils/logger');

let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error('Redis: Max reconnection attempts reached');
          return null;
        }
        return Math.min(times * 200, 5000);
      },
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err.message);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }
  return redisClient;
}

/**
 * Cache helpers
 */
async function cacheGet(key) {
  try {
    const value = await getRedis().get(`procrm:${key}`);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.error('Cache get error:', err.message);
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = 3600) {
  try {
    await getRedis().setex(`procrm:${key}`, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.error('Cache set error:', err.message);
  }
}

async function cacheDel(key) {
  try {
    await getRedis().del(`procrm:${key}`);
  } catch (err) {
    logger.error('Cache del error:', err.message);
  }
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    const pong = await getRedis().ping();
    return { status: pong === 'PONG' ? 'healthy' : 'unhealthy' };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Graceful shutdown
 */
async function close() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

module.exports = { getRedis, cacheGet, cacheSet, cacheDel, healthCheck, close };
