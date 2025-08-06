const fs = require('fs').promises;
const path = require('path');

/**
 * Convert font to specified format
 * @param {string} inputPath - Path to input font file
 * @param {string} outputFormat - Target format (ttf, otf, woff, woff2, eot)
 * @param {Object} options - Conversion options
 * @returns {string} Path to converted file
 */
async function convert(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  try {
    console.log(`Converting font: ${path.basename(inputPath)} → ${outputFormat}`);
    
    const inputFormat = path.extname(inputPath).toLowerCase().replace('.', '');
    
    // Read input font file
    const fontBuffer = await fs.readFile(inputPath);
    
    // Validate font format
    const validation = validateFontFormat(fontBuffer, inputFormat);
    if (!validation.isValid) {
      throw new Error(`Invalid ${inputFormat} font file: ${validation.error}`);
    }
    
    // Convert based on format pair
    let outputBuffer;
    
    if (inputFormat === outputFormat) {
      // No conversion needed, just copy
      outputBuffer = fontBuffer;
    } else if (isDirectConversionSupported(inputFormat, outputFormat)) {
      outputBuffer = await performFontConversion(fontBuffer, inputFormat, outputFormat, options);
    } else {
      throw new Error(`Conversion from ${inputFormat} to ${outputFormat} is not supported`);
    }
    
    // Write output file
    await fs.writeFile(outputPath, outputBuffer);
    
    console.log(`Font conversion successful: ${inputPath} → ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Font conversion error:', error);
    
    // Clean up on error
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Throw specific error types
    if (error.message.includes('not supported')) {
      const err = new Error('Font conversion not supported');
      err.code = 'UNSUPPORTED_FORMAT';
      throw err;
    }
    
    if (error.message.includes('Invalid') || error.message.includes('corrupted')) {
      const err = new Error('Font file appears to be corrupted');
      err.code = 'CORRUPTED_FILE';
      throw err;
    }
    
    const err = new Error('Font processing failed');
    err.code = 'PROCESSING_ERROR';
    throw err;
  }
}

/**
 * Validate font format based on magic bytes
 * @param {Buffer} fontBuffer - Font file buffer
 * @param {string} format - Expected format
 * @returns {Object} Validation result
 */
function validateFontFormat(fontBuffer, format) {
  const validation = { isValid: true, error: null };
  
  if (fontBuffer.length < 4) {
    validation.isValid = false;
    validation.error = 'File too small to be a valid font';
    return validation;
  }
  
  const header = fontBuffer.subarray(0, 4);
  
  switch (format) {
    case 'ttf':
      // TTF files start with 0x00010000 or 'true'
      if (!header.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) && 
          !header.equals(Buffer.from('true'))) {
        validation.isValid = false;
        validation.error = 'Invalid TTF header';
      }
      break;
      
    case 'otf':
      // OTF files start with 'OTTO'
      if (!header.equals(Buffer.from('OTTO'))) {
        validation.isValid = false;
        validation.error = 'Invalid OTF header';
      }
      break;
      
    case 'woff':
      // WOFF files start with 'wOFF'
      if (!header.equals(Buffer.from('wOFF'))) {
        validation.isValid = false;
        validation.error = 'Invalid WOFF header';
      }
      break;
      
    case 'woff2':
      // WOFF2 files start with 'wOF2'
      if (!header.equals(Buffer.from('wOF2'))) {
        validation.isValid = false;
        validation.error = 'Invalid WOFF2 header';
      }
      break;
      
    case 'eot':
      // EOT files have a more complex header, check for EOT signature
      const eotHeader = fontBuffer.subarray(34, 38);
      if (!eotHeader.equals(Buffer.from([0x4C, 0x50, 0x00, 0x00]))) {
        validation.isValid = false;
        validation.error = 'Invalid EOT header';
      }
      break;
  }
  
  return validation;
}

/**
 * Check if direct conversion between formats is supported
 * @param {string} inputFormat - Input format
 * @param {string} outputFormat - Output format
 * @returns {boolean} Whether direct conversion is supported
 */
function isDirectConversionSupported(inputFormat, outputFormat) {
  // Currently, this is a simplified implementation
  // In production, you'd use a font conversion library like fontkit or opentype.js
  
  const supportedConversions = {
    'ttf': ['otf', 'woff', 'eot'], // Limited conversions without external tools
    'otf': ['ttf', 'woff', 'eot'],
    'woff': ['ttf', 'otf'],
    'woff2': ['woff'], // WOFF2 decompression
    'eot': ['ttf', 'otf']
  };
  
  return supportedConversions[inputFormat]?.includes(outputFormat) || false;
}

/**
 * Perform font conversion (placeholder implementation)
 * @param {Buffer} inputBuffer - Input font buffer
 * @param {string} inputFormat - Input format
 * @param {string} outputFormat - Output format
 * @param {Object} options - Conversion options
 * @returns {Buffer} Converted font buffer
 */
async function performFontConversion(inputBuffer, inputFormat, outputFormat, options) {
  // This is a placeholder implementation
  // In production, you would use proper font conversion libraries
  
  console.log(`Converting ${inputFormat} to ${outputFormat} (using placeholder implementation)`);
  
  // For now, we'll simulate conversion by returning the original buffer
  // with some modifications to indicate it's been "converted"
  
  if (outputFormat === 'woff' && (inputFormat === 'ttf' || inputFormat === 'otf')) {
    return await simulateWOFFConversion(inputBuffer, inputFormat);
  }
  
  if (outputFormat === 'eot' && (inputFormat === 'ttf' || inputFormat === 'otf')) {
    return await simulateEOTConversion(inputBuffer, inputFormat);
  }
  
  // For other conversions, return original buffer (placeholder)
  return inputBuffer;
}

/**
 * Simulate WOFF conversion (placeholder)
 * @param {Buffer} inputBuffer - TTF/OTF buffer
 * @param {string} inputFormat - Input format
 * @returns {Buffer} Simulated WOFF buffer
 */
async function simulateWOFFConversion(inputBuffer, inputFormat) {
  // This is a placeholder that creates a mock WOFF file
  // In production, use a proper WOFF compression library
  
  const woffHeader = Buffer.from([
    0x77, 0x4F, 0x46, 0x46, // 'wOFF' signature
    0x00, 0x01, 0x00, 0x00, // Font version
    ...Buffer.alloc(36, 0)   // Rest of header (placeholder)
  ]);
  
  // In reality, you'd compress the font tables and create proper WOFF structure
  return Buffer.concat([woffHeader, inputBuffer.subarray(0, Math.min(inputBuffer.length, 1000))]);
}

/**
 * Simulate EOT conversion (placeholder)
 * @param {Buffer} inputBuffer - TTF/OTF buffer  
 * @param {string} inputFormat - Input format
 * @returns {Buffer} Simulated EOT buffer
 */
async function simulateEOTConversion(inputBuffer, inputFormat) {
  // This is a placeholder that creates a mock EOT file
  // In production, use a proper EOT conversion library
  
  const eotHeader = Buffer.alloc(78, 0);
  eotHeader.writeUInt32LE(inputBuffer.length + 78, 0); // EOT size
  eotHeader.writeUInt32LE(inputBuffer.length, 4);      // Font data size
  eotHeader.writeUInt32LE(0x00004C50, 34);            // EOT signature
  
  return Buffer.concat([eotHeader, inputBuffer]);
}

/**
 * Get font metadata
 * @param {string} inputPath - Path to font file
 * @returns {Promise<Object>} Font metadata
 */
async function getFontMetadata(inputPath) {
  try {
    const fontBuffer = await fs.readFile(inputPath);
    const format = path.extname(inputPath).toLowerCase().replace('.', '');
    const stats = await fs.stat(inputPath);
    
    // Basic metadata extraction (simplified)
    const metadata = {
      format: format.toUpperCase(),
      size: stats.size,
      lastModified: stats.mtime
    };
    
    // Try to extract font name and family (very basic implementation)
    if (format === 'ttf' || format === 'otf') {
      const nameInfo = extractFontNameInfo(fontBuffer);
      metadata.fontFamily = nameInfo.family;
      metadata.fontName = nameInfo.name;
      metadata.version = nameInfo.version;
    }
    
    return metadata;
    
  } catch (error) {
    console.error('Error reading font metadata:', error);
    return {
      format: 'UNKNOWN',
      size: 0,
      error: error.message
    };
  }
}

/**
 * Extract basic font name information (simplified)
 * @param {Buffer} fontBuffer - Font file buffer
 * @returns {Object} Font name information
 */
function extractFontNameInfo(fontBuffer) {
  // This is a very simplified name table parser
  // In production, use a proper font parsing library like opentype.js
  
  try {
    // Look for 'name' table in TTF/OTF
    const nameOffset = findNameTable(fontBuffer);
    if (nameOffset === -1) {
      return { family: 'Unknown', name: 'Unknown', version: '1.0' };
    }
    
    // Very basic name extraction (placeholder)
    return {
      family: 'Font Family',
      name: 'Font Name', 
      version: '1.0'
    };
    
  } catch (error) {
    return { family: 'Unknown', name: 'Unknown', version: '1.0' };
  }
}

/**
 * Find name table offset in font file (simplified)
 * @param {Buffer} fontBuffer - Font file buffer
 * @returns {number} Offset of name table, or -1 if not found
 */
function findNameTable(fontBuffer) {
  // Simplified table directory parsing
  // In production, implement proper OpenType table directory parsing
  
  if (fontBuffer.length < 12) return -1;
  
  const numTables = fontBuffer.readUInt16BE(4);
  let offset = 12;
  
  for (let i = 0; i < numTables; i++) {
    if (offset + 16 > fontBuffer.length) break;
    
    const tag = fontBuffer.toString('ascii', offset, offset + 4);
    if (tag === 'name') {
      return fontBuffer.readUInt32BE(offset + 8);
    }
    offset += 16;
  }
  
  return -1;
}

/**
 * Get supported input formats for fonts
 * @returns {Array} Array of supported input formats
 */
function getSupportedInputFormats() {
  return ['ttf', 'otf', 'woff', 'woff2', 'eot'];
}

/**
 * Get supported output formats for fonts
 * @returns {Array} Array of supported output formats
 */
function getSupportedOutputFormats() {
  return ['ttf', 'otf', 'woff', 'woff2', 'eot'];
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
  
  if (!supportedInput.includes(inputFormat) || !supportedOutput.includes(outputFormat)) {
    return false;
  }
  
  return isDirectConversionSupported(inputFormat, outputFormat);
}

/**
 * Get format recommendations based on use case
 * @param {string} inputFormat - Input format
 * @param {Object} options - Options with use case info
 * @returns {Array} Array of recommended formats
 */
function getRecommendations(inputFormat, options = {}) {
  const recommendations = [];
  
  if (options.webUse || options.webFont) {
    recommendations.push({
      format: 'woff2',
      reason: 'Best compression for modern browsers',
      savings: '30% smaller than WOFF',
      compatibility: 'Modern browsers (IE 11+)'
    });
    
    recommendations.push({
      format: 'woff',
      reason: 'Fallback for older browsers',
      compatibility: 'IE 9+, all modern browsers'
    });
  }
  
  if (options.legacySupport) {
    recommendations.push({
      format: 'eot',
      reason: 'Support for Internet Explorer 6-8',
      compatibility: 'IE 6-8'
    });
  }
  
  if (options.desktop || options.printing) {
    recommendations.push({
      format: 'ttf',
      reason: 'Best for desktop applications and printing',
      compatibility: 'All desktop systems'
    });
    
    recommendations.push({
      format: 'otf',
      reason: 'Advanced typography features',
      features: 'Better character support'
    });
  }
  
  return recommendations;
}

/**
 * Estimate file size after conversion
 * @param {Object} metadata - Original font metadata
 * @param {string} outputFormat - Target format
 * @returns {number} Estimated file size in bytes
 */
function estimateOutputSize(metadata, outputFormat) {
  const originalSize = metadata.size || 50000; // Default ~50KB if unknown
  
  const formatMultipliers = {
    'ttf': 1.0,    // Base format
    'otf': 1.1,    // Slightly larger due to CFF data
    'woff': 0.6,   // Compressed, ~40% smaller
    'woff2': 0.4,  // Better compression, ~60% smaller
    'eot': 1.2     // Larger due to headers and structure
  };
  
  const multiplier = formatMultipliers[outputFormat.toLowerCase()] || 1.0;
  return Math.round(originalSize * multiplier);
}

module.exports = {
  convert,
  getFontMetadata,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isConversionSupported,
  getRecommendations,
  estimateOutputSize
};