const { Markup } = require('telegraf');
const { resetDailyCredits, getCreditStatus, getTimeUntilReset } = require('../utils/credits');

/**
 * Register all user commands
 * @param {Object} bot - Telegraf bot instance
 */
function register(bot) {
  // Start command
  bot.start(async (ctx) => {
    const source = ctx.startPayload;
    if (source && ctx.user.source === 'direct') {
      ctx.user.source = source;
      ctx.user.referralSource = source;
      await ctx.user.save();
    }

    const welcomeMessage = `
🎉 **Welcome to File Converter Bot!**

Transform your files instantly with these powerful features:

📄 **Documents** - PDF, DOC, DOCX, TXT, RTF
🖼 **Images** - PNG, JPG, WEBP, BMP, GIF
🎵 **Audio** - MP3, WAV, OGG, FLAC *(coming soon)*
📚 **eBooks** - EPUB, MOBI, FB2, CBZ
🔤 **Fonts** - TTF, WOFF, OTF, EOT
💬 **Subtitles** - SRT, VTT, ASS, SUB

💎 **Your Credits:**
🆓 Free: ${ctx.user.freeCredits}/${process.env.DAILY_FREE_CREDITS} (resets daily)
${ctx.user.paidCredits > 0 ? `💰 Paid: ${ctx.user.paidCredits}` : ''}

🚀 **Get Started:** Just send me any file!
    `;

    await ctx.replyWithMarkdown(welcomeMessage, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📋 Formats', 'formats'),
          Markup.button.callback('📊 History', 'history')
        ],
        [
          Markup.button.callback('💎 Credits', 'view_credits'),
          Markup.button.callback('❓ Help', 'help')
        ]
      ])
    );
  });

  // Help command
  bot.help((ctx) => showHelp(ctx));
  
  bot.action('help', (ctx) => {
    ctx.answerCbQuery();
    return showHelp(ctx);
  });

  // Credits command
  bot.command('credits', (ctx) => showCredits(ctx));

  // Formats command
  bot.command('formats', (ctx) => showFormats(ctx));

  // History command  
  bot.command('history', (ctx) => showHistory(ctx));

  // Cancel command
  bot.command('cancel', (ctx) => {
    const { removeFromQueue } = require('../utils/queue');
    const removed = removeFromQueue(ctx.from.id);
    
    if (removed) {
      ctx.reply('❌ Your conversion has been cancelled and removed from queue.');
    } else {
      ctx.reply('ℹ️ No active conversion to cancel.');
    }
  });

  // Settings command
  bot.command('settings', (ctx) => showSettings(ctx));
}

/**
 * Show help information
 */
async function showHelp(ctx) {
  const helpText = `
🤖 **Bot Commands:**

**Basic Commands:**
/start - Start the bot & see welcome
/help - Show this help message
/formats - View all supported formats
/history - Your conversion history
/credits - Check your credit balance
/cancel - Cancel current conversion
/settings - Bot preferences

**How to Convert Files:**
1. 📤 Send me any supported file
2. 🎯 Choose your desired output format
3. ⏳ Wait for the magic to happen!
4. 📥 Download your converted file

**Credit System:**
💎 Get ${process.env.DAILY_FREE_CREDITS} free conversions daily
🔄 Credits reset at 00:00 UTC automatically
💰 Buy additional credits for unlimited use
📊 Track usage in your history

**File Size Limits:**
📄 Documents: Up to 20MB
🖼 Images: Up to 20MB  
🎵 Audio: Up to 50MB
📚 eBooks: Up to 10MB

**Tips for Best Results:**
✅ Use clear, readable file names
✅ Ensure files aren't corrupted
✅ Choose appropriate output formats
✅ Check format compatibility for your device

Need more help? Contact @${process.env.BOT_USERNAME.replace('bot', '')}
  `;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📋 Formats', 'formats'),
      Markup.button.callback('💎 Credits', 'view_credits')
    ],
    [Markup.button.callback('🔙 Back to Start', 'back_to_start')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(helpText, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.replyWithMarkdown(helpText, keyboard);
  }
}

/**
 * Show credit information
 */
async function showCredits(ctx) {
  await resetDailyCredits(ctx.user);
  
  const creditsText = getCreditStatus(ctx.user);
  const timeUntilReset = getTimeUntilReset();
  
  const fullText = `${creditsText}\n\n⏳ **Next reset in:** ${timeUntilReset}`;
  
  const keyboard = [];
  
  // Add buy credits button if no credits
  if (ctx.user.freeCredits + ctx.user.paidCredits === 0) {
    keyboard.push([Markup.button.callback('🛒 Buy Credits', 'buy_credits')]);
  }
  
  // Add history and formats buttons
  keyboard.push([
    Markup.button.callback('📊 History', 'history'),
    Markup.button.callback('📋 Formats', 'formats')
  ]);
  
  if (ctx.callbackQuery) {
    await ctx.editMessageText(fullText, { 
      parse_mode: 'Markdown', 
      reply_markup: { inline_keyboard: keyboard }
    });
  } else {
    await ctx.replyWithMarkdown(fullText, Markup.inlineKeyboard(keyboard));
  }
}

/**
 * Show supported formats
 */
async function showFormats(ctx) {
  const formatsText = `
📋 **Supported File Formats**

**📄 Documents**
\`PDF\` \`DOC\` \`DOCX\` \`TXT\` \`RTF\` \`ODT\`
*Perfect for reports, letters, and documentation*

**📊 Spreadsheets** 
\`XLS\` \`XLSX\` \`ODS\` \`CSV\`
*Financial data, lists, and calculations*

**🖼 Images**
\`PNG\` \`JPG\` \`JPEG\` \`WEBP\` \`BMP\` \`GIF\`
\`TIFF\` \`TIF\` \`ICO\` \`HEIC\` \`AVIF\` \`SVG\`
*Photos, graphics, logos, and artwork*

**📚 eBooks**
\`EPUB\` \`MOBI\` \`AZW3\` \`FB2\` \`CBZ\` \`DJVU\`
*Digital books and comic collections*

**🔤 Fonts**
\`TTF\` \`OTF\` \`WOFF\` \`WOFF2\` \`EOT\`
*Typography for web and print*

**💬 Subtitles**
\`SRT\` \`VTT\` \`ASS\` \`SSA\` \`SUB\` \`SBV\`
*Video captions and subtitles*

**🎵 Audio** *(Coming Soon)*
\`MP3\` \`WAV\` \`OGG\` \`FLAC\` \`M4A\` \`AAC\`

**💡 Format Notes:**
• **WEBP** - Smaller size, modern browsers
• **HEIC** - iPhone photos (iOS 11+)
• **AVIF** - Next-gen image format
• **EPUB** - Universal ebook format
• **SRT** - Most compatible subtitle format

🚀 **Just send any file to get started!**
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📤 Send File', 'send_file_prompt')],
    [Markup.button.callback('🔙 Back', 'back_to_start')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(formatsText, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.replyWithMarkdown(formatsText, keyboard);
  }
}

/**
 * Show conversion history
 */
async function showHistory(ctx) {
  if (!ctx.user.history || ctx.user.history.length === 0) {
    const noHistoryText = `
📭 **No Conversion History**

You haven't converted any files yet!

🚀 **Get Started:**
Send me any supported file and I'll convert it for you.

💡 **Popular Conversions:**
• PDF → DOCX (editable documents)
• PNG → JPG (smaller file size)
• HEIC → JPG (iPhone photos to universal)
• DOCX → PDF (preserve formatting)
    `;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📋 View Formats', 'formats')],
      [Markup.button.callback('🔙 Back', 'back_to_start')]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(noHistoryText, { parse_mode: 'Markdown', ...keyboard });
    } else {
      await ctx.replyWithMarkdown(noHistoryText, keyboard);
    }
    return;
  }

  // Show recent conversions (last 10)
  const recent = ctx.user.history.slice(-10).reverse();
  let historyText = `📊 **Your Recent Conversions**\n\n`;
  
  recent.forEach((item, index) => {
    const date = new Date(item.timestamp).toLocaleDateString();
    const time = new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const statusEmoji = item.status === 'success' ? '✅' : item.status === 'failed' ? '❌' : '⏳';
    
    historyText += `**${index + 1}.** ${item.originalName}\n`;
    historyText += `   📝 ${item.fromType.toUpperCase()} → ${item.toType.toUpperCase()}\n`;
    historyText += `   📅 ${date} ${time} ${statusEmoji}\n`;
    
    if (item.processingTime > 0) {
      historyText += `   ⚡ ${item.processingTime}s\n`;
    }
    historyText += `\n`;
  });

  historyText += `📈 **Total Conversions:** ${ctx.user.totalConversions}\n`;
  historyText += `📊 **Credits Used:** ${ctx.user.totalCreditsUsed}`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('💎 Credits', 'view_credits'),
      Markup.button.callback('📋 Formats', 'formats')
    ],
    [Markup.button.callback('🔙 Back', 'back_to_start')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(historyText, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.replyWithMarkdown(historyText, keyboard);
  }
}

/**
 * Show user settings
 */
async function showSettings(ctx) {
  const user = ctx.user;
  const settingsText = `
⚙️ **Bot Settings**

**🌐 Language:** ${user.preferences.language.toUpperCase()}
**🔔 Notifications:** ${user.preferences.notifications ? 'Enabled' : 'Disabled'}  
**📱 Default Quality:** ${user.preferences.defaultQuality.charAt(0).toUpperCase() + user.preferences.defaultQuality.slice(1)}

**📊 Account Info:**
👤 **User ID:** \`${user.userId}\`
📅 **Member Since:** ${user.createdAt.toDateString()}
🎯 **Source:** ${user.source}
📈 **Total Conversions:** ${user.totalConversions}
  `;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🌐 Language', 'setting_language'),
      Markup.button.callback('🔔 Notifications', 'setting_notifications')
    ],
    [
      Markup.button.callback('📱 Quality', 'setting_quality'),
      Markup.button.callback('🔙 Back', 'back_to_start')
    ]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(settingsText, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.replyWithMarkdown(settingsText, keyboard);
  }
}

// Additional callback handlers
bot.action('send_file_prompt', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('📤 Send me any file and I\'ll show you the available conversion options!');
});

bot.action('back_to_start', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  return ctx.scene.enter('start');
});

// Settings callbacks (placeholder for future implementation)
bot.action('setting_language', (ctx) => {
  ctx.answerCbQuery('🔜 Language settings coming soon!');
});

bot.action('setting_notifications', (ctx) => {
  ctx.answerCbQuery('🔜 Notification settings coming soon!');
});

bot.action('setting_quality', (ctx) => {
  ctx.answerCbQuery('🔜 Quality settings coming soon!');
});

module.exports = {
  register,
  showHelp,
  showCredits,
  showFormats,
  showHistory,
  showSettings
};