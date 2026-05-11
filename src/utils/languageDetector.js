/**
 * Pro CRM — Language Detector
 * Detects Sinhala, English, or mixed language from message text
 */

// Sinhala Unicode range: U+0D80 to U+0DFF
const SINHALA_REGEX = /[\u0D80-\u0DFF]/;
const SINHALA_CHAR_REGEX = /[\u0D80-\u0DFF]/g;
const ENGLISH_CHAR_REGEX = /[a-zA-Z]/g;

/**
 * Detect the primary language of a text
 * @returns {{ language: 'si'|'en'|'mixed', confidence: number, sinhala_ratio: number }}
 */
function detectLanguage(text) {
  if (!text || text.trim().length === 0) {
    return { language: 'en', confidence: 0.5, sinhala_ratio: 0 };
  }

  const sinhalaChars = (text.match(SINHALA_CHAR_REGEX) || []).length;
  const englishChars = (text.match(ENGLISH_CHAR_REGEX) || []).length;
  const totalLetters = sinhalaChars + englishChars;

  if (totalLetters === 0) {
    return { language: 'en', confidence: 0.5, sinhala_ratio: 0 };
  }

  const sinhalaRatio = sinhalaChars / totalLetters;

  if (sinhalaRatio > 0.7) {
    return { language: 'si', confidence: 0.9, sinhala_ratio: sinhalaRatio };
  } else if (sinhalaRatio > 0.3) {
    return { language: 'mixed', confidence: 0.7, sinhala_ratio: sinhalaRatio };
  } else {
    return { language: 'en', confidence: 0.9, sinhala_ratio: sinhalaRatio };
  }
}

/**
 * Check if text contains Sinhala characters
 */
function containsSinhala(text) {
  return SINHALA_REGEX.test(text);
}

module.exports = { detectLanguage, containsSinhala };
