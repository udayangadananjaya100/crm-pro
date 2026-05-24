const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const events = require('../utils/events');

/**
 * Check if a slot is available
 */
async function isSlotAvailable(date, time) {
  const result = await query(
    'SELECT count(*) as count FROM appointments WHERE appointment_date = $1 AND appointment_time = $2 AND status = $3',
    [date, time, 'confirmed']
  );
  return parseInt(result.rows[0].count) === 0;
}

/**
 * Book a new appointment
 */
async function bookAppointment({ contactId, contactName, contactPhone, date, time, reason }) {
  try {
    // 1. Basic validation
    if (!date || !time) throw new Error('Date and time are required');

    // 2. Check availability
    const available = await isSlotAvailable(date, time);
    if (!available) {
      return { success: false, error: 'Sorry, this slot is already taken.' };
    }

    // 3. Insert appointment
    const id = uuidv4();
    await query(
      `INSERT INTO appointments (id, contact_id, contact_name, contact_phone, appointment_date, appointment_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, contactId, contactName, contactPhone, date, time, reason]
    );

    logger.info('Appointment booked successfully', { id, contactId, date, time });

    // Emit event for real-time dashboard and webhooks
    events.emit(events.APPOINTMENT_BOOKED, {
      id,
      contactId,
      contactName,
      contactPhone,
      date,
      time,
      reason,
      status: 'confirmed'
    });

    return { 
      success: true, 
      id, 
      message: `Appointment confirmed for ${date} at ${time}.` 
    };
  } catch (err) {
    logger.error('Booking failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Cancel an appointment
 */
async function cancelAppointment(id) {
  try {
    const result = await query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      ['cancelled', id]
    );

    let appointment = result.rows[0];
    if (!appointment) {
      const fetchResult = await query("SELECT * FROM appointments WHERE id = $1", [id]);
      appointment = fetchResult.rows[0];
    }

    if (!appointment) {
      return { success: false, error: 'Appointment not found.' };
    }

    logger.info('Appointment cancelled successfully', { id });

    // Emit event for real-time dashboard and webhooks
    events.emit(events.APPOINTMENT_CANCELLED, appointment);

    return { success: true, appointment };
  } catch (err) {
    logger.error('Cancelling appointment failed', { id, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get appointments for a specific date
 */
async function getAppointmentsForDate(date) {
  const result = await query(
    'SELECT * FROM appointments WHERE appointment_date = $1 AND status = $2 ORDER BY appointment_time',
    [date, 'confirmed']
  );
  return result.rows;
}

module.exports = {
  bookAppointment,
  isSlotAvailable,
  getAppointmentsForDate,
  cancelAppointment
};

