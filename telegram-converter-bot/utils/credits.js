const User = require('../models/User');

/**
 * Reset daily credits if it's a new day
 * @param {Object} user - User object from database
 * @returns {Object} Updated user object
 */
async function resetDailyCredits(user) {
  const now = new Date();
  const lastReset = new Date(user.lastReset);
  
  // Check if it's a new day (UTC)
  const isNewDay = (
    now.getUTCDate() !== lastReset.getUTCDate() || 
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCFullYear() !== lastReset.getUTCFullYear()
  );
  
  if (isNewDay) {
    user.freeCredits = parseInt(process.env.DAILY_FREE_CREDITS);
    user.lastReset = now;
    await user.save();
    
    console.log(`✅ Credits reset for user ${user.userId}: ${user.freeCredits} free credits`);
  }
  
  return user;
}

/**
 * Deduct one credit from user account
 * @param {Object} user - User object from database
 * @returns {Promise} Save promise
 */
function deductCredit(user) {
  if (user.paidCredits > 0) {
    user.paidCredits -= 1;
  } else if (user.freeCredits > 0) {
    user.freeCredits -= 1;
  } else {
    throw new Error('No credits available');
  }
  
  user.totalCreditsUsed += 1;
  console.log(`Credit deducted for user ${user.userId}. Remaining: ${user.freeCredits} free, ${user.paidCredits} paid`);
  
  return user.save();
}

/**
 * Add paid credits to user account
 * @param {number} userId - User ID
 * @param {number} credits - Number of credits to add
 * @returns {Promise} Updated user object
 */
async function addPaidCredits(userId, credits) {
  const user = await User.findOne({ userId });
  if (!user) {
    throw new Error('User not found');
  }
  
  user.paidCredits += credits;
  await user.save();
  
  console.log(`Added ${credits} paid credits to user ${userId}. Total paid credits: ${user.paidCredits}`);
  return user;
}

/**
 * Check if user has enough credits
 * @param {Object} user - User object
 * @param {number} required - Required credits (default: 1)
 * @returns {boolean} Whether user has enough credits
 */
function hasEnoughCredits(user, required = 1) {
  return (user.freeCredits + user.paidCredits) >= required;
}

/**
 * Get credit status message
 * @param {Object} user - User object
 * @returns {string} Formatted credit status
 */
function getCreditStatus(user) {
  const totalCredits = user.freeCredits + user.paidCredits;
  
  if (totalCredits === 0) {
    return '❌ No credits remaining';
  }
  
  let status = `💎 **Your Credits:**\n\n`;
  status += `🆓 Free: ${user.freeCredits}/${process.env.DAILY_FREE_CREDITS}\n`;
  
  if (user.paidCredits > 0) {
    status += `💰 Paid: ${user.paidCredits}\n`;
  }
  
  status += `\n⏰ Free credits reset daily at 00:00 UTC`;
  status += `\n🔄 Last reset: ${user.lastReset.toDateString()}`;
  status += `\n📊 Total used: ${user.totalCreditsUsed}`;
  
  return status;
}

/**
 * Get time until next credit reset
 * @returns {string} Time remaining until reset
 */
function getTimeUntilReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  
  const diff = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

/**
 * Process bulk credit reset (for cron job)
 * @returns {Object} Reset statistics
 */
async function processBulkCreditReset() {
  const startTime = Date.now();
  
  try {
    const result = await User.updateMany(
      {},
      { 
        freeCredits: parseInt(process.env.DAILY_FREE_CREDITS),
        lastReset: new Date()
      }
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      success: true,
      usersUpdated: result.modifiedCount,
      duration: `${duration}ms`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  resetDailyCredits,
  deductCredit,
  addPaidCredits,
  hasEnoughCredits,
  getCreditStatus,
  getTimeUntilReset,
  processBulkCreditReset
};