const { v4: uuidv4 } = require('uuid');

// Global queue state
let processingQueue = [];
let isProcessing = false;
let currentTask = null;

// Queue statistics
const queueStats = {
  totalProcessed: 0,
  totalFailed: 0,
  averageProcessingTime: 0,
  startTime: Date.now()
};

/**
 * Add a task to the processing queue
 * @param {Object} ctx - Telegraf context object
 * @param {Function} handler - Handler function to process the task
 * @param {Object} options - Additional options for the task
 */
async function addToQueue(ctx, handler, options = {}) {
  const queueItem = {
    id: uuidv4(),
    userId: ctx.from.id,
    ctx: ctx,
    handler: handler,
    options: options,
    timestamp: new Date(),
    attempts: 0,
    maxAttempts: options.maxAttempts || 3
  };
  
  processingQueue.push(queueItem);
  
  console.log(`📋 Added task to queue: ${queueItem.id} for user ${ctx.from.id}`);
  
  // Show queue position if there are other tasks
  if (processingQueue.length > 1) {
    const position = processingQueue.length - 1;
    const estimatedWait = position * 30; // Rough estimate: 30 seconds per task
    
    await ctx.reply(
      `⏳ **You're in queue!**\n\n` +
      `📍 Position: ${position}\n` +
      `⏰ Estimated wait: ~${estimatedWait}s\n\n` +
      `💡 Your file will be processed automatically.`
    );
  }
  
  // Start processing if not already processing
  if (!isProcessing) {
    processQueue();
  }
  
  return queueItem.id;
}

/**
 * Process the queue sequentially
 */
async function processQueue() {
  if (processingQueue.length === 0) {
    isProcessing = false;
    currentTask = null;
    return;
  }
  
  isProcessing = true;
  currentTask = processingQueue.shift();
  const startTime = Date.now();
  
  console.log(`🔄 Processing task: ${currentTask.id} for user ${currentTask.userId}`);
  
  try {
    // Call the handler function
    await currentTask.handler(currentTask.ctx, currentTask.options);
    
    // Update statistics
    const processingTime = Date.now() - startTime;
    queueStats.totalProcessed++;
    queueStats.averageProcessingTime = (
      (queueStats.averageProcessingTime * (queueStats.totalProcessed - 1) + processingTime) /
      queueStats.totalProcessed
    );
    
    console.log(`✅ Task completed: ${currentTask.id} in ${processingTime}ms`);
    
  } catch (error) {
    console.error(`❌ Task failed: ${currentTask.id}`, error);
    
    // Retry logic
    currentTask.attempts++;
    if (currentTask.attempts < currentTask.maxAttempts) {
      console.log(`🔄 Retrying task: ${currentTask.id} (attempt ${currentTask.attempts + 1})`);
      processingQueue.unshift(currentTask); // Add back to front of queue
    } else {
      queueStats.totalFailed++;
      try {
        await currentTask.ctx.reply('❌ Conversion failed after multiple attempts. Please try again with a different file.');
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }
  
  // Process next item after a short delay
  setTimeout(() => {
    processQueue();
  }, 1000);
}

/**
 * Get current queue position for a user
 * @param {number} userId - User ID to check
 * @returns {number} Position in queue (0 if not in queue)
 */
function getQueuePosition(userId) {
  const index = processingQueue.findIndex(item => item.userId === userId);
  return index >= 0 ? index + 1 : 0;
}

/**
 * Remove a user's task from the queue
 * @param {number} userId - User ID
 * @returns {boolean} Whether task was removed
 */
function removeFromQueue(userId) {
  const initialLength = processingQueue.length;
  processingQueue = processingQueue.filter(item => item.userId !== userId);
  
  const removed = initialLength !== processingQueue.length;
  if (removed) {
    console.log(`🗑️ Removed task for user ${userId} from queue`);
  }
  
  return removed;
}

/**
 * Get queue statistics
 * @returns {Object} Queue statistics
 */
function getQueueStats() {
  const uptime = Date.now() - queueStats.startTime;
  
  return {
    ...queueStats,
    currentQueueLength: processingQueue.length,
    isProcessing: isProcessing,
    currentTaskId: currentTask?.id || null,
    uptime: Math.floor(uptime / 1000), // in seconds
    averageProcessingTime: Math.floor(queueStats.averageProcessingTime)
  };
}

/**
 * Get current queue status message
 * @returns {string} Formatted queue status
 */
function getQueueStatusMessage() {
  const stats = getQueueStats();
  
  let message = `📊 **Queue Status**\n\n`;
  message += `⏳ Current queue: ${stats.currentQueueLength} tasks\n`;
  message += `🔄 Processing: ${stats.isProcessing ? 'Yes' : 'No'}\n`;
  message += `📈 Total processed: ${stats.totalProcessed}\n`;
  message += `❌ Total failed: ${stats.totalFailed}\n`;
  message += `⚡ Avg processing time: ${stats.averageProcessingTime}ms\n`;
  message += `🕐 Uptime: ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`;
  
  return message;
}

/**
 * Clear the entire queue (admin function)
 * @returns {number} Number of tasks cleared
 */
function clearQueue() {
  const clearedCount = processingQueue.length;
  processingQueue = [];
  console.log(`🧹 Queue cleared: ${clearedCount} tasks removed`);
  return clearedCount;
}

/**
 * Get detailed queue information (admin function)
 * @returns {Array} Detailed queue information
 */
function getDetailedQueue() {
  return processingQueue.map((item, index) => ({
    position: index + 1,
    userId: item.userId,
    taskId: item.id,
    timestamp: item.timestamp,
    attempts: item.attempts,
    waitTime: Date.now() - item.timestamp.getTime()
  }));
}

module.exports = {
  addToQueue,
  getQueuePosition,
  removeFromQueue,
  getQueueStats,
  getQueueStatusMessage,
  clearQueue,
  getDetailedQueue
};