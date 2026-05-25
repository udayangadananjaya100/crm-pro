/**
 * Pro CRM — Products & Services Service
 * Handles database operations for active products and services
 */
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const knowledgeService = require('./knowledge');

function formatProductKnowledgeContent({ name, description, price, is_active }) {
  const statusText = (is_active === true || is_active === 1 || is_active === '1' || is_active === 'true') ? 'Active' : 'Inactive';
  const priceText = price ? `$${parseFloat(price).toFixed(2)}` : 'Price on request';
  return `Product/Service Details:
- Name: ${name}
- Price: ${priceText}
- Status: ${statusText} (Only active products are marketed by the AI)
- Description: ${description || 'No description available.'}`;
}

async function listProducts() {
  try {
    const result = await query('SELECT * FROM products ORDER BY name ASC');
    return result.rows;
  } catch (err) {
    logger.error('Error listing products', { error: err.message });
    return [];
  }
}

async function createProduct({ name, description, price, is_active }) {
  try {
    const id = uuidv4();
    const isActiveVal = (is_active === true || is_active === 1 || is_active === '1') ? 1 : 0;
    await query(
      'INSERT INTO products (id, name, description, price, is_active) VALUES ($1, $2, $3, $4, $5)',
      [id, name, description || null, price ? parseFloat(price) : null, isActiveVal]
    );

    // Sync to Knowledge Base
    try {
      const content = formatProductKnowledgeContent({ name, description, price, is_active });
      const kbDoc = await knowledgeService.addDocument({
        title: `Product: ${name}`,
        content,
        type: 'product',
        category: 'products',
        metadata: { product_id: id }
      });
      if (isActiveVal === 0) {
        await query("UPDATE knowledge_documents SET status = 'inactive' WHERE id = $1", [kbDoc.docId]);
      }
    } catch (kbErr) {
      logger.error('Failed to sync created product to knowledge base', { productId: id, error: kbErr.message });
    }

    return { id, name, description, price, is_active: isActiveVal === 1 };
  } catch (err) {
    logger.error('Error creating product', { error: err.message });
    throw err;
  }
}

async function updateProduct(id, { name, description, price, is_active }) {
  try {
    const isActiveVal = (is_active === true || is_active === 1 || is_active === '1') ? 1 : 0;
    await query(
      'UPDATE products SET name = $1, description = $2, price = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
      [name, description || null, price ? parseFloat(price) : null, isActiveVal, id]
    );

    // Sync update to Knowledge Base
    try {
      const result = await query("SELECT id, metadata FROM knowledge_documents WHERE doc_type = 'product'");
      let kbDocId = null;
      for (const row of result.rows) {
        let meta = row.metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
        }
        if (meta && meta.product_id === id) {
          kbDocId = row.id;
          break;
        }
      }

      const content = formatProductKnowledgeContent({ name, description, price, is_active });

      if (kbDocId) {
        await knowledgeService.updateDocument(kbDocId, content);
        await query(
          "UPDATE knowledge_documents SET title = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
          [`Product: ${name}`, isActiveVal === 1 ? 'active' : 'inactive', kbDocId]
        );
      } else {
        const kbDoc = await knowledgeService.addDocument({
          title: `Product: ${name}`,
          content,
          type: 'product',
          category: 'products',
          metadata: { product_id: id }
        });
        if (isActiveVal === 0) {
          await query("UPDATE knowledge_documents SET status = 'inactive' WHERE id = $1", [kbDoc.docId]);
        }
      }
    } catch (kbErr) {
      logger.error('Failed to sync product update to knowledge base', { productId: id, error: kbErr.message });
    }

    return { id, name, description, price, is_active: isActiveVal === 1 };
  } catch (err) {
    logger.error('Error updating product', { error: err.message });
    throw err;
  }
}

async function deleteProduct(id) {
  try {
    await query('DELETE FROM products WHERE id = $1', [id]);

    // Sync delete to Knowledge Base
    try {
      const result = await query("SELECT id, metadata FROM knowledge_documents WHERE doc_type = 'product'");
      let kbDocId = null;
      for (const row of result.rows) {
        let meta = row.metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
        }
        if (meta && meta.product_id === id) {
          kbDocId = row.id;
          break;
        }
      }

      if (kbDocId) {
        await query("DELETE FROM knowledge_documents WHERE id = $1", [kbDocId]);
        knowledgeService.invalidateCache();
      }
    } catch (kbErr) {
      logger.error('Failed to sync product deletion to knowledge base', { productId: id, error: kbErr.message });
    }

    return true;
  } catch (err) {
    logger.error('Error deleting product', { error: err.message });
    throw err;
  }
}

async function toggleProductStatus(id, is_active) {
  try {
    const isActiveVal = (is_active === true || is_active === 1 || is_active === '1' || is_active === 'true') ? 1 : 0;
    await query(
      'UPDATE products SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [isActiveVal, id]
    );

    // Sync toggle status to Knowledge Base
    try {
      const result = await query("SELECT id, metadata FROM knowledge_documents WHERE doc_type = 'product'");
      let kbDocId = null;
      for (const row of result.rows) {
        let meta = row.metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
        }
        if (meta && meta.product_id === id) {
          kbDocId = row.id;
          break;
        }
      }

      if (kbDocId) {
        // Fetch current product details to rewrite description with correct status
        const prodResult = await query("SELECT * FROM products WHERE id = $1", [id]);
        if (prodResult.rows.length > 0) {
          const prod = prodResult.rows[0];
          const content = formatProductKnowledgeContent({
            name: prod.name,
            description: prod.description,
            price: prod.price,
            is_active: isActiveVal === 1
          });
          await knowledgeService.updateDocument(kbDocId, content);
        }
        await query(
          "UPDATE knowledge_documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [isActiveVal === 1 ? 'active' : 'inactive', kbDocId]
        );
      }
    } catch (kbErr) {
      logger.error('Failed to sync product toggle status to knowledge base', { productId: id, error: kbErr.message });
    }

    return { id, is_active: isActiveVal === 1 };
  } catch (err) {
    logger.error('Error toggling product status', { error: err.message });
    throw err;
  }
}

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus
};
