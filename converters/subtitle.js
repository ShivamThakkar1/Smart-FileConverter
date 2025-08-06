const fs = require('fs').promises;
const path = require('path');

/**
 * Convert subtitle to specified format
 * @param {string} inputPath - Path to input subtitle file
 * @param {string} outputFormat - Target format (srt, vtt, ass, etc.)
 * @param {Object} options - Conversion options
 * @returns {string} Path to converted file
 */
async function convert(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  try {
    console.log(`Converting subtitle: ${path.basename(inputPath)} → ${outputFormat}`);
    
    const inputFormat = path.extname(inputPath).toLowerCase().replace('.', '');
    
    // Read and parse input subtitle file
    const inputContent = await fs.readFile(inputPath, 'utf8');
    const subtitleData = parseSubtitle(inputContent, inputFormat);
    
    if (!subtitleData || subtitleData.length === 0) {
      throw new Error('No subtitle data found or invalid format');
    }
    
    // Convert to target format
    const outputContent = formatSubtitle(subtitleData, outputFormat, options);
    
    // Write output file
    await fs.writeFile(outputPath, outputContent, 'utf8');
    
    console.log(`Subtitle conversion successful: ${inputPath} → ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Subtitle conversion error:', error);
    
    // Clean up on error
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Throw specific error types
    if (error.message.includes('No subtitle data') || error.message.includes('invalid format')) {
      const err = new Error('Invalid or corrupted subtitle file');
      err.code = 'CORRUPTED_FILE';
      throw err;
    }
    
    if (error.message.includes('not supported')) {
      const err = new Error('Subtitle format not supported');
      err.code = 'UNSUPPORTED_FORMAT';
      throw err;
    }
    
    const err = new Error('Subtitle processing failed');
    err.code = 'PROCESSING_ERROR';
    throw err;
  }
}

/**
 * Parse subtitle content based on format
 * @param {string} content - Subtitle file content
 * @param {string} format - Input format
 * @returns {Array} Parsed subtitle entries
 */
function parseSubtitle(content, format) {
  switch (format.toLowerCase()) {
    case 'srt':
      return parseSRT(content);
    case 'vtt':
      return parseVTT(content);
    case 'ass':
    case 'ssa':
      return parseASS(content);
    case 'sub':
      return parseSUB(content);
    case 'sbv':
      return parseSBV(content);
    default:
      throw new Error(`Unsupported input format: ${format}`);
  }
}

/**
 * Format subtitle data to target format
 * @param {Array} subtitleData - Parsed subtitle entries
 * @param {string} format - Output format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted subtitle content
 */
function formatSubtitle(subtitleData, format, options = {}) {
  switch (format.toLowerCase()) {
    case 'srt':
      return formatSRT(subtitleData, options);
    case 'vtt':
      return formatVTT(subtitleData, options);
    case 'ass':
      return formatASS(subtitleData, options);
    case 'ssa':
      return formatSSA(subtitleData, options);
    case 'sub':
      return formatSUB(subtitleData, options);
    case 'sbv':
      return formatSBV(subtitleData, options);
    default:
      throw new Error(`Unsupported output format: ${format}`);
  }
}

/**
 * Parse SRT subtitle format
 * @param {string} content - SRT content
 * @returns {Array} Parsed subtitle entries
 */
function parseSRT(content) {
  const entries = [];
  const blocks = content.trim().split(/\n\s*\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    
    const index = parseInt(lines[0]);
    const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    
    if (timeMatch) {
      const startTime = timeToMilliseconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
      const endTime = timeToMilliseconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      const text = lines.slice(2).join('\n');
      
      entries.push({
        index,
        startTime,
        endTime,
        text: text.trim(),
        style: {}
      });
    }
  }
  
  return entries;
}

/**
 * Parse VTT subtitle format
 * @param {string} content - VTT content
 * @returns {Array} Parsed subtitle entries
 */
function parseVTT(content) {
  const entries = [];
  const lines = content.split('\n');
  let i = 0;
  
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }
  
  let index = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
      
      if (timeMatch) {
        const startTime = timeToMilliseconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
        const endTime = timeToMilliseconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
        
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i]);
          i++;
        }
        
        entries.push({
          index: index++,
          startTime,
          endTime,
          text: textLines.join('\n').trim(),
          style: {}
        });
      }
    }
    i++;
  }
  
  return entries;
}

/**
 * Parse ASS/SSA subtitle format (simplified)
 * @param {string} content - ASS content
 * @returns {Array} Parsed subtitle entries
 */
function parseASS(content) {
  const entries = [];
  const lines = content.split('\n');
  let index = 1;
  
  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      const parts = line.substring(9).split(',');
      if (parts.length >= 10) {
        const startTime = assTimeToMilliseconds(parts[1]);
        const endTime = assTimeToMilliseconds(parts[2]);
        const text = parts.slice(9).join(',').replace(/\{[^}]*\}/g, ''); // Remove ASS tags
        
        entries.push({
          index: index++,
          startTime,
          endTime,
          text: text.trim(),
          style: {
            style: parts[3],
            name: parts[4]
          }
        });
      }
    }
  }
  
  return entries;
}

/**
 * Parse SUB subtitle format (MicroDVD)
 * @param {string} content - SUB content
 * @returns {Array} Parsed subtitle entries
 */
function parseSUB(content) {
  const entries = [];
  const lines = content.trim().split('\n');
  let index = 1;
  
  for (const line of lines) {
    const match = line.match(/\{(\d+)\}\{(\d+)\}(.+)/);
    if (match) {
      const startFrame = parseInt(match[1]);
      const endFrame = parseInt(match[2]);
      const text = match[3].replace(/\|/g, '\n'); // | represents line breaks in SUB
      
      // Convert frames to milliseconds (assuming 25fps)
      const fps = 25;
      const startTime = Math.round((startFrame / fps) * 1000);
      const endTime = Math.round((endFrame / fps) * 1000);
      
      entries.push({
        index: index++,
        startTime,
        endTime,
        text: text.trim(),
        style: {}
      });
    }
  }
  
  return entries;
}

/**
 * Parse SBV subtitle format (YouTube)
 * @param {string} content - SBV content
 * @returns {Array} Parsed subtitle entries
 */
function parseSBV(content) {
  const entries = [];
  const blocks = content.trim().split(/\n\s*\n/);
  let index = 1;
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    const timeMatch = lines[0].match(/(\d+):(\d{2}):(\d{2})\.(\d{3}),(\d+):(\d{2}):(\d{2})\.(\d{3})/);
    
    if (timeMatch) {
      const startTime = timeToMilliseconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
      const endTime = timeToMilliseconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      const text = lines.slice(1).join('\n');
      
      entries.push({
        index: index++,
        startTime,
        endTime,
        text: text.trim(),
        style: {}
      });
    }
  }
  
  return entries;
}

/**
 * Format subtitle data as SRT
 * @param {Array} subtitleData - Subtitle entries
 * @param {Object} options - Formatting options
 * @returns {string} SRT formatted content
 */
function formatSRT(subtitleData, options) {
  let output = '';
  
  for (let i = 0; i < subtitleData.length; i++) {
    const entry = subtitleData[i];
    const startTime = millisecondsToSRTTime(entry.startTime);
    const endTime = millisecondsToSRTTime(entry.endTime);
    
    output += `${i + 1}\n`;
    output += `${startTime} --> ${endTime}\n`;
    output += `${entry.text}\n\n`;
  }
  
  return output.trim();
}

/**
 * Format subtitle data as VTT
 * @param {Array} subtitleData - Subtitle entries
 * @param {Object} options - Formatting options
 * @returns {string} VTT formatted content
 */
function formatVTT(subtitleData, options) {
  let output = 'WEBVTT\n\n';
  
  for (const entry of subtitleData) {
    const startTime = millisecondsToVTTTime(entry.startTime);
    const endTime = millisecondsToVTTTime(entry.endTime);
    
    output += `${startTime} --> ${endTime}\n`;
    output += `${entry.text}\n\n`;
  }
  
  return output.trim();
}

/**
 * Format subtitle data as ASS
 * @param {Array} subtitleData - Subtitle entries
 * @param {Object} options - Formatting options
 * @returns {string} ASS formatted content
 */
function formatASS(subtitleData, options) {
  let output = `[Script Info]
Title: Converted Subtitle
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const entry of subtitleData) {
    const startTime = millisecondsToASSTime(entry.startTime);
    const endTime = millisecondsToASSTime(entry.endTime);
    const styleName = entry.style?.style || 'Default';
    const actorName = entry.style?.name || '';
    
    output += `Dialogue: 0,${startTime},${endTime},${styleName},${actorName},0,0,0,,${entry.text}\n`;
  }
  
  return output;
}

/**
 * Format subtitle data as SSA
 * @param {Array} subtitleData - Subtitle entries
 * @param {Object} options - Formatting options
 * @returns {string} SSA formatted content
 */
function formatSSA(subtitleData, options) {
  // SSA is similar to ASS but with older format
  return formatASS(subtitleData, options).replace('v4.00+', 'v4.00');
}

/**
 * Format subtitle data as SUB
 * @param {Array} subtitleData - Subtitle entries
 * @param {Object} options - Formatting options
 * @returns {string} SUB formatted content
 */
function formatSUB(subtitleData, options) {
  let output = '';
  const fps = options.fps || 25;
  
  for (const entry of subtitleData) {
    const startFrame = Math.round((entry.startTime / 1000) * fps);
    const endFrame = Math.round((entry.endTime / 1000) * fps);
    const text = entry.text.replace(/\n/g, '|'); // Convert line breaks to |
    
    output += `{${startFrame}}{${endFrame}}${text}\n`;
  }
  
  return output;
}

/**
 * Format subtitle data as SBV
 * @param {Array} subtitleData - Subtitle entries
 * @param {Object} options - Formatting options
 * @returns {string} SBV formatted content
 */
function formatSBV(subtitleData, options) {
  let output = '';
  
  for (const entry of subtitleData) {
    const startTime = millisecondsToSBVTime(entry.startTime);
    const endTime = millisecondsToSBVTime(entry.endTime);
    
    output += `${startTime},${endTime}\n`;
    output += `${entry.text}\n\n`;
  }
  
  return output.trim();
}

/**
 * Convert time components to milliseconds
 * @param {string|number} hours - Hours
 * @param {string|number} minutes - Minutes
 * @param {string|number} seconds - Seconds
 * @param {string|number} milliseconds - Milliseconds
 * @returns {number} Total milliseconds
 */
function timeToMilliseconds(hours, minutes, seconds, milliseconds) {
  return parseInt(hours) * 3600000 + parseInt(minutes) * 60000 + parseInt(seconds) * 1000 + parseInt(milliseconds);
}

/**
 * Convert ASS time format to milliseconds
 * @param {string} timeStr - ASS time string (h:mm:ss.cc)
 * @returns {number} Milliseconds
 */
function assTimeToMilliseconds(timeStr) {
  const match = timeStr.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
  if (match) {
    return timeToMilliseconds(match[1], match[2], match[3], match[4] * 10);
  }
  return 0;
}

/**
 * Convert milliseconds to SRT time format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} SRT time format (hh:mm:ss,mmm)
 */
function millisecondsToSRTTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Convert milliseconds to VTT time format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} VTT time format (hh:mm:ss.mmm)
 */
function millisecondsToVTTTime(milliseconds) {
  const srtTime = millisecondsToSRTTime(milliseconds);
  return srtTime.replace(',', '.');
}

/**
 * Convert milliseconds to ASS time format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} ASS time format (h:mm:ss.cc)
 */
function millisecondsToASSTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const centiseconds = Math.floor((milliseconds % 1000) / 10);
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

/**
 * Convert milliseconds to SBV time format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} SBV time format (h:mm:ss.mmm)
 */
function millisecondsToSBVTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Get supported input formats for subtitles
 * @returns {Array} Array of supported input formats
 */
function getSupportedInputFormats() {
  return ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv'];
}

/**
 * Get supported output formats for subtitles
 * @returns {Array} Array of supported output formats
 */
function getSupportedOutputFormats() {
  return ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv'];
}

/**
 * Check if conversion between formats is supported
 * @param {string} inputFormat - Input format
 * @param {string} outputFormat - Output format
 * @returns {boolean} Whether conversion is supported
 */
function isConversionSupported(inputFormat, outputFormat) {
  const supportedInput = getSupportedInputFormats();
  const supportedOutput = getSupportedOutputFormats();
  
  return supportedInput.includes(inputFormat.toLowerCase()) && 
         supportedOutput.includes(outputFormat.toLowerCase());
}

/**
 * Get format recommendations based on use case
 * @param {string} inputFormat - Input format
 * @param {Object} options - Options with use case info
 * @returns {Array} Array of recommended formats
 */
function getRecommendations(inputFormat, options = {}) {
  const recommendations = [];
  
  if (options.webUse || options.html5) {
    recommendations.push({
      format: 'vtt',
      reason: 'Native HTML5 video subtitle format',
      compatibility: 'All modern browsers'
    });
  }
  
  if (options.compatibility || options.universalUse) {
    recommendations.push({
      format: 'srt',
      reason: 'Most widely supported format',
      compatibility: 'All video players and devices'
    });
  }
  
  if (options.styling || options.effects) {
    recommendations.push({
      format: 'ass',
      reason: 'Advanced styling and animation support',
      features: 'Colors, fonts, positioning, effects'
    });
  }
  
  if (options.youtube || options.streaming) {
    recommendations.push({
      format: 'sbv',
      reason: 'YouTube native format',
      compatibility: 'YouTube, Google services'
    });
  }
  
  return recommendations;
}

/**
 * Validate subtitle file
 * @param {string} content - Subtitle content
 * @param {string} format - Expected format
 * @returns {Object} Validation result
 */
function validateSubtitle(content, format) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    entryCount: 0
  };
  
  try {
    const entries = parseSubtitle(content, format);
    validation.entryCount = entries.length;
    
    if (entries.length === 0) {
      validation.isValid = false;
      validation.errors.push('No subtitle entries found');
    }
    
    // Check for common issues
    let previousEndTime = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      if (entry.startTime >= entry.endTime) {
        validation.warnings.push(`Entry ${i + 1}: Start time is after end time`);
      }
      
      if (entry.startTime < previousEndTime) {
        validation.warnings.push(`Entry ${i + 1}: Overlaps with previous entry`);
      }
      
      if (!entry.text || entry.text.trim() === '') {
        validation.warnings.push(`Entry ${i + 1}: Empty text`);
      }
      
      previousEndTime = entry.endTime;
    }
    
  } catch (error) {
    validation.isValid = false;
    validation.errors.push(error.message);
  }
  
  return validation;
}

module.exports = {
  convert,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isConversionSupported,
  getRecommendations,
  validateSubtitle,
  parseSubtitle,
  formatSubtitle
};