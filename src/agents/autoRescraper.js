const db = require('../config/database');
const { scrapeWebsite, addDocument, invalidateCache } = require('../services/knowledge');
const logger = require('../utils/logger');

let intervalId = null;

/**
 * Runs a daily check for web_scrape documents and updates their content.
 */
async function runRescrape() {
  logger.info('🕷️ Starting Auto Web Rescrape job...');
  try {
    const res = await db.query(
      "SELECT id, title, source_url, metadata FROM knowledge_documents WHERE doc_type = 'web_scrape' AND status = 'active'"
    );

    let updatedCount = 0;
    const now = new Date();

    for (const doc of res.rows) {
      if (!doc.source_url) continue;

      let meta = {};
      try {
        meta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata;
      } catch (e) {}

      // Rescrape logic: Only rescrape if it's been more than 24 hours
      let lastScraped = meta.scrapedAt ? new Date(meta.scrapedAt) : new Date(0);
      const diffHours = (now - lastScraped) / (1000 * 60 * 60);

      if (diffHours >= 24) {
        logger.info(`🕷️ Rescraping ${doc.title} (${doc.source_url})...`);
        try {
          const content = await scrapeWebsite(doc.source_url);
          if (content && content.length > 50) {
            
            // Delete old chunks
            await db.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [doc.id]);
            
            meta.scrapedAt = now.toISOString();

            // Use the service directly
            const knowledgeService = require('../services/knowledge');
            if (knowledgeService.updateDocument) {
              await knowledgeService.updateDocument(doc.id, content);
              await db.query('UPDATE knowledge_documents SET metadata = $1 WHERE id = $2', [JSON.stringify(meta), doc.id]);
              updatedCount++;
            }
          }
        } catch (err) {
          logger.error(`Failed to rescrape ${doc.source_url}: ${err.message}`);
        }
      }
    }

    if (updatedCount > 0) {
      logger.info(`✅ Auto Web Rescrape completed. Updated ${updatedCount} documents.`);
    } else {
      logger.info(`🕷️ Auto Web Rescrape completed. No documents needed updating.`);
    }

  } catch (err) {
    logger.error('Auto Web Rescrape failed', err);
  }
}

/**
 * Start the daily background loop
 */
function startAutoRescrape() {
  if (intervalId) return;
  
  // Run once on startup after 1 minute delay
  setTimeout(() => {
    runRescrape();
  }, 60 * 1000);

  // Run every 12 hours
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  intervalId = setInterval(runRescrape, TWELVE_HOURS);
}

function stopAutoRescrape() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startAutoRescrape,
  stopAutoRescrape,
  runRescrape
};
