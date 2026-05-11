/**
 * Pro CRM — BullMQ Message Queue
 * Async message processing with retries and dead-letter queue
 */
const { Queue, Worker, QueueScheduler } = require('bullmq');
const { getRedis } = require('../config/redis');
const { processMessage } = require('../pipeline/messagePipeline');
const logger = require('../utils/logger');

const QUEUE_NAME = 'procrm:messages';

let messageQueue = null;
let messageWorker = null;

/**
 * Initialize the message queue
 */
function initQueue() {
  const connection = getRedis();

  messageQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  logger.info('✅ Message queue initialized');
  return messageQueue;
}

/**
 * Add a message to the processing queue
 */
async function enqueueMessage(messageData) {
  if (!messageQueue) initQueue();

  const job = await messageQueue.add('process_message', messageData, {
    priority: messageData.priority || 5,
    delay: 0,
  });

  logger.info('Message enqueued', {
    jobId: job.id,
    from: messageData.from?.slice(-4),
  });

  return job.id;
}

/**
 * Start the message processing worker
 */
function startWorker(concurrency = 5) {
  const connection = getRedis();

  messageWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.info(`Processing job ${job.id}`, {
        attempt: job.attemptsMade + 1,
        from: job.data.from?.slice(-4),
      });

      const result = await processMessage(job.data);

      logger.info(`Job ${job.id} completed`, {
        intent: result.intent,
        action: result.next_action,
        time: `${result.pipeline_time_ms}ms`,
      });

      return result;
    },
    {
      connection,
      concurrency,
      limiter: {
        max: 80,
        duration: 1000, // 80 messages per second (Meta rate limit)
      },
    }
  );

  messageWorker.on('completed', (job, result) => {
    logger.debug(`Job ${job.id} completed successfully`);
  });

  messageWorker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed`, {
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  messageWorker.on('error', (err) => {
    logger.error('Worker error', { error: err.message });
  });

  logger.info(`✅ Message worker started (concurrency: ${concurrency})`);
  return messageWorker;
}

/**
 * Get queue stats
 */
async function getQueueStats() {
  if (!messageQueue) initQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    messageQueue.getWaitingCount(),
    messageQueue.getActiveCount(),
    messageQueue.getCompletedCount(),
    messageQueue.getFailedCount(),
    messageQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Graceful shutdown
 */
async function close() {
  if (messageWorker) {
    await messageWorker.close();
    logger.info('Message worker closed');
  }
  if (messageQueue) {
    await messageQueue.close();
    logger.info('Message queue closed');
  }
}

module.exports = { initQueue, enqueueMessage, startWorker, getQueueStats, close };
