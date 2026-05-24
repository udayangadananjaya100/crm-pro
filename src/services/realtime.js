/**
 * Pro CRM — Real-Time Service (Socket.IO)
 * Provides live dashboard updates, notifications, and typing indicators
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const logger = require('../utils/logger');
const events = require('../utils/events');

let io = null;

// Track connected clients and unread counts
const connectedClients = new Map(); // socketId -> { userId, role }
let notificationQueue = []; // Recent notifications (max 50)

/**
 * Initialize Socket.IO on the existing HTTP server
 */
function initialize(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.isDev ? '*' : env.ADMIN_DASHBOARD_URL,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      socket.userName = decoded.name || decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    connectedClients.set(socket.id, {
      userId: socket.userId,
      role: socket.userRole,
      name: socket.userName,
    });

    logger.info(`🔌 Client connected: ${socket.userName}`, {
      socketId: socket.id,
      total: connectedClients.size,
    });

    // Send recent notifications on connect
    socket.emit('notification:history', notificationQueue.slice(-20));
    socket.emit('connected_users', connectedClients.size);

    // Handle typing events
    socket.on('typing:start', (data) => {
      socket.broadcast.emit('typing:update', {
        conversationId: data.conversationId,
        userName: socket.userName,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data) => {
      socket.broadcast.emit('typing:update', {
        conversationId: data.conversationId,
        userName: socket.userName,
        isTyping: false,
      });
    });

    // Mark notification as read
    socket.on('notification:read', (notifId) => {
      const notif = notificationQueue.find(n => n.id === notifId);
      if (notif) notif.read = true;
    });

    // Mark all notifications as read
    socket.on('notification:read-all', () => {
      notificationQueue.forEach(n => { n.read = true; });
      socket.emit('notification:history', notificationQueue.slice(-20));
    });

    socket.on('disconnect', () => {
      connectedClients.delete(socket.id);
      logger.debug(`🔌 Client disconnected: ${socket.userName}`, {
        total: connectedClients.size,
      });
      io.emit('connected_users', connectedClients.size);
    });
  });

  // Subscribe to appointment events on the local event emitter and broadcast to socket clients
  events.on(events.APPOINTMENT_BOOKED, (data) => {
    if (io) {
      io.emit('appointment:update', { type: 'booked', appointment: data });
      io.emit('stats:update', { trigger: 'appointment_booked' });
    }
  });

  events.on(events.APPOINTMENT_CANCELLED, (data) => {
    if (io) {
      io.emit('appointment:update', { type: 'cancelled', appointment: data });
      io.emit('stats:update', { trigger: 'appointment_cancelled' });
    }
  });

  events.on(events.CAMPAIGN_UPDATED, (data) => {
    if (io) {
      io.emit('campaign:update', data);
      io.emit('stats:update', { trigger: 'campaign_update' });
    }
  });

  logger.info('✅ Real-time WebSocket server initialized');
  return io;
}

/**
 * Emit a new message event to all connected dashboards
 */
function emitNewMessage(messageData) {
  if (!io) return;

  const notification = createNotification(
    messageData.direction === 'inbound' ? 'message_in' : 'message_out',
    messageData.direction === 'inbound'
      ? `New message from ${messageData.contactName || 'Customer'}`
      : `Reply sent to ${messageData.contactName || 'Customer'}`,
    messageData
  );

  io.emit('message:new', messageData);
  
  if (messageData.direction === 'inbound') {
    io.emit('notification:new', notification);
  }

  // Update stats for all
  io.emit('stats:update', { trigger: 'new_message' });
}

/**
 * Emit a conversation update event
 */
function emitConversationUpdate(conversationData) {
  if (!io) return;
  io.emit('conversation:update', conversationData);
  io.emit('stats:update', { trigger: 'conversation_update' });
}

/**
 * Emit a pipeline result (for simulator page)
 */
function emitPipelineResult(result) {
  if (!io) return;
  io.emit('pipeline:result', result);
}

/**
 * Emit an SLA breach alert
 */
function emitSLABreach(data) {
  if (!io) return;

  const notification = createNotification(
    'sla_breach',
    `⚠️ SLA Breach — Conversation ${data.conversationId}`,
    data
  );

  io.emit('notification:new', notification);
  io.emit('sla:breach', data);
}

/**
 * Emit a system alert
 */
function emitSystemAlert(data) {
  if (!io) return;

  const notification = createNotification(
    'system',
    data.message || 'System alert',
    data
  );

  io.emit('notification:new', notification);
}

/**
 * Create a notification object and add to queue
 */
function createNotification(type, message, data = {}) {
  const notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
    read: false,
  };

  notificationQueue.push(notification);
  if (notificationQueue.length > 50) {
    notificationQueue = notificationQueue.slice(-50);
  }

  return notification;
}

/**
 * Get the IO instance
 */
function getIO() {
  return io;
}

/**
 * Get connected client count
 */
function getConnectedCount() {
  return connectedClients.size;
}

module.exports = {
  initialize,
  emitNewMessage,
  emitConversationUpdate,
  emitPipelineResult,
  emitSLABreach,
  emitSystemAlert,
  getIO,
  getConnectedCount,
};
