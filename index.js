require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const mongoose = require('mongoose');
const cron = require('node-cron');

// Import modules
const User = require('./models/User');
const { resetDailyCredits } = require('./utils/credits');
const { addToQueue } = require('./utils/queue');
const fileHandler = require('./handlers/fileHandler');
const adminCommands = require('./commands/admin');
const userCommands = require('./commands/user');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Use session middleware
bot.use(session());

// Connect to MongoDB with modern options
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('🟢 Connected to MongoDB');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  })
  .catch(err => {
    console.error('🔴 MongoDB connection error:', err);
    process.exit(1);
  });

// Monitor MongoDB connection
mongoose.connection.on('error', (err) => {
  console.error('🔴 MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🟢 MongoDB reconnected');
});

// Middleware to get or create user
bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      let user = await User.findOne({ userId: ctx.from.id });
      if (!user) {
        const source = ctx.startPayload || 'direct';
        user = new User({
          userId: ctx.from.id,
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          source: source,
          freeCredits: parseInt(process.env.DAILY_FREE_CREDITS) || 15,
          paidCredits: 0,
          lastReset: new Date()
        });
        await user.save();
        console.log(`✨ New user registered: ${user.userId} (${user.firstName || 'Unknown'})`);
      }
      
      // Update last activity
      user.lastActivity = new Date();
      await user.save();
      
      ctx.user = user;
    } catch (error) {
      console.error('❌ Error handling user:', error);
      // Don't block the request, but log the error
      ctx.user = null;
    }
  }
  return next();
});

// Middleware to check if user exists (for commands that require user)
bot.use(async (ctx, next) => {
  // Skip user check for some commands
  const skipUserCheck = ['/start'];
  const command = ctx.message?.text?.split(' ')[0];
  
  if (ctx.from && !ctx.user && !skipUserCheck.includes(command)) {
    return ctx.reply('❌ Please start the bot first with /start');
  }
  
  return next();
});

// Register command handlers
userCommands.register(bot);
adminCommands.register(bot);

// Setup file conversion handlers
fileHandler.setupConversionHandlers(bot);

// Handle file uploads with better error handling
bot.on(['document', 'photo', 'audio', 'voice'], async (ctx) => {
  try {
    if (!ctx.user) {
      return ctx.reply('❌ Please start the bot first with /start');
    }
    
    // Check credits
    await resetDailyCredits(ctx.user);
    
    if (ctx.user.freeCredits + ctx.user.paidCredits <= 0) {
      return ctx.reply('❌ No credits remaining! Credits reset daily at 00:00 UTC.', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🛒 Buy Credits', 'buy_credits')],
          [Markup.button.callback('📊 View Credits', 'view_credits')]
        ])
      );
    }

    // Add to queue
    await addToQueue(ctx, fileHandler.processFile);
    
  } catch (error) {
    console.error('❌ File handling error:', error);
    
    // Send user-friendly error message
    const errorMessages = {
      'ECONNREFUSED': '🔧 Service temporarily unavailable. Please try again in a moment.',
      'ETIMEDOUT': '⏰ Request timed out. Please try again.',
      'ENOTFOUND': '🌐 Network error. Please check your connection.',
      'ValidationError': '📝 Invalid file data. Please try a different file.'
    };
    
    const errorType = error.code || error.name || 'Unknown';
    const userMessage = errorMessages[errorType] || '❌ Sorry, something went wrong. Please try again.';
    
    try {
      await ctx.reply(userMessage);
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// Callback query handlers with better error handling
bot.action('formats', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    return userCommands.showFormats(ctx);
  } catch (error) {
    console.error('Formats action error:', error);
    await ctx.answerCbQuery('❌ Error loading formats');
  }
});

bot.action('history', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    return userCommands.showHistory(ctx);
  } catch (error) {
    console.error('History action error:', error);
    await ctx.answerCbQuery('❌ Error loading history');
  }
});

bot.action('view_credits', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    return userCommands.showCredits(ctx);
  } catch (error) {
    console.error('Credits action error:', error);
    await ctx.answerCbQuery('❌ Error loading credits');
  }
});

bot.action('buy_credits', (ctx) => {
  ctx.answerCbQuery();
  ctx.replyWithMarkdown(`
💰 **Buy More Credits**

🔜 Credit purchase system coming soon!

For now, contact admin for premium credits.

💳 **Planned Payment Methods:**
• Credit Card via Stripe
• Cryptocurrency payments
• Telegram Stars
• PayPal

📞 **Contact:** @${process.env.BOT_USERNAME.replace('bot', '')}
  `);
});

// Global error handler
bot.catch((err, ctx) => {
  console.error(`🚨 Bot error for user ${ctx?.from?.id}:`, err);
  
  if (ctx) {
    try {
      const errorMessage = err.description?.includes('message is not modified') 
        ? null // Don't send error for "message not modified"
        : '❌ Something went wrong. Please try again in a moment.';
        
      if (errorMessage) {
        ctx.reply(errorMessage);
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// Daily credit reset job (runs at midnight UTC)
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 Running daily credit reset...');
  try {
    const dailyCredits = parseInt(process.env.DAILY_FREE_CREDITS) || 15;
    const result = await User.updateMany(
      {},
      { 
        freeCredits: dailyCredits,
        lastReset: new Date()
      }
    );
    console.log(`✅ Daily credits reset completed for ${result.modifiedCount} users`);
    
    // Log stats
    const stats = await User.getStats();
    console.log(`📊 Users: ${stats.totalUsers} total, ${stats.activeToday} active today`);
  } catch (error) {
    console.error('❌ Credit reset failed:', error);
  }
});

// Health check endpoint for deployment platforms
const express = require('express');
const app = express();

// Basic middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    mongoReady: mongoose.connection.readyState === 1
  });
});

// Bot stats endpoint (for monitoring)
app.get('/stats', async (req, res) => {
  try {
    const stats = await User.getStats();
    res.json({
      ...stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start bot
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  // Production: Use webhooks
  const webhookPath = '/webhook';
  
  app.use(bot.webhookCallback(webhookPath));
  
  app.listen(PORT, () => {
    console.log(`🚀 Bot server started on port ${PORT}`);
    console.log(`🌐 Webhook URL: ${process.env.WEBHOOK_DOMAIN}${webhookPath}`);
    
    // Set webhook
    bot.telegram.setWebhook(`${process.env.WEBHOOK_DOMAIN}${webhookPath}`)
      .then(() => console.log('✅ Webhook set successfully'))
      .catch(err => console.error('❌ Failed to set webhook:', err));
  });
} else {
  // Development: Use long polling
  app.listen(PORT, () => {
    console.log(`🛠️ Health check server running on port ${PORT}`);
  });
  
  bot.launch().then(() => {
    console.log('🚀 Bot launched in development mode (long polling)');
    console.log(`🤖 Bot username: @${bot.botInfo.username}`);
  }).catch(err => {
    console.error('❌ Failed to launch bot:', err);
    process.exit(1);
  });
}

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  bot.stop('SIGINT');
  mongoose.connection.close();
});

process.once('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  bot.stop('SIGTERM');
  mongoose.connection.close();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Don't exit in production, just log
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, just log
});

module.exports = bot;