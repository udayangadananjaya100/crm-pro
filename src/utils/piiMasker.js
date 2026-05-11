/**
 * Pro CRM — PII Masker Utility
 * Detects and masks personally identifiable information
 */
const logger = require('./logger');

/**
 * PII patterns for Sri Lankan context
 * Using factory functions to create fresh regex instances (avoids global flag lastIndex issues)
 */
const PII_PATTERNS = [
  {
    type: 'phone_number',
    getRegex: () => /(\+?94|0)?[0-9]{9,10}/g,
    mask: (match) => `***-***-${match.slice(-4)}`,
  },
  {
    type: 'email',
    getRegex: () => /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: (match) => {
      const [local, domain] = match.split('@');
      return `${local.slice(0, 2)}***@***`;
    },
  },
  {
    type: 'nic_number',
    getRegex: () => /\b([0-9]{9}[VvXx]|[0-9]{12})\b/g,
    mask: (match) => `***${match.slice(-4)}`,
  },
  {
    type: 'credit_card',
    getRegex: () => /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
    mask: (match) => `****-****-****-${match.slice(-4)}`,
  },
];

/**
 * Scan text for PII and return detected types
 */
function detectPII(text) {
  const detected = [];

  for (const pattern of PII_PATTERNS) {
    const matches = text.match(pattern.getRegex());
    if (matches && matches.length > 0) {
      detected.push({
        type: pattern.type,
        count: matches.length,
      });
    }
  }

  return detected;
}

/**
 * Mask all PII in text
 */
function maskPII(text) {
  let masked = text;

  for (const pattern of PII_PATTERNS) {
    masked = masked.replace(pattern.getRegex(), pattern.mask);
  }

  return masked;
}

/**
 * Check if text contains PII
 */
function containsPII(text) {
  return PII_PATTERNS.some((pattern) => pattern.getRegex().test(text));
}

/**
 * Full PII scan — returns masked text + detection report
 */
function scanAndMask(text) {
  const detected = detectPII(text);
  const maskedText = maskPII(text);

  if (detected.length > 0) {
    logger.warn('PII detected and masked', { types: detected.map((d) => d.type) });
  }

  return {
    original_contains_pii: detected.length > 0,
    masked_text: maskedText,
    detected_types: detected,
  };
}

module.exports = { detectPII, maskPII, containsPII, scanAndMask };
