/**
 * Pro CRM — Input Validation Middleware
 * Lightweight validation for API requests
 */
const logger = require('../utils/logger');

/**
 * Validator schema definitions and runner
 */
const validate = (schema) => (req, res, next) => {
  const errors = [];
  const data = req.body;

  const validatedData = {};
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      // Type check
      if (rules.type === 'email' && (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
        errors.push(`${field} must be a valid email`);
      }
      
      if (rules.type === 'phone' && (typeof value !== 'string' || !/^\+?[1-9]\d{1,14}$/.test(value.replace(/\s/g, '')))) {
        errors.push(`${field} must be a valid international phone number`);
      }

      // Length checks
      if (rules.min && (typeof value !== 'string' || value.length < rules.min)) {
        errors.push(`${field} must be a string of at least ${rules.min} characters`);
      }
      if (rules.max && (typeof value !== 'string' || value.length > rules.max)) {
        errors.push(`${field} must be a string of at most ${rules.max} characters`);
      }

      // Enum check
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      if (errors.length === 0) {
        validatedData[field] = value;
      }
    }
  }

  if (errors.length === 0) {
    // Replace body with validated data to prevent mass assignment
    req.body = validatedData;
  }

  if (errors.length > 0) {
    logger.warn('Validation failed', { path: req.path, errors });
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  next();
};

module.exports = { validate };
