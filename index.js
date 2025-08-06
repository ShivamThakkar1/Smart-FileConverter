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

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('🟢 Connected to MongoDB'))
  .catch(err => console.error('🔴 MongoDB connection error:', err));

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
          freeCredits: parseInt(process.env.DAILY_FREE_CREDITS),
          paidCredits: 0,
          lastReset: new Date()
        });
        await user.save();
        console.log(`New user registered: ${user.userId}`);
      }
      
      // Update last activity
      user.lastActivity = new Date();
      await user.save();
      
      ctx.user = user;
    } catch (error) {
      console.error('Error handling user:', error);
    }
  }
  return next();
});

// Register command handlers
userCommands.register(bot);
adminCommands.register(bot);

// Setup file conversion handlers
fileHandler.setupConversionHandlers(bot);

// Handle file uploads
bot.on(['document', 'photo', 'audio', 'voice'], async (ctx) => {
  try {
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
    console.error('File handling error:', error);
    ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
});

// Callback query handlers
bot.action('formats', (ctx) => {
  ctx.answerCbQuery();
  return userCommands.showFormats(ctx);
});

bot.action('history', (ctx) => {
  ctx.answerCbQuery();
  return userCommands.showHistory(ctx);
});

bot.action('view_credits', (ctx) => {
  ctx.answerCbQuery();
  return userCommands.showCredits(ctx);
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
  console.error(`Bot error for ${ctx?.from?.id}:`, err);
  if (ctx) {
    try {
      ctx.reply('❌ Something went wrong. Please try again in a moment.');
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// Daily credit reset job (runs at midnight UTC)
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 Running daily credit reset...');
  try {
    const result = await User.updateMany(
      {},
      { 
        freeCredits: parseInt(process.env.DAILY_FREE_CREDITS),
        lastReset: new Date()
      }
    );
    console.log(`✅ Daily credits reset completed for ${result.modifiedCount} users`);
  } catch (error) {
    console.error('❌ Credit reset failed:', error);
  }
});

// Health check endpoint for Render
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start bot
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  // Production: Use webhooks
  app.use(bot.webhookCallback('/webhook'));
  
  app.listen(PORT, () => {
    console.log(`🚀 Bot server started on port ${PORT}`);
    bot.telegram.setWebhook(`${process.env.WEBHOOK_DOMAIN}/webhook`);
  });
} else {
  // Development: Use long polling
  bot.launch().then(() => {
    console.log('🚀 Bot launched in development mode');
  });
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;