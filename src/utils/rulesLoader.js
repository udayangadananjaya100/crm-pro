/**
 * Pro CRM — Rules Loader
 * Dynamically loads all agent/workspace/compliance rules from .agent/rules/
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const RULES_DIR = path.join(__dirname, '..', '..', '.agent', 'rules');

let rulesCache = {};
let lastLoadTime = null;

/**
 * Load a single rules file
 */
function loadRuleFile(filename) {
  const filePath = path.join(RULES_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`Failed to load rules file: ${filename}`, { error: err.message });
    return null;
  }
}

/**
 * Load all rules files into cache
 */
function loadAllRules() {
  const files = {
    workspace: 'workspace-rules.json',
    agent: 'agent-rules.json',
    compliance: 'compliance-rules.json',
    intentRouting: 'intent-routing.json',
    templates: 'templates.json',
    knowledge: 'knowledge-base.json',
  };


  for (const [key, filename] of Object.entries(files)) {
    const data = loadRuleFile(filename);
    if (data) {
      rulesCache[key] = data;
      logger.info(`✅ Loaded rules: ${filename} (v${data.version || 'unknown'})`);
    }
  }

  lastLoadTime = new Date().toISOString();
  logger.info(`All rules loaded at ${lastLoadTime}`);
  return rulesCache;
}

/**
 * Get specific ruleset
 */
function getRules(rulesetName) {
  if (!rulesCache[rulesetName]) {
    loadAllRules();
  }
  return rulesCache[rulesetName] || null;
}

/**
 * Get all rules
 */
function getAllRules() {
  if (Object.keys(rulesCache).length === 0) {
    loadAllRules();
  }
  return rulesCache;
}

/**
 * Reload rules (for hot-reloading on config change)
 */
function reloadRules() {
  rulesCache = {};
  return loadAllRules();
}

/**
 * Get version info
 */
function getRulesVersion() {
  return {
    versions: Object.entries(rulesCache).reduce((acc, [key, val]) => {
      acc[key] = val.version || 'unknown';
      return acc;
    }, {}),
    lastLoadTime,
  };
}

module.exports = { loadAllRules, getRules, getAllRules, reloadRules, getRulesVersion };
