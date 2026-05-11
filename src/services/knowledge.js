/**
 * Pro CRM — Knowledge Service (Universal AI Brain)
 * Handles document chunking, embeddings, and semantic search (RAG)
 */
const db = require('../config/database');
const { getSetting } = require('../utils/settings');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const axios = require('axios');

let genAI = null;
let embeddingModel = null;
let currentApiKey = null;

/**
 * Initialize Embedding Model
 */
async function getEmbeddingModel() {
  const apiKey = await getSetting('GEMINI_API_KEY', 'GEMINI_API_KEY');
  if (!apiKey) return null;

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
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Add a new document to the knowledge base
 */
async function addDocument({ title, content, type = 'manual_entry', sourceUrl = null, metadata = {} }) {
  if (!title || !content || content.trim().length === 0) {
    throw new Error('Title and content are required and cannot be empty');
  }

  const model = await getEmbeddingModel();
  if (!model) throw new Error('Gemini API key not configured');

  logger.info(`📚 Processing document: ${title} (${content.length} chars)`);

  // 1. Create document record
  const docResult = await db.query(
    `INSERT INTO knowledge_documents (title, doc_type, source_url, status, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [title, type, sourceUrl, 'processing', JSON.stringify(metadata)]
  );
  
  const docId = docResult.rows[0].id;
  const chunks = chunkText(content);

  try {
    // 2. Generate embeddings and store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await model.embedContent(chunk);
      const embedding = result.embedding.values;

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

    logger.info(`✅ Knowledge document indexed: ${title} (${chunks.length} chunks)`);
    return { success: true, docId, chunks: chunks.length };
  } catch (err) {
    await db.query('UPDATE knowledge_documents SET status = $1 WHERE id = $2', ['failed', docId]);
    logger.error('Failed to index document', { error: err.message, title });
    throw err;
  }
}

/**
 * Find relevant context for a query
 */
async function findRelevantContext(queryText, limit = 5) {
  const model = await getEmbeddingModel();
  if (!model) return '';

  try {
    // 1. Embed the query
    const result = await model.embedContent(queryText);
    const queryVector = result.embedding.values;

    // 2. Fetch all chunks (optimization: could filter by document or metadata)
    // For small-to-medium datasets, in-memory cosine similarity is fine.
    // For large ones, we'd use a vector DB or pgvector.
    const chunks = await db.query('SELECT id, content, embedding FROM knowledge_chunks');
    
    const scoredChunks = chunks.rows.map(chunk => {
      const chunkVector = JSON.parse(chunk.embedding);
      return {
        content: chunk.content,
        score: cosineSimilarity(queryVector, chunkVector)
      };
    });

    // 3. Sort and return top results
    const topContext = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter(c => c.score > 0.6) // Only relevant ones
      .map(c => c.content)
      .join('\n\n---\n\n');

    return topContext;
  } catch (err) {
    logger.error('Semantic search failed', { error: err.message });
    return '';
  }
}

/**
 * Simple Website Scraper
 */
async function scrapeWebsite(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;
    
    // Simple HTML to Text (strip tags)
    let text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    return text;
  } catch (err) {
    logger.error('Web scraping failed', { url, error: err.message });
    throw err;
  }
}

module.exports = { addDocument, findRelevantContext, scrapeWebsite };
