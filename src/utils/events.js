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
events.APPOINTMENT_CANCELLED = 'appointment:cancelled';
events.CAMPAIGN_UPDATED = 'campaign:update';

// Phase 6: Automated Webhook Dispatch
const webhookService = require('../services/webhook');

const WEBHOOK_EVENTS = [
  events.MESSAGE_RECEIVED,
  events.MESSAGE_SENT,
  events.CONVERSATION_UPDATED,
  events.AGENT_STATUS_CHANGED,
  events.APPOINTMENT_BOOKED,
  events.APPOINTMENT_CANCELLED,
  events.CAMPAIGN_UPDATED
];

events.onAny = (eventName, payload) => {
  if (WEBHOOK_EVENTS.includes(eventName)) {
    webhookService.dispatchEvent(eventName, payload);
  }
};

// Override emit to catch everything
const originalEmit = events.emit;
events.emit = function(eventName, payload) {
  originalEmit.apply(this, [eventName, payload]);
  if (WEBHOOK_EVENTS.includes(eventName)) {
    webhookService.dispatchEvent(eventName, payload);
  }
};

module.exports = events;
