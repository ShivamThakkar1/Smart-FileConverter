const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

/**
 * Convert ebook to specified format using ebook-convert (Calibre)
 * @param {string} inputPath - Path to input ebook
 * @param {string} outputFormat - Target format (epub, mobi, pdf, etc.)
 * @param {Object} options - Conversion options
 * @returns {string} Path to converted file
 */
async function convert(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  try {
    console.log(`Converting ebook: ${path.basename(inputPath)} → ${outputFormat}`);
    
    // Check if Calibre is installed (for production, you'd install it in your Docker image)
    const calibreVersion = await checkCalibreInstallation();
    console.log(`Using Calibre version: ${calibreVersion}`);
    
    // Build ebook-convert command
    const command = buildConversionCommand(inputPath, outputPath, outputFormat, options);
    console.log(`Executing: ${command}`);
    
    // Execute conversion
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120000, // 2 minutes timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    if (stderr && !stderr.includes('UserWarning')) {
      console.warn('Calibre warnings:', stderr);
    }
    
    // Verify output file exists
    const outputStats = await fs.stat(outputPath);
    if (outputStats.size === 0) {
      throw new Error('Output file is empty');
    }
    
    console.log(`Ebook conversion successful: ${inputPath} → ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Ebook conversion error:', error);
    
    // Clean up on error
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Provide specific error messages
    if (error.message.includes('not found') || error.message.includes('command not found')) {
      const err = new Error('Ebook converter not available');
      err.code = 'CONVERTER_NOT_FOUND';
      throw err;
    }
    
    if (error.message.includes('timeout')) {
      const err = new Error('Conversion timeout - file may be too large or complex');
      err.code = 'TIMEOUT_ERROR';
      throw err;
    }
    
    if (error.message.includes('unsupported') || error.message.includes('Unknown format')) {
      const err = new Error('Ebook format not supported');
      err.code = 'UNSUPPORTED_FORMAT';
      throw err;
    }
    
    if (error.message.includes('corrupted') || error.message.includes('invalid')) {
      const err = new Error('Ebook file appears to be corrupted');
      err.code = 'CORRUPTED_FILE';
      throw err;
    }
    
    const err = new Error('Ebook processing failed');
    err.code = 'PROCESSING_ERROR';
    throw err;
  }
}

/**
 * Check if Calibre is installed and get version
 * @returns {string} Calibre version
 */
async function checkCalibreInstallation() {
  try {
    const { stdout } = await execAsync('ebook-convert --version');
    return stdout.trim();
  } catch (error) {
    // For development/testing, return a mock version
    console.warn('Calibre not installed, using mock converter');
    return 'mock-converter-1.0';
  }
}

/**
 * Build ebook-convert command with options
 * @param {string} inputPath - Input file path
 * @param {string} outputPath - Output file path
 * @param {string} outputFormat - Target format
 * @param {Object} options - Conversion options
 * @returns {string} Complete command string
 */
function buildConversionCommand(inputPath, outputPath, outputFormat, options) {
  // For development/testing without Calibre, return a mock command
  if (process.env.NODE_ENV === 'development') {
    return `cp "${inputPath}" "${outputPath}"`;
  }
  
  let command = `ebook-convert "${inputPath}" "${outputPath}"`;
  
  // Add format-specific options
  const formatOptions = getFormatOptions(outputFormat, options);
  
  for (const [key, value] of Object.entries(formatOptions)) {
    if (value !== null && value !== undefined) {
      command += ` --${key}`;
      if (value !== true) {
        command += ` "${value}"`;
      }
    }
  }
  
  return command;
}

/**
 * Get format-specific conversion options
 * @param {string} format - Output format
 * @param {Object} userOptions - User-specified options
 * @returns {Object} Format options
 */
function getFormatOptions(format, userOptions) {
  const baseOptions = {
    'no-chapters-in-toc': false,
    'chapter': '//h:h1 | //h:h2',
    'level1-toc': '//h:h1',
    'level2-toc': '//h:h2',
    'level3-toc': '//h:h3'
  };
  
  const formatSpecific = {
    epub: {
      'epub-version': '2',
      'flow-size': 260,
      'no-svg-cover': false,
      'preserve-cover-aspect-ratio': true
    },
    mobi: {
      'mobi-file-type': 'both',
      'mobi-toc-at-start': false,
      'dont-compress': false,
      'no-inline-toc': false
    },
    azw3: {
      'mobi-file-type': 'new',
      'enable-heuristics': true,
      'mobi-keep-original-images': false
    },
    pdf: {
      'pdf-page-numbers': true,
      'pdf-serif-family': 'Times New Roman',
      'pdf-sans-family': 'Helvetica',
      'pdf-mono-family': 'Courier New',
      'pdf-default-font-size': '12',
      'pdf-mono-font-size': '12',
      'paper-size': 'a4',
      'pdf-page-margin-left': '72',
      'pdf-page-margin-right': '72',
      'pdf-page-margin-top': '72',
      'pdf-page-margin-bottom': '72'
    },
    fb2: {
      'sectionize': 'toc',
      'fb2-genre': 'literature'
    }
  };
  
  // Merge base options with format-specific options
  let options = { ...baseOptions, ...(formatSpecific[format] || {}) };
  
  // Apply user preferences
  if (userOptions.quality === 'high') {
    options['extra-css'] = 'body { font-family: Georgia, serif; line-height: 1.6; }';
    if (format === 'pdf') {
      options['pdf-default-font-size'] = '14';
    }
  }
  
  if (userOptions.removeBlankPages) {
    options['remove-first-image'] = true;
  }
  
  if (userOptions.embedFonts && format === 'epub') {
    options['embed-font-family'] = true;
  }
  
  return options;
}

/**
 * Get ebook metadata
 * @param {string} inputPath - Path to ebook file
 * @returns {Promise<Object>} Ebook metadata
 */
async function getEbookMetadata(inputPath) {
  try {
    const { stdout } = await execAsync(`ebook-meta "${inputPath}"`);
    return parseEbookMetadata(stdout);
  } catch (error) {
    console.warn('Could not get ebook metadata:', error.message);
    // Return basic metadata based on file
    const stats = await fs.stat(inputPath);
    return {
      title: path.basename(inputPath, path.extname(inputPath)),
      size: stats.size,
      format: path.extname(inputPath).replace('.', '').toUpperCase(),
      lastModified: stats.mtime
    };
  }
}

/**
 * Parse ebook metadata from ebook-meta output
 * @param {string} metaOutput - Raw metadata output
 * @returns {Object} Parsed metadata
 */
function parseEbookMetadata(metaOutput) {
  const metadata = {};
  const lines = metaOutput.split('\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      
      switch (key) {
        case 'title':
          metadata.title = value;
          break;
        case 'author(s)':
          metadata.authors = value.split(',').map(a => a.trim());
          break;
        case 'publisher':
          metadata.publisher = value;
          break;
        case 'published':
          metadata.published = value;
          break;
        case 'language':
          metadata.language = value;
          break;
        case 'series':
          metadata.series = value;
          break;
        case 'tags':
          metadata.tags = value.split(',').map(t => t.trim());
          break;
      }
    }
  }
  
  return metadata;
}

/**
 * Get supported input formats for ebooks
 * @returns {Array} Array of supported input formats
 */
function getSupportedInputFormats() {
  return [
    'epub', 'mobi', 'azw', 'azw3', 'azw4', 'fb2', 'fbz',
    'html', 'htmlz', 'lit', 'lrf', 'pdb', 'pdf', 'pmlz',
    'rb', 'rtf', 'snb', 'tcr', 'txt', 'txtz'
  ];
}

/**
 * Get supported output formats for ebooks
 * @returns {Array} Array of supported output formats
 */
function getSupportedOutputFormats() {
  return [
    'epub', 'mobi', 'azw3', 'fb2', 'pdf', 'txt', 'html',
    'rtf', 'oeb', 'pdb', 'rb', 'tcr'
  ];
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
  
  if (options.device === 'kindle') {
    recommendations.push({
      format: 'mobi',
      reason: 'Native Kindle format',
      compatibility: 'All Kindle devices'
    });
    
    recommendations.push({
      format: 'azw3',
      reason: 'Modern Kindle format with better typography',
      compatibility: 'Kindle Paperwhite and newer'
    });
  }
  
  if (options.device === 'universal' || !options.device) {
    recommendations.push({
      format: 'epub',
      reason: 'Universal ebook format',
      compatibility: 'Most ebook readers'
    });
  }
  
  if (options.sharing || options.printing) {
    recommendations.push({
      format: 'pdf',
      reason: 'Best for sharing and printing',
      compatibility: 'Universal'
    });
  }
  
  if (inputFormat === 'pdf' && options.readability) {
    recommendations.push({
      format: 'epub',
      reason: 'Better readability on small screens',
      features: 'Reflowable text'
    });
  }
  
  return recommendations;
}

/**
 * Estimate file size after conversion
 * @param {Object} metadata - Original ebook metadata
 * @param {string} outputFormat - Target format
 * @returns {number} Estimated file size in bytes
 */
function estimateOutputSize(metadata, outputFormat) {
  const originalSize = metadata.size || 1024 * 1024; // Default 1MB if unknown
  
  const formatMultipliers = {
    'epub': 0.9,   // Usually slightly smaller
    'mobi': 1.1,   // Usually slightly larger
    'azw3': 1.0,   // Similar size
    'pdf': 1.5,    // Usually larger due to formatting
    'txt': 0.1,    // Much smaller, text only
    'fb2': 0.8,    // Usually smaller
    'html': 0.7    // Smaller without binary data
  };
  
  const multiplier = formatMultipliers[outputFormat.toLowerCase()] || 1.0;
  return Math.round(originalSize * multiplier);
}

/**
 * Validate ebook before conversion
 * @param {string} inputPath - Path to input file
 * @returns {Object} Validation result
 */
async function validateEbook(inputPath) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    metadata: {}
  };
  
  try {
    const stats = await fs.stat(inputPath);
    const format = path.extname(inputPath).toLowerCase().replace('.', '');
    
    // Basic file size check
    if (stats.size === 0) {
      validation.isValid = false;
      validation.errors.push('File is empty');
      return validation;
    }
    
    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
      validation.warnings.push('File is very large, conversion may be slow');
    }
    
    // Format-specific validation
    const buffer = await fs.readFile(inputPath);
    
    switch (format) {
      case 'epub':
        // EPUB files are ZIP archives
        if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
          validation.isValid = false;
          validation.errors.push('Invalid EPUB file format');
        }
        break;
        
      case 'pdf':
        // Check PDF magic bytes
        if (!buffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
          validation.isValid = false;
          validation.errors.push('Invalid PDF file format');
        }
        break;
        
      case 'mobi':
      case 'azw':
      case 'azw3':
        // Check for MOBI/AZW header
        const header = buffer.toString('ascii', 60, 68);
        if (header !== 'BOOKMOBI') {
          validation.warnings.push('File may not be a valid MOBI/AZW format');
        }
        break;
    }
    
    // Try to get metadata
    try {
      validation.metadata = await getEbookMetadata(inputPath);
    } catch (error) {
      validation.warnings.push('Could not read ebook metadata');
    }
    
  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Validation error: ${error.message}`);
  }
  
  return validation;
}

/**
 * Convert ebook with progress tracking
 * @param {string} inputPath - Input file path
 * @param {string} outputFormat - Target format
 * @param {Object} options - Conversion options
 * @param {Function} progressCallback - Progress callback function
 * @returns {string} Output file path
 */
async function convertWithProgress(inputPath, outputFormat, options = {}, progressCallback) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  try {
    if (progressCallback) progressCallback(10, 'Starting conversion...');
    
    const command = buildConversionCommand(inputPath, outputPath, outputFormat, options);
    
    if (progressCallback) progressCallback(30, 'Processing ebook structure...');
    
    // For mock conversion in development
    if (process.env.NODE_ENV === 'development') {
      await fs.copyFile(inputPath, outputPath);
      if (progressCallback) progressCallback(100, 'Conversion completed');
      return outputPath;
    }
    
    // Execute with progress simulation
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120000,
      maxBuffer: 1024 * 1024
    });
    
    if (progressCallback) progressCallback(80, 'Finalizing output...');
    
    const outputStats = await fs.stat(outputPath);
    if (outputStats.size === 0) {
      throw new Error('Output file is empty');
    }
    
    if (progressCallback) progressCallback(100, 'Conversion completed');
    
    return outputPath;
    
  } catch (error) {
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

module.exports = {
  convert,
  getEbookMetadata,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isConversionSupported,
  getRecommendations,
  estimateOutputSize,
  validateEbook,
  convertWithProgress
};