/**
 * Pro CRM — Express Middleware
 */
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const logger = require('../utils/logger');

/**
 * API Rate Limiter
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Webhook Rate Limiter (higher limit for Meta webhook)
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { error: 'Rate limit exceeded' },
});

/**
 * JWT Authentication Middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Role-based access control
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: env.isDev ? err.message : 'Internal server error',
    ...(env.isDev && { stack: err.stack }),
  });
}

/**
 * Request logger (extended Morgan)
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/api/health') {
      logger.info(`${req.method} ${req.path}`, {
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
      });
    }
  });
  next();
}

/**
 * Brute-force protection for Auth routes
 */
const bruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  webhookLimiter,
  bruteForceLimiter,
  authenticate,
  authorize,
  errorHandler,
  requestLogger,
};

