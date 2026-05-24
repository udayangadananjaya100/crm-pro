/**
 * Pro CRM — Contact Service
 * Manages customer contacts in the database
 */
const { query, transaction } = require('../config/database');
const { maskPII } = require('../utils/piiMasker');
const logger = require('../utils/logger');

/**
 * Find or create a contact by phone number
 */
async function findOrCreateContact(phoneNumber, displayName = 'Unknown', source = 'whatsapp') {
  // Check if contact exists
  const existing = await query(
    'SELECT * FROM contacts WHERE phone_number = $1',
    [phoneNumber]
  );

  if (existing.rows.length > 0) {
    // Update last message time and source if provided and not default
    await query(
      'UPDATE contacts SET last_message_at = NOW(), display_name = COALESCE(NULLIF($2, \'Unknown\'), display_name), source = COALESCE(NULLIF($3, \'whatsapp\'), source) WHERE id = $1',
      [existing.rows[0].id, displayName, source]
    );
    return existing.rows[0];
  }

  // Create new contact
  const maskedPhone = maskPII(phoneNumber);
  const result = await query(
    `INSERT INTO contacts (phone_number, phone_number_masked, display_name, last_message_at, status, source)
     VALUES ($1, $2, $3, NOW(), 'active', $4)
     RETURNING *`,
    [phoneNumber, maskedPhone, displayName, source || 'whatsapp']
  );

  logger.info('New contact created', { id: result.rows[0].id, name: displayName, source: source || 'whatsapp' });
  return result.rows[0];
}

/**
 * Get contact by ID
 */
async function getContactById(contactId) {
  const result = await query('SELECT * FROM contacts WHERE id = $1', [contactId]);
  return result.rows[0] || null;
}

/**
 * Get contact by phone number
 */
async function getContactByPhone(phoneNumber) {
  const result = await query('SELECT * FROM contacts WHERE phone_number = $1', [phoneNumber]);
  return result.rows[0] || null;
}

/**
 * Update contact status (active, unsubscribed, blocked)
 */
async function updateContactStatus(contactId, status) {
  const result = await query(
    'UPDATE contacts SET status = $2 WHERE id = $1 RETURNING *',
    [contactId, status]
  );
  let contact = result.rows[0];
  if (!contact) {
    contact = await getContactById(contactId);
  }
  logger.info('Contact status updated', { id: contactId, status });
  return contact;
}

/**
 * Update lead score
 */
async function updateLeadScore(contactId, scoreDelta) {
  const result = await query(
    'UPDATE contacts SET lead_score = GREATEST(0, lead_score + $2) WHERE id = $1 RETURNING lead_score',
    [contactId, scoreDelta]
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0].lead_score || 0;
  }
  const contact = await getContactById(contactId);
  return contact?.lead_score || 0;
}

/**
 * Add tags to contact
 */
async function addTags(contactId, newTags) {
  const result = await query(
    `UPDATE contacts SET tags = array_cat(tags, $2::text[]) WHERE id = $1 RETURNING tags`,
    [contactId, newTags]
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0].tags || [];
  }
  const contact = await getContactById(contactId);
  return contact?.tags || [];
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
    contacts: result.rows,
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
  if (result.rows && result.rows.length > 0) {
    return result.rows[0].notes || '';
  }
  const contact = await getContactById(contactId);
  return contact?.notes || '';
}

async function createContact(data) {
  const displayName = data.displayName || data.display_name || data.name;
  const phoneNumber = data.phoneNumber || data.phone_number || data.phone;
  const email = data.email;
  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }
  try {
    const maskedPhone = maskPII(phoneNumber);
    const result = await query(
      `INSERT INTO contacts (phone_number, phone_number_masked, display_name, email, status, last_message_at)
       VALUES ($1, $2, $3, $4, 'active', NOW())
       RETURNING *`,
      [phoneNumber, maskedPhone, displayName || 'Unknown', email]
    );
    logger.info('Contact created manually', { id: result.rows[0].id, name: displayName });
    return result.rows[0];
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.code === '23505') {
      const existing = await query('SELECT * FROM contacts WHERE phone_number = $1', [phoneNumber]);
      if (existing.rows[0]) {
        const result = await query(
          `UPDATE contacts 
           SET display_name = COALESCE($1, display_name),
               email = COALESCE($2, email),
               updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [displayName, email, existing.rows[0].id]
        );
        return result.rows[0];
      }
    }
    throw err;
  }
}

/**
 * Update contact details
 */
async function updateContact(contactId, data) {
  const displayName = data.displayName || data.display_name || data.name;
  const phoneNumber = data.phoneNumber || data.phone_number || data.phone;
  const email = data.email;
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
  let contact = result.rows[0];
  if (!contact) {
    contact = await getContactById(contactId);
  }
  logger.info('Contact details updated', { id: contactId });
  return contact;
}

/**
 * Delete multiple contacts
 */
async function deleteContacts(contactIds) {
  if (!contactIds || contactIds.length === 0) return 0;
  
  // Note: PostgreSQL `ANY($1::uuid[])` is safe against SQL injection
  const result = await query(
    'DELETE FROM contacts WHERE id = ANY($1::uuid[]) RETURNING id',
    [contactIds]
  );
  
  logger.info('Contacts deleted', { count: result.rowCount });
  return result.rowCount;
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
  updateContact,
  deleteContacts
};
