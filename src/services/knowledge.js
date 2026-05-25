/**
 * Pro CRM — Knowledge Service (Universal AI Brain)
 * Handles document chunking, embeddings, and semantic search (RAG)
 * Optimized with in-memory vector cache and pgvector DB-level fallback.
 */
const db = require('../config/database');
const { getSetting } = require('../utils/settings');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const axios = require('axios');

let genAI = null;
let embeddingModel = null;
let currentApiKey = null;

// In-memory cache for document chunks and parsed embeddings
let knowledgeCache = null;

function invalidateCache() {
  knowledgeCache = null;
  logger.info('🧠 Knowledge base cache invalidated');
}

/**
 * Initialize Embedding Model
 */
async function getEmbeddingModel() {
  const apiKey = await getSetting('GEMINI_API_KEY', 'GEMINI_API_KEY');
  if (!apiKey || apiKey.startsWith('AIzaSyBwmvIaGOLCsOpAxImznix91fM72GSeG-c') || apiKey === 'placeholder') {
    return null;
  }

  if (apiKey !== currentApiKey || !embeddingModel) {
    currentApiKey = apiKey;
    genAI = new GoogleGenerativeAI(apiKey);
    embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    logger.info('✅ Gemini Embedding Model initialized');
  }
  return embeddingModel;
}

/**
 * Split text into chunks with overlap
 */
function chunkText(text, size = 1000, overlap = 200) {
  if (size <= 0) size = 1000;
  if (overlap < 0) overlap = 0;
  if (overlap >= size) overlap = Math.floor(size / 5); // Default to 20% overlap if overlap is too large
  
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += (size - overlap);
  }
  return chunks;
}

/**
 * Calculate Cosine Similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate deterministic mock embedding for dev/mock mode
 */
function getMockEmbedding(text) {
  const vector = [];
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  
  for (let i = 0; i < 768; i++) {
    const val = Math.sin(hash + i);
    vector.push(val);
  }
  return vector;
}

/**
 * Add a new document to the knowledge base
 */
async function addDocument({ title, content, type = 'manual_entry', sourceUrl = null, category = 'general', metadata = {} }) {
  if (!title || !content || content.trim().length === 0) {
    throw new Error('Title and content are required and cannot be empty');
  }

  const model = await getEmbeddingModel();
  const isMock = !model;
  
  if (isMock) {
    logger.warn(`⚠️ Gemini API key not configured. Using mock embeddings for indexing: ${title}`);
  } else {
    logger.info(`📚 Processing document: ${title} (${content.length} chars)`);
  }

  // 1. Create document record
  const docResult = await db.query(
    `INSERT INTO knowledge_documents (title, doc_type, source_url, status, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [title, type, sourceUrl, 'processing', JSON.stringify({ ...metadata, category })]
  );
  
  const docId = docResult.rows[0].id;
  const chunks = chunkText(content);

  try {
    // 2. Generate embeddings and store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let embedding;
      
      if (isMock) {
        embedding = getMockEmbedding(chunk);
      } else {
        try {
          const result = await model.embedContent(chunk);
          embedding = result.embedding.values;
        } catch (embedErr) {
          logger.warn(`Failed to generate Gemini embedding, using mock fallback: ${embedErr.message}`);
          embedding = getMockEmbedding(chunk);
        }
      }

      await db.query(
        `INSERT INTO knowledge_chunks (document_id, content, embedding, chunk_index)
         VALUES ($1, $2, $3, $4)`,
        [docId, chunk, JSON.stringify(embedding), i]
      );
    }

    // 3. Mark as active
    await db.query(
      'UPDATE knowledge_documents SET status = $1, total_chunks = $2 WHERE id = $3',
      ['active', chunks.length, docId]
    );

    // Invalidate the cache to force reload on next search query
    invalidateCache();

    logger.info(`✅ Knowledge document indexed: ${title} (${chunks.length} chunks)`);
    return { success: true, docId, chunks: chunks.length };
  } catch (err) {
    await db.query('UPDATE knowledge_documents SET status = $1 WHERE id = $2', ['failed', docId]);
    logger.error('Failed to index document', { error: err.message, title });
    throw err;
  }
}

/**
 * Update an existing document's content (Quick Edit)
 */
async function updateDocument(docId, newContent) {
  if (!newContent || newContent.trim().length === 0) {
    throw new Error('Content cannot be empty');
  }

  const model = await getEmbeddingModel();
  const isMock = !model;

  // Set processing
  await db.query('UPDATE knowledge_documents SET status = $1 WHERE id = $2', ['processing', docId]);
  
  // Delete old chunks
  await db.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [docId]);

  const chunks = chunkText(newContent);

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let embedding;
      
      if (isMock) {
        embedding = getMockEmbedding(chunk);
      } else {
        try {
          const result = await model.embedContent(chunk);
          embedding = result.embedding.values;
        } catch (embedErr) {
          logger.warn(`Failed to generate Gemini embedding, using mock fallback: ${embedErr.message}`);
          embedding = getMockEmbedding(chunk);
        }
      }

      await db.query(
        `INSERT INTO knowledge_chunks (document_id, content, embedding, chunk_index)
         VALUES ($1, $2, $3, $4)`,
        [docId, chunk, JSON.stringify(embedding), i]
      );
    }

    // Mark as active
    await db.query(
      'UPDATE knowledge_documents SET status = $1, total_chunks = $2 WHERE id = $3',
      ['active', chunks.length, docId]
    );

    invalidateCache();

    logger.info(`✅ Knowledge document updated: ${docId} (${chunks.length} chunks)`);
    return { success: true, docId, chunks: chunks.length };
  } catch (err) {
    await db.query('UPDATE knowledge_documents SET status = $1 WHERE id = $2', ['failed', docId]);
    logger.error('Failed to update document', { error: err.message, docId });
    throw err;
  }
}

/**
 * Get raw content of a document by joining chunks
 */
async function getDocumentContent(docId) {
  const result = await db.query(
    'SELECT content FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index ASC',
    [docId]
  );
  if (result.rows.length === 0) return null;
  return result.rows.map(row => row.content).join('\n\n');
}

/**
 * Find relevant context using embeddings (PGVector or fallback SQLite cosine similarity)
 */
async function findRelevantContext(queryText, limit = 3, testMode = false) {
  if (!queryText) return testMode ? { topContext: '', chunksInfo: [] } : '';

  try {
    const model = await getEmbeddingModel();
    const isMock = !model;

    // Filter condition for Expiry Dates
    // Both PostgreSQL and modern SQLite support JSON extraction. We'll use a unified approach or filter post-query if needed.
    // For simplicity, we can do it in SQL if we know the adapter, but SQLite json_extract works.
    const { getAdapter } = require('../config/database');
    const adapter = getAdapter();
    
    // Check if we have pgvector
    let usePgVector = false;
    if (adapter === 'pg') {
      try {
        const extensionCheck = await db.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
        if (extensionCheck.rows.length > 0) usePgVector = true;
      } catch (e) {
        logger.debug('pgvector extension check failed');
      }
    }

    if (isMock || !usePgVector && !model) {
      // Fallback: word overlap search for dev/mock mode
      logger.info('⚠️ Gemini API key not configured. Using word-matching fallback for semantic search.');
      const queryWords = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      if (queryWords.length === 0) return testMode ? { topContext: '', chunksInfo: [] } : '';

      // Cache chunks in memory for word matching to bypass database calls
      if (!knowledgeCache) {
        logger.info('🧠 Initializing word-matching fallback knowledge cache...');
        const chunks = await db.query(
          `SELECT kc.id, kc.content, kc.document_id, kd.title as document_title
           FROM knowledge_chunks kc
           JOIN knowledge_documents kd ON kc.document_id = kd.id
           WHERE kd.status = $1`,
          ['active']
        );
        knowledgeCache = chunks.rows.map(chunk => ({
          id: chunk.id,
          documentId: chunk.document_id,
          documentTitle: chunk.document_title,
          content: chunk.content
        }));
      }

      const scoredChunks = knowledgeCache.map(chunk => {
        const contentLower = chunk.content.toLowerCase();
        let matchCount = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            matchCount++;
          }
        }
        const score = matchCount / queryWords.length;
        return {
          content: chunk.content,
          docTitle: chunk.documentTitle || 'Doc',
          score
        };
      });

      const topScored = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .filter(c => c.score > 0.1); // reasonable overlap

      const topContext = topScored.map(c => c.content).join('\n\n---\n\n');

      if (testMode) {
        return {
          topContext,
          chunksInfo: topScored.map(c => ({ content: c.content, score: c.score, docTitle: c.docTitle }))
        };
      }

      return topContext;
    }

    // 1. Embed the query
    const result = await model.embedContent(queryText);
    const queryVector = result.embedding.values;



    if (usePgVector) {
      // Perform database level similarity lookup using pgvector
      const queryVectorStr = `[${queryVector.join(',')}]`;
      const pgResult = await db.query(
        `SELECT kc.content, kd.id as document_id, kd.title as document_title, kd.metadata,
                (1 - ((kc.embedding::text)::vector <=> $1::vector)) as similarity
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kc.document_id = kd.id
         WHERE kd.status = 'active' AND kc.embedding IS NOT NULL
         ORDER BY similarity DESC`,
        [queryVectorStr]
      );

      let validRows = pgResult.rows;
      // Handle Expiry
      const now = new Date().toISOString();
      validRows = validRows.filter(row => {
        if (!row.metadata) return true;
        try {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          if (meta.expiresAt && meta.expiresAt < now) return false;
        } catch(e) {}
        return true;
      }).slice(0, limit);

      const topRows = validRows.filter(row => row.similarity > 0.6);
      
      // Analytics: track usage
      if (topRows.length > 0 && !testMode) {
        incrementUsageCount(topRows.map(r => r.document_id));
      }

      if (testMode) {
        return {
          topContext: topRows.map(row => row.content).join('\n\n---\n\n'),
          chunksInfo: topRows.map(row => ({ content: row.content, score: row.similarity, docTitle: row.document_title }))
        };
      }

      return topRows.map(row => row.content).join('\n\n---\n\n');
    }

    // SQLite / Cache Fallback (loads parsed Float arrays into memory once to avoid CPU/OOM deserialize penalty)
    if (!knowledgeCache) {
      logger.info('🧠 Initializing semantic search knowledge cache...');
      const chunks = await db.query(
        `SELECT kc.id, kc.content, kc.embedding, kc.document_id, kd.title as document_title, kd.metadata
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kc.document_id = kd.id
         WHERE kd.status = $1`,
        ['active']
      );

      knowledgeCache = chunks.rows.map(chunk => {
        let chunkVector = chunk.embedding;
        if (typeof chunkVector === 'string') {
          try { chunkVector = JSON.parse(chunkVector); } catch (e) { chunkVector = []; }
        }
        let meta = {};
        if (chunk.metadata) {
          try { meta = typeof chunk.metadata === 'string' ? JSON.parse(chunk.metadata) : chunk.metadata; } catch(e) {}
        }
        return {
          id: chunk.id,
          documentId: chunk.document_id,
          documentTitle: chunk.document_title,
          content: chunk.content,
          embedding: chunkVector,
          metadata: meta
        };
      });
      logger.info(`🧠 Knowledge cache loaded with ${knowledgeCache.length} chunks`);
    }

    const now = new Date().toISOString();
    const scoredChunks = knowledgeCache
      .filter(chunk => {
        if (chunk.metadata && chunk.metadata.expiresAt && chunk.metadata.expiresAt < now) return false;
        return true;
      })
      .map(chunk => {
        return {
          content: chunk.content,
          score: cosineSimilarity(queryVector, chunk.embedding),
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle
        };
      });

    // 3. Sort and return top results
    const topContextObjs = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter(c => c.score > 0.6); // Only relevant ones

    if (topContextObjs.length > 0 && !testMode) {
      incrementUsageCount(topContextObjs.map(c => c.documentId));
    }

    if (testMode) {
      return {
        topContext: topContextObjs.map(c => c.content).join('\n\n---\n\n'),
        chunksInfo: topContextObjs.map(c => ({ content: c.content, score: c.score, docTitle: c.documentTitle }))
      };
    }

    return topContextObjs.map(c => c.content).join('\n\n---\n\n');
  } catch (err) {
    logger.error('Semantic search failed', { error: err.message });
    return testMode ? { topContext: '', chunksInfo: [] } : '';
  }
}

async function incrementUsageCount(docIds) {
  if (!docIds || docIds.length === 0) return;
  const uniqueIds = [...new Set(docIds)];
  
  try {
    // SQLite has json_extract and json_set. PG has jsonb operations.
    // Instead of raw sql, we pull, increment, and push, since traffic isn't crazy high.
    for (const id of uniqueIds) {
      const res = await db.query('SELECT metadata FROM knowledge_documents WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        let meta = res.rows[0].metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
        }
        meta = meta || {};
        meta.usage_count = (meta.usage_count || 0) + 1;
        await db.query('UPDATE knowledge_documents SET metadata = $1 WHERE id = $2', [JSON.stringify(meta), id]);
      }
    }
  } catch (e) {
    logger.error('Failed to increment usage count', e);
  }
}

/**
 * Simple Website Scraper
 */
async function scrapeWebsite(url) {
  try {
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 10000
    });
    
    const html = response.data;
    if (typeof html !== 'string') {
      throw new Error('Response is not HTML/text content');
    }
    
    // Simple HTML to Text (strip tags)
    let text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
      
    return text;
  } catch (err) {
    logger.error('Web scraping failed', { url, error: err.message });
    throw err;
  }
}

module.exports = { addDocument, updateDocument, getDocumentContent, findRelevantContext, scrapeWebsite, invalidateCache };
