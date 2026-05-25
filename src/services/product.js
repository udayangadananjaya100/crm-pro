/**
 * Pro CRM — Products & Services Service
 * Handles database operations for active products and services
 */
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

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
    return { id, name, description, price, is_active: isActiveVal === 1 };
  } catch (err) {
    logger.error('Error updating product', { error: err.message });
    throw err;
  }
}

async function deleteProduct(id) {
  try {
    await query('DELETE FROM products WHERE id = $1', [id]);
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
