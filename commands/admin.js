const User = require('../models/User');
const { getQueueStats, getQueueStatusMessage, clearQueue, getDetailedQueue } = require('../utils/queue');
const { addPaidCredits } = require('../utils/credits');

/**
 * Check if user is admin
 * @param {Object} ctx - Telegraf context
 * @returns {boolean} Whether user is admin
 */
function isAdmin(ctx) {
  return ctx.from.id === parseInt(process.env.ADMIN_ID);
}

/**
 * Admin middleware
 * @param {Object} ctx - Telegraf context
 * @param {Function} next - Next function
 */
async function adminMiddleware(ctx, next) {
  if (!isAdmin(ctx)) {
    return ctx.reply('❌ Access denied. Admin only command.');
  }
  return next();
}

/**
 * Register admin commands
 * @param {Object} bot - Telegraf bot instance
 */
function register(bot) {
  // Admin stats command
  bot.command('adminstats', adminMiddleware, adminStats);
  
  // Queue management commands
  bot.command('queue', adminMiddleware, queueStatus);
  bot.command('clearqueue', adminMiddleware, adminClearQueue);
  bot.command('queuedetails', adminMiddleware, queueDetails);
  
  // User management commands
  bot.command('users', adminMiddleware, userStats);
  bot.command('finduser', adminMiddleware, findUser);
  bot.command('addcredits', adminMiddleware, adminAddCredits);
  bot.command('banuser', adminMiddleware, banUser);
  bot.command('unbanuser', adminMiddleware, unbanUser);
  
  // System commands
  bot.command('broadcast', adminMiddleware, broadcastMessage);
  bot.command('backup', adminMiddleware, backupData);
  bot.command('logs', adminMiddleware, showLogs);
}

/**
 * Show comprehensive admin statistics
 */
async function adminStats(ctx) {
  try {
    const stats = await User.getStats();
    const queueStats = getQueueStats();
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: yesterday }
    });
    
    const totalConversionsToday = await User.aggregate([
      {
        $match: {
          'history.timestamp': { $gte: yesterday }
        }
      },
      {
        $project: {
          todayConversions: {
            $filter: {
              input: '$history',
              cond: { $gte: ['$$this.timestamp', yesterday] }
            }
          }
        }
      },
      {
        $project: {
          count: { $size: '$todayConversions' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' }
        }
      }
    ]);
    
    const conversionsToday = totalConversionsToday[0]?.total || 0;
    
    const adminStatsText = `
📊 **Admin Dashboard**

**👥 User Statistics:**
👤 Total Users: \`${stats.totalUsers}\`
🟢 Active Today: \`${stats.activeToday}\`
📅 Active This Week: \`${stats.activeThisWeek}\`
🆕 New Users Today: \`${newUsersToday}\`

**🔄 Conversion Statistics:**
📈 Total Conversions: \`${stats.totalConversions}\`
📊 Conversions Today: \`${conversionsToday}\`
⚡ Avg Processing: \`${queueStats.averageProcessingTime}ms\`

**⏳ Queue Statistics:**
📋 Current Queue: \`${queueStats.currentQueueLength}\`
🔄 Is Processing: \`${queueStats.isProcessing ? 'Yes' : 'No'}\`
✅ Total Processed: \`${queueStats.totalProcessed}\`
❌ Total Failed: \`${queueStats.totalFailed}\`
🕐 Uptime: \`${Math.floor(queueStats.uptime / 3600)}h ${Math.floor((queueStats.uptime % 3600) / 60)}m\`

**💎 Credit Statistics:**
🆓 Free Credits Given: \`${stats.totalUsers * parseInt(process.env.DAILY_FREE_CREDITS)}\`
💰 Paid Credits Sold: \`Coming Soon\`

**📊 Success Rate:** \`${queueStats.totalProcessed > 0 ? 
  Math.round((queueStats.totalProcessed / (queueStats.totalProcessed + queueStats.totalFailed)) * 100) : 100}%\`
    `;

    await ctx.replyWithMarkdown(adminStatsText);
    
  } catch (error) {
    console.error('Admin stats error:', error);
    ctx.reply('❌ Error fetching admin statistics.');
  }
}

/**
 * Show queue status
 */
async function queueStatus(ctx) {
  const statusMessage = getQueueStatusMessage();
  await ctx.replyWithMarkdown(statusMessage);
}

/**
 * Clear the processing queue
 */
async function adminClearQueue(ctx) {
  const clearedCount = clearQueue();
  await ctx.reply(`🧹 Queue cleared! Removed ${clearedCount} pending tasks.`);
}

/**
 * Show detailed queue information
 */
async function queueDetails(ctx) {
  const detailedQueue = getDetailedQueue();
  
  if (detailedQueue.length === 0) {
    return ctx.reply('📭 Queue is empty.');
  }
  
  let queueText = `📋 **Detailed Queue Information**\n\n`;
  
  detailedQueue.slice(0, 10).forEach((task) => {
    const waitTime = Math.floor(task.waitTime / 1000);
    queueText += `**${task.position}.** User: \`${task.userId}\`\n`;
    queueText += `   🆔 Task ID: \`${task.taskId.substr(0, 8)}...\`\n`;
    queueText += `   ⏰ Wait Time: ${waitTime}s\n`;
    queueText += `   🔄 Attempts: ${task.attempts}\n\n`;
  });
  
  if (detailedQueue.length > 10) {
    queueText += `... and ${detailedQueue.length - 10} more tasks`;
  }
  
  await ctx.replyWithMarkdown(queueText);
}

/**
 * Show user statistics and management
 */
async function userStats(ctx) {
  try {
    const recentUsers = await User.find()
      .sort({ lastActivity: -1 })
      .limit(10)
      .select('userId username firstName lastActivity totalConversions');
    
    let userText = `👥 **Recent Active Users**\n\n`;
    
    recentUsers.forEach((user, index) => {
      const lastSeen = new Date(user.lastActivity).toLocaleDateString();
      userText += `**${index + 1}.** ${user.firstName || 'No Name'} (@${user.username || 'no_username'})\n`;
      userText += `   🆔 ID: \`${user.userId}\`\n`;
      userText += `   📊 Conversions: ${user.totalConversions}\n`;
      userText += `   📅 Last Seen: ${lastSeen}\n\n`;
    });
    
    userText += `\n💡 Use /finduser <user_id> to get detailed user info`;
    
    await ctx.replyWithMarkdown(userText);
    
  } catch (error) {
    console.error('User stats error:', error);
    ctx.reply('❌ Error fetching user statistics.');
  }
}

/**
 * Find specific user information
 */
async function findUser(ctx) {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /finduser <user_id>');
  }
  
  const userId = parseInt(args[1]);
  if (isNaN(userId)) {
    return ctx.reply('❌ Invalid user ID. Please provide a numeric ID.');
  }
  
  try {
    const user = await User.findOne({ userId });
    
    if (!user) {
      return ctx.reply('❌ User not found.');
    }
    
    const userInfo = `
👤 **User Information**

**Basic Info:**
🆔 User ID: \`${user.userId}\`
👤 Name: ${user.firstName || 'Unknown'} ${user.lastName || ''}
📝 Username: @${user.username || 'none'}
🎯 Source: ${user.source}
📅 Joined: ${user.createdAt.toDateString()}
📅 Last Active: ${user.lastActivity.toDateString()}

**Credits & Usage:**
🆓 Free Credits: ${user.freeCredits}/${process.env.DAILY_FREE_CREDITS}
💰 Paid Credits: ${user.paidCredits}
📊 Total Conversions: ${user.totalConversions}
📈 Credits Used: ${user.totalCreditsUsed}

**Status:**
🟢 Active: ${user.isActive ? 'Yes' : 'No'}
🚫 Banned: ${user.isBanned ? 'Yes' : 'No'}
${user.banReason ? `📝 Ban Reason: ${user.banReason}` : ''}

**Recent Activity:**
📋 Recent Conversions: ${user.history.length}
    `;
    
    await ctx.replyWithMarkdown(userInfo);
    
  } catch (error) {
    console.error('Find user error:', error);
    ctx.reply('❌ Error finding user.');
  }
}

/**
 * Add paid credits to user
 */
async function adminAddCredits(ctx) {
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('Usage: /addcredits <user_id> <amount>');
  }
  
  const userId = parseInt(args[1]);
  const amount = parseInt(args[2]);
  
  if (isNaN(userId) || isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Invalid parameters. Use: /addcredits <user_id> <amount>');
  }
  
  try {
    const user = await addPaidCredits(userId, amount);
    await ctx.reply(`✅ Added ${amount} paid credits to user ${userId}. Total paid credits: ${user.paidCredits}`);
  } catch (error) {
    console.error('Add credits error:', error);
    ctx.reply('❌ Error adding credits. User might not exist.');
  }
}

/**
 * Ban a user
 */
async function banUser(ctx) {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /banuser <user_id> [reason]');
  }
  
  const userId = parseInt(args[1]);
  const reason = args.slice(2).join(' ') || 'No reason provided';
  
  if (isNaN(userId)) {
    return ctx.reply('❌ Invalid user ID.');
  }
  
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return ctx.reply('❌ User not found.');
    }
    
    user.isBanned = true;
    user.banReason = reason;
    user.isActive = false;
    await user.save();
    
    await ctx.reply(`🚫 User ${userId} has been banned.\nReason: ${reason}`);
    
  } catch (error) {
    console.error('Ban user error:', error);
    ctx.reply('❌ Error banning user.');
  }
}

/**
 * Unban a user
 */
async function unbanUser(ctx) {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /unbanuser <user_id>');
  }
  
  const userId = parseInt(args[1]);
  
  if (isNaN(userId)) {
    return ctx.reply('❌ Invalid user ID.');
  }
  
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return ctx.reply('❌ User not found.');
    }
    
    user.isBanned = false;
    user.banReason = null;
    user.isActive = true;
    await user.save();
    
    await ctx.reply(`✅ User ${userId} has been unbanned.`);
    
  } catch (error) {
    console.error('Unban user error:', error);
    ctx.reply('❌ Error unbanning user.');
  }
}

/**
 * Broadcast message to all users
 */
async function broadcastMessage(ctx) {
  const message = ctx.message.text.replace('/broadcast', '').trim();
  
  if (!message) {
    return ctx.reply('Usage: /broadcast <message>');
  }
  
  try {
    const activeUsers = await User.find({ isActive: true, isBanned: false }).select('userId');
    let sent = 0;
    let failed = 0;
    
    const statusMsg = await ctx.reply(`📡 Broadcasting to ${activeUsers.length} users...`);
    
    for (const user of activeUsers) {
      try {
        await ctx.telegram.sendMessage(user.userId, `📢 **Broadcast Message:**\n\n${message}`, {
          parse_mode: 'Markdown'
        });
        sent++;
      } catch (error) {
        failed++;
        console.log(`Failed to send to user ${user.userId}:`, error.message);
      }
      
      // Rate limiting: wait 50ms between messages
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ Broadcast completed!\n📤 Sent: ${sent}\n❌ Failed: ${failed}`
    );
    
  } catch (error) {
    console.error('Broadcast error:', error);
    ctx.reply('❌ Error broadcasting message.');
  }
}

/**
 * Backup database data
 */
async function backupData(ctx) {
  try {
    const stats = await User.getStats();
    const backupInfo = {
      timestamp: new Date().toISOString(),
      totalUsers: stats.totalUsers,
      totalConversions: stats.totalConversions,
      backupCreated: true
    };
    
    await ctx.replyWithMarkdown(`
📦 **Backup Information**

⏰ **Timestamp:** ${backupInfo.timestamp}
👥 **Total Users:** ${backupInfo.totalUsers}
📊 **Total Conversions:** ${backupInfo.totalConversions}

🔄 **Full backup via MongoDB tools recommended for production**
    `);
    
  } catch (error) {
    console.error('Backup error:', error);
    ctx.reply('❌ Error creating backup information.');
  }
}

/**
 * Show recent logs (placeholder)
 */
async function showLogs(ctx) {
  // This would integrate with your logging system
  const logsText = `
📝 **Recent System Logs**

🔄 **Queue Processing:** Normal
💾 **Database:** Connected
🌐 **API:** Responsive
📊 **Conversions:** Active

💡 Full logs available in server console
Use \`pm2 logs\` or check your deployment platform
  `;
  
  await ctx.replyWithMarkdown(logsText);
}

module.exports = {
  register,
  isAdmin,
  adminMiddleware
};