/**
 * Pro CRM — Contact Service
 * Manages customer contacts in the database
 */
const { query, transaction, getAdapter } = require('../config/database');
const { maskPII } = require('../utils/piiMasker');
const logger = require('../utils/logger');

/**
 * Find or create a contact by phone number
 */
async function findOrCreateContact(phoneNumber, displayName = 'Unknown') {
  // Check if contact exists
  const existing = await query(
    'SELECT * FROM contacts WHERE phone_number = $1',
    [phoneNumber]
  );

  if (existing.rows.length > 0) {
    // Update last message time
    await query(
      'UPDATE contacts SET last_message_at = NOW(), display_name = COALESCE(NULLIF($2, \'Unknown\'), display_name) WHERE id = $1',
      [existing.rows[0].id, displayName]
    );
    return existing.rows[0];
  }

  // Create new contact
  const maskedPhone = maskPII(phoneNumber);
  const result = await query(
    `INSERT INTO contacts (phone_number, phone_number_masked, display_name, last_message_at, status)
     VALUES ($1, $2, $3, NOW(), 'active')
     RETURNING *`,
    [phoneNumber, maskedPhone, displayName]
  );

  logger.info('New contact created', { id: result.rows[0].id, name: displayName });
  return result.rows[0];
}

/**
 * Get contact by ID
 */
async function getContactById(contactId) {
  const result = await query('SELECT * FROM contacts WHERE id = $1', [contactId]);
  return normalizeContact(result.rows[0]) || null;
}

/**
 * Get contact by phone number
 */
async function getContactByPhone(phoneNumber) {
  const result = await query('SELECT * FROM contacts WHERE phone_number = $1', [phoneNumber]);
  return normalizeContact(result.rows[0]) || null;
}

/**
 * Update contact status (active, unsubscribed, blocked)
 */
async function updateContactStatus(contactId, status) {
  const result = await query(
    'UPDATE contacts SET status = $2 WHERE id = $1 RETURNING *',
    [contactId, status]
  );
  logger.info('Contact status updated', { id: contactId, status });
  return result.rows[0];
}

/**
 * Update lead score
 */
async function updateLeadScore(contactId, scoreDelta) {
  const result = await query(
    'UPDATE contacts SET lead_score = GREATEST(0, lead_score + $2) WHERE id = $1 RETURNING lead_score',
    [contactId, scoreDelta]
  );
  return result.rows[0]?.lead_score || 0;
}

/**
 * Add tags to contact
 */
async function addTags(contactId, newTags) {
  const tagsToAdd = Array.isArray(newTags) ? newTags : [newTags].filter(Boolean);
  if (getAdapter() === 'sqlite') {
    const existing = await getContactById(contactId);
    const tags = [...new Set([...(existing?.tags || []), ...tagsToAdd])];
    await query('UPDATE contacts SET tags = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
      contactId,
      JSON.stringify(tags),
    ]);
    return tags;
  }

  const result = await query(
    `UPDATE contacts
     SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || $2::text[])))
     WHERE id = $1 RETURNING tags`,
    [contactId, tagsToAdd]
  );
  return result.rows[0]?.tags || [];
}

/**
 * Mark contact as opted out
 */
async function optOutContact(contactId, keyword) {
  return transaction(async (client) => {
    await client.query(
      "UPDATE contacts SET status = 'unsubscribed', opt_in_marketing = false WHERE id = $1",
      [contactId]
    );
    await client.query(
      "INSERT INTO opt_out_log (contact_id, action, keyword_used) VALUES ($1, 'opt_out', $2)",
      [contactId, keyword]
    );
    logger.info('Contact opted out', { contactId, keyword });
    return true;
  });
}

/**
 * Re-subscribe contact
 */
async function optInContact(contactId, keyword) {
  return transaction(async (client) => {
    await client.query(
      "UPDATE contacts SET status = 'active' WHERE id = $1",
      [contactId]
    );
    await client.query(
      "INSERT INTO opt_out_log (contact_id, action, keyword_used) VALUES ($1, 'opt_in', $2)",
      [contactId, keyword]
    );
    logger.info('Contact re-subscribed', { contactId, keyword });
    return true;
  });
}

/**
 * List contacts with pagination
 */
async function listContacts({ page = 1, limit = 20, status, search }) {
  const offset = (page - 1) * limit;
  let conditions = [];
  let params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  if (search) {
    conditions.push(`(display_name ILIKE $${paramIndex} OR phone_number ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM contacts ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT id, phone_number_masked, display_name, status, lead_score, tags, language_preference, last_message_at, created_at
     FROM contacts ${where}
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    contacts: result.rows.map(normalizeContact),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Export all contacts for CSV
 */
async function exportContacts() {
  const result = await query(
    'SELECT display_name, phone_number, email, company, status, lead_score, language_preference, created_at FROM contacts ORDER BY created_at DESC'
  );
  return result.rows;
}

async function updateNotes(contactId, notes) {
  const result = await query(
    'UPDATE contacts SET notes = $2 WHERE id = $1 RETURNING notes',
    [contactId, notes]
  );
  return result.rows[0]?.notes || '';
}

/**
 * Create a contact manually
 */
async function createContact({ displayName, phoneNumber, email }) {
  const maskedPhone = maskPII(phoneNumber);
  const result = await query(
    `INSERT INTO contacts (phone_number, phone_number_masked, display_name, email, status, last_message_at)
     VALUES ($1, $2, $3, $4, 'active', NOW())
     RETURNING *`,
    [phoneNumber, maskedPhone, displayName, email]
  );
  logger.info('Contact created manually', { id: result.rows[0].id, name: displayName });
  return result.rows[0];
}

/**
 * Update contact details
 */
async function updateContact(contactId, { displayName, phoneNumber, email }) {
  const maskedPhone = phoneNumber ? maskPII(phoneNumber) : undefined;
  const result = await query(
    `UPDATE contacts 
     SET display_name = COALESCE($1, display_name),
         phone_number = COALESCE($2, phone_number),
         phone_number_masked = COALESCE($3, phone_number_masked),
         email = COALESCE($4, email),
         updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [displayName, phoneNumber, maskedPhone, email, contactId]
  );
  logger.info('Contact details updated', { id: contactId });
  return result.rows[0];
}

module.exports = {
  findOrCreateContact,
  getContactById,
  getContactByPhone,
  updateContactStatus,
  updateLeadScore,
  addTags,
  updateNotes,
  optOutContact,
  optInContact,
  listContacts,
  exportContacts,
  createContact,
  updateContact
};

function normalizeContact(contact) {
  if (!contact) return contact;
  if (typeof contact.tags === 'string') {
    try {
      contact.tags = JSON.parse(contact.tags);
    } catch (e) {
      contact.tags = contact.tags ? contact.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
    }
  }
  return contact;
}
