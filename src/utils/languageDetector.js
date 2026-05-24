/**
 * Pro CRM — Language Detector
 * Detects Sinhala, English, or mixed language from message text
 */

// Sinhala Unicode range: U+0D80 to U+0DFF
const SINHALA_REGEX = /[\u0D80-\u0DFF]/;
const SINHALA_CHAR_REGEX = /[\u0D80-\u0DFF]/g;
const ENGLISH_CHAR_REGEX = /[a-zA-Z]/g;

// Common Singlish keywords and particles used in Sri Lanka
const SINGLISH_KEYWORDS = [
  'eka', 'ganna', 'danna', 'ewanna', 'karanna', 'hadanna', 'epa', 'epaa', 'awul', 'aul', 'naha', 'naa', 'hari', 'honda', 'oyata', 'apita', 'mata', 'oyala', 'denna', 'kiyanna', 'wisthara', 'wistara', 'kohomada', 'puluwan', 'puluwanda', 'mokada', 'keeyada', 'ganana', 'masekata', 'karanne', 'hadanne', 'dunna', 'labuna', 'labune', 'salli', 'mudal', 'gewanna', 'gewala', 'ithuru', 'ithiri', 'machan', 'machang', 'sthuthi', 'istuti', 'helo', 'oyage', 'apige', 'mage'
];

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

  // Singlish word matching
  const words = text.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, '')).filter(Boolean);
  let singlishMatches = 0;
  if (words.length > 0) {
    for (const word of words) {
      if (SINGLISH_KEYWORDS.includes(word)) {
        singlishMatches++;
      }
    }
  }
  const singlishRatio = words.length > 0 ? singlishMatches / words.length : 0;

  if (totalLetters === 0) {
    if (singlishMatches > 0) {
      return { language: 'si', confidence: 0.8, sinhala_ratio: 1.0 };
    }
    return { language: 'en', confidence: 0.5, sinhala_ratio: 0 };
  }

  const sinhalaRatio = sinhalaChars / totalLetters;

  // Determine language with Singlish fallback
  if (sinhalaRatio > 0.7 || (sinhalaRatio === 0 && singlishRatio > 0.4) || (sinhalaRatio === 0 && singlishMatches >= 2)) {
    return { language: 'si', confidence: 0.9, sinhala_ratio: Math.max(sinhalaRatio, singlishRatio) };
  } else if (sinhalaRatio > 0.3 || singlishRatio > 0.15 || singlishMatches >= 1) {
    return { language: 'mixed', confidence: 0.7, sinhala_ratio: Math.max(sinhalaRatio, singlishRatio) };
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
