const { Markup } = require('telegraf');
const { deductCredit } = require('../utils/credits');
const path = require('path');
const fs = require('fs').promises;

// Import converters
const imageConverter = require('../converters/image');
const documentConverter = require('../converters/document');
const audioConverter = require('../converters/audio');
const ebookConverter = require('../converters/ebook');
const fontConverter = require('../converters/font');
const subtitleConverter = require('../converters/subtitle');

// File type mappings with detailed info
const FILE_TYPES = {
  image: {
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'tif', 'heic', 'avif', 'ico', 'svg'],
    maxSize: 20 * 1024 * 1024, // 20MB
    converter: imageConverter
  },
  document: {
    extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
    maxSize: 20 * 1024 * 1024, // 20MB
    converter: documentConverter
  },
  audio: {
    extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
    maxSize: 50 * 1024 * 1024, // 50MB
    converter: audioConverter
  },
  ebook: {
    extensions: ['epub', 'mobi', 'azw3', 'fb2', 'cbz', 'djvu'],
    maxSize: 10 * 1024 * 1024, // 10MB
    converter: ebookConverter
  },
  font: {
    extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot'],
    maxSize: 5 * 1024 * 1024, // 5MB
    converter: fontConverter
  },
  subtitle: {
    extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv'],
    maxSize: 1 * 1024 * 1024, // 1MB
    converter: subtitleConverter
  }
};

/**
 * Detect file type from filename or mime type
 * @param {string} filename - File name
 * @param {string} mimeType - MIME type
 * @returns {string} File type category
 */
function detectFileType(filename, mimeType = '') {
  // First try by extension
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  
  for (const [type, config] of Object.entries(FILE_TYPES)) {
    if (config.extensions.includes(ext)) {
      return type;
    }
  }
  
  // Fallback to MIME type detection
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'document';
    if (mimeType.includes('document')) return 'document';
    if (mimeType.includes('text')) return 'document';
  }
  
  return 'unknown';
}

/**
 * Get conversion options for file type
 * @param {string} fileType - File type category
 * @param {string} currentExtension - Current file extension
 * @returns {Array} Array of conversion options
 */
function getConversionOptions(fileType, currentExtension) {
  const options = {
    image: [
      { text: '📱 PNG', callback_data: 'convert_png', desc: 'Best for transparency' },
      { text: '📷 JPG', callback_data: 'convert_jpg', desc: 'Smaller file size' },
      { text: '🌐 WEBP', callback_data: 'convert_webp', desc: 'Modern web format' },
      { text: '🎨 BMP', callback_data: 'convert_bmp', desc: 'Uncompressed' },
      { text: '🖼️ GIF', callback_data: 'convert_gif', desc: 'Animations' },
      { text: '🏢 ICO', callback_data: 'convert_ico', desc: 'Icon format' }
    ],
    document: [
      { text: '📄 PDF', callback_data: 'convert_pdf', desc: 'Preserve formatting' },
      { text: '📝 DOCX', callback_data: 'convert_docx', desc: 'Editable document' },
      { text: '📜 TXT', callback_data: 'convert_txt', desc: 'Plain text' },
      { text: '📋 RTF', callback_data: 'convert_rtf', desc: 'Rich text' },
      { text: '📄 ODT', callback_data: 'convert_odt', desc: 'OpenOffice' }
    ],
    audio: [
      { text: '🎵 MP3', callback_data: 'convert_mp3', desc: 'Most compatible' },
      { text: '🎶 WAV', callback_data: 'convert_wav', desc: 'Lossless quality' },
      { text: '🔊 OGG', callback_data: 'convert_ogg', desc: 'Open source' },
      { text: '💿 FLAC', callback_data: 'convert_flac', desc: 'Lossless compression' },
      { text: '📱 M4A', callback_data: 'convert_m4a', desc: 'Apple format' }
    ],
    ebook: [
      { text: '📚 EPUB', callback_data: 'convert_epub', desc: 'Universal ebook' },
      { text: '📖 MOBI', callback_data: 'convert_mobi', desc: 'Kindle format' },
      { text: '📗 FB2', callback_data: 'convert_fb2', desc: 'FictionBook' },
      { text: '📘 AZW3', callback_data: 'convert_azw3', desc: 'Kindle KF8' }
    ],
    font: [
      { text: '🔤 TTF', callback_data: 'convert_ttf', desc: 'TrueType' },
      { text: '🅾️ OTF', callback_data: 'convert_otf', desc: 'OpenType' },
      { text: '🌐 WOFF', callback_data: 'convert_woff', desc: 'Web font' },
      { text: '⚡ WOFF2', callback_data: 'convert_woff2', desc: 'Modern web' }
    ],
    subtitle: [
      { text: '💬 SRT', callback_data: 'convert_srt', desc: 'Most compatible' },
      { text: '🌐 VTT', callback_data: 'convert_vtt', desc: 'Web standard' },
      { text: '🎬 ASS', callback_data: 'convert_ass', desc: 'Advanced styling' },
      { text: '📝 SUB', callback_data: 'convert_sub', desc: 'MicroDVD' }
    ]
  };
  
  const typeOptions = options[fileType] || [];
  
  // Filter out current format
  return typeOptions.filter(option => {
    const targetExt = option.callback_data.replace('convert_', '');
    return targetExt !== currentExtension.toLowerCase();
  });
}

/**
 * Get file information from Telegram message
 * @param {Object} ctx - Telegraf context
 * @returns {Object} File information
 */
async function getFileInfo(ctx) {
  let fileInfo, filename, fileSize;
  
  if (ctx.message.document) {
    fileInfo = ctx.message.document;
    filename = fileInfo.file_name || `document_${Date.now()}`;
    fileSize = fileInfo.file_size;
  } else if (ctx.message.photo) {
    fileInfo = ctx.message.photo[ctx.message.photo.length - 1];
    filename = `photo_${Date.now()}.jpg`;
    fileSize = fileInfo.file_size;
  } else if (ctx.message.audio) {
    fileInfo = ctx.message.audio;
    filename = fileInfo.file_name || `audio_${Date.now()}.${fileInfo.mime_type?.split('/')[1] || 'mp3'}`;
    fileSize = fileInfo.file_size;
  } else if (ctx.message.voice) {
    fileInfo = ctx.message.voice;
    filename = `voice_${Date.now()}.ogg`;
    fileSize = fileInfo.file_size;
  }
  
  if (!fileInfo) {
    throw new Error('No supported file found in message');
  }
  
  return { fileInfo, filename, fileSize };
}

/**
 * Download file from Telegram
 * @param {Object} ctx - Telegraf context
 * @param {Object} fileInfo - File information
 * @returns {string} Local file path
 */
async function downloadFile(ctx, fileInfo) {
  try {
    const fileLink = await ctx.telegram.getFileLink(fileInfo.file_id);
    const response = await fetch(fileLink);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const tempPath = path.join('/tmp', `input_${Date.now()}_${fileInfo.file_id}`);
    
    await fs.writeFile(tempPath, Buffer.from(buffer));
    return tempPath;
    
  } catch (error) {
    console.error('File download error:', error);
    throw new Error('Failed to download file from Telegram');
  }
}

/**
 * Process uploaded file and show conversion options
 * @param {Object} ctx - Telegraf context
 * @param {Object} options - Processing options
 */
async function processFile(ctx, options = {}) {
  let progressMsg;
  
  try {
    // Show initial progress
    progressMsg = await ctx.reply('⬆️ Analyzing file...');
    
    // Get file information
    const { fileInfo, filename, fileSize } = await getFileInfo(ctx);
    
    // Detect file type
    const fileType = detectFileType(filename, fileInfo.mime_type);
    
    if (fileType === 'unknown') {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        undefined,
        '❌ Unsupported file format. Use /formats to see supported types.'
      );
      return;
    }
    
    // Check file size limits
    const typeConfig = FILE_TYPES[fileType];
    if (fileSize > typeConfig.maxSize) {
      const maxSizeMB = Math.round(typeConfig.maxSize / (1024 * 1024));
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        undefined,
        `❌ File too large! Maximum size for ${fileType} files is ${maxSizeMB}MB.`
      );
      return;
    }
    
    // Get conversion options
    const currentExtension = path.extname(filename).replace('.', '');
    const conversionOptions = getConversionOptions(fileType, currentExtension);
    
    if (conversionOptions.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        undefined,
        '🔄 This file is already in the most optimal format! No conversion needed.'
      );
      return;
    }
    
    // Store file info in session for callback
    ctx.session = ctx.session || {};
    ctx.session.fileInfo = fileInfo;
    ctx.session.filename = filename;
    ctx.session.fileType = fileType;
    ctx.session.fileSize = fileSize;
    
    // Create keyboard with conversion options
    const keyboard = [];
    for (let i = 0; i < conversionOptions.length; i += 2) {
      const row = conversionOptions.slice(i, i + 2).map(option => 
        Markup.button.callback(option.text, option.callback_data)
      );
      keyboard.push(row);
    }
    keyboard.push([Markup.button.callback('❌ Cancel', 'cancel_convert')]);
    
    // Show conversion options
    const fileTypeEmoji = {
      'image': '🖼️',
      'document': '📄',
      'audio': '🎵',
      'ebook': '📚',
      'font': '🔤',
      'subtitle': '💬'
    };
    
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progressMsg.message_id,
      undefined,
      `${fileTypeEmoji[fileType]} **File Ready for Conversion**\n\n` +
      `📁 **Name:** ${filename}\n` +
      `📊 **Type:** ${fileType.charAt(0).toUpperCase() + fileType.slice(1)}\n` +
      `📏 **Size:** ${fileSizeMB}MB\n\n` +
      `⚡ **Choose output format:**`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
    
  } catch (error) {
    console.error('File processing error:', error);
    
    const errorMessage = error.message.includes('file format') 
      ? '❌ Unsupported file format. Use /formats to see supported types.'
      : '❌ Failed to process file. Please try again or contact support.';
    
    if (progressMsg) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          progressMsg.message_id,
          undefined,
          errorMessage
        );
      } catch (editError) {
        await ctx.reply(errorMessage);
      }
    } else {
      await ctx.reply(errorMessage);
    }
  }
}

/**
 * Handle file conversion
 * @param {Object} ctx - Telegraf context
 * @param {string} targetFormat - Target conversion format
 */
async function handleConversion(ctx, targetFormat) {
  const session = ctx.session || {};
  
  if (!session.fileInfo) {
    return ctx.editMessageText('❌ Session expired. Please upload the file again.');
  }
  
  let tempInputPath, tempOutputPath;
  const conversionStart = Date.now();
  
  try {
    // Update UI to show conversion progress
    await ctx.editMessageText('🔄 **Converting...**\n\n⚗️ Processing your file, please wait...');
    
    // Deduct credit first
    await deductCredit(ctx.user);
    
    // Download file
    await ctx.editMessageText('🔄 **Converting...**\n\n⬇️ Downloading file...');
    tempInputPath = await downloadFile(ctx, session.fileInfo);
    
    // Convert file
    await ctx.editMessageText('🔄 **Converting...**\n\n🧪 Converting format...');
    
    const typeConfig = FILE_TYPES[session.fileType];
    const converter = typeConfig.converter;
    
    tempOutputPath = await converter.convert(tempInputPath, targetFormat, {
      quality: ctx.user.preferences.defaultQuality || 'medium',
      originalName: session.filename
    });
    
    // Upload result
    await ctx.editMessageText('🔄 **Converting...**\n\n⬆️ Uploading result...');
    
    const outputFilename = `${path.parse(session.filename).name}.${targetFormat}`;
    const caption = `✅ Converted by @${process.env.BOT_USERNAME}\n🔄 ${session.fileType.toUpperCase()} → ${targetFormat.toUpperCase()}`;
    
    // Send converted file
    await ctx.replyWithDocument({
      source: tempOutputPath,
      filename: outputFilename
    }, {
      caption: caption,
      reply_to_message_id: ctx.message?.message_id
    });
    
    // Calculate processing time
    const processingTime = Math.round((Date.now() - conversionStart) / 1000);
    
    // Add to history
    ctx.user.history.push({
      originalName: session.filename,
      fromType: session.fileType,
      toType: targetFormat,
      status: 'success',
      fileSize: session.fileSize,
      processingTime: processingTime,
      timestamp: new Date()
    });
    
    // Update total conversions counter
    ctx.user.totalConversions += 1;
    await ctx.user.save();
    
    // Delete progress message and show success
    await ctx.deleteMessage();
    await ctx.reply(`🎉 **Conversion completed!**\n\n⚡ Processed in ${processingTime}s\n💎 Credits remaining: ${ctx.user.freeCredits + ctx.user.paidCredits}`);
    
  } catch (error) {
    console.error('Conversion error:', error);
    
    // Update history with failure
    ctx.user.history.push({
      originalName: session.filename,
      fromType: session.fileType,
      toType: targetFormat,
      status: 'failed',
      fileSize: session.fileSize,
      timestamp: new Date()
    });
    await ctx.user.save();
    
    const errorMessages = {
      'UNSUPPORTED_FORMAT': '❌ This conversion is not supported yet.',
      'FILE_TOO_LARGE': '❌ File is too large to process.',
      'CORRUPTED_FILE': '❌ File appears to be corrupted.',
      'PROCESSING_ERROR': '❌ Conversion failed. Please try again.'
    };
    
    const errorMessage = errorMessages[error.code] || '❌ Conversion failed. Please try again or contact support.';
    
    try {
      await ctx.editMessageText(errorMessage);
    } catch (editError) {
      await ctx.reply(errorMessage);
    }
  } finally {
    // Cleanup temporary files
    try {
      if (tempInputPath) await fs.unlink(tempInputPath);
      if (tempOutputPath) await fs.unlink(tempOutputPath);
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    
    // Clear session
    if (ctx.session) {
      delete ctx.session.fileInfo;
      delete ctx.session.filename;
      delete ctx.session.fileType;
      delete ctx.session.fileSize;
    }
  }
}

/**
 * Setup conversion callback handlers
 * @param {Object} bot - Telegraf bot instance
 */
function setupConversionHandlers(bot) {
  // Handle conversion format selection
  bot.action(/convert_(\w+)/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const targetFormat = ctx.match[1];
    await handleConversion(ctx, targetFormat);
  });
  
  // Handle conversion cancellation
  bot.action('cancel_convert', (ctx) => {
    ctx.answerCbQuery();
    ctx.editMessageText('❌ Conversion cancelled.');
    
    // Clear session
    if (ctx.session) {
      delete ctx.session.fileInfo;
      delete ctx.session.filename;
      delete ctx.session.fileType;
      delete ctx.session.fileSize;
    }
  });
}

module.exports = {
  processFile,
  setupConversionHandlers,
  detectFileType,
  getConversionOptions,
  FILE_TYPES
};