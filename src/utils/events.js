/**
 * Pro CRM — Event Bus
 * Simple event emitter for real-time dashboard updates
 */
const EventEmitter = require('events');

class SystemEvents extends EventEmitter {}

const events = new SystemEvents();

// Standard event types
events.MESSAGE_RECEIVED = 'message:received';
events.MESSAGE_SENT = 'message:sent';
events.CONVERSATION_UPDATED = 'conversation:updated';
events.AGENT_STATUS_CHANGED = 'agent:status';
events.APPOINTMENT_BOOKED = 'appointment:booked';

// Phase 6: Automated Webhook Dispatch
const webhookService = require('../services/webhook');

events.onAny = (eventName, payload) => {
  webhookService.dispatchEvent(eventName, payload);
};

// Override emit to catch everything
const originalEmit = events.emit;
events.emit = function(eventName, payload) {
  originalEmit.apply(this, [eventName, payload]);
  webhookService.dispatchEvent(eventName, payload);
};

module.exports = events;
