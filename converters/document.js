const libre = require('libreoffice-convert');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');

const libreConvert = promisify(libre.convert);

/**
 * Convert document to specified format
 * @param {string} inputPath - Path to input document
 * @param {string} outputFormat - Target format (pdf, docx, txt, etc.)
 * @param {Object} options - Conversion options
 * @returns {string} Path to converted file
 */
async function convert(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  try {
    const inputFormat = path.extname(inputPath).toLowerCase().replace('.', '');
    console.log(`Converting document: ${inputFormat} → ${outputFormat}`);
    
    // Read input file
    const inputBuffer = await fs.readFile(inputPath);
    
    // Handle different conversion scenarios
    let outputBuffer;
    
    if (isLibreOfficeConversion(inputFormat, outputFormat)) {
      // Use LibreOffice for most document conversions
      outputBuffer = await convertWithLibreOffice(inputBuffer, outputFormat, inputFormat);
    } else if (inputFormat === 'docx' && outputFormat === 'txt') {
      // Use Mammoth for DOCX to TXT conversion
      outputBuffer = await convertDocxToText(inputBuffer);
    } else if (inputFormat === 'txt' && outputFormat === 'docx') {
      // Convert plain text to DOCX
      outputBuffer = await convertTextToDocx(inputBuffer);
    } else if (outputFormat === 'txt') {
      // Generic text extraction
      outputBuffer = await extractTextFromDocument(inputBuffer, inputFormat);
    } else {
      throw new Error(`Conversion from ${inputFormat} to ${outputFormat} is not supported`);
    }
    
    // Write output file
    await fs.writeFile(outputPath, outputBuffer);
    
    console.log(`Document conversion successful: ${inputPath} → ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Document conversion error:', error);
    
    // Clean up on error
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Throw specific error types
    if (error.message.includes('not supported')) {
      const err = new Error('Document conversion not supported');
      err.code = 'UNSUPPORTED_FORMAT';
      throw err;
    }
    
    if (error.message.includes('corrupted') || error.message.includes('invalid')) {
      const err = new Error('Document appears to be corrupted');
      err.code = 'CORRUPTED_FILE';
      throw err;
    }
    
    const err = new Error('Document processing failed');
    err.code = 'PROCESSING_ERROR';
    throw err;
  }
}

/**
 * Check if conversion should use LibreOffice
 * @param {string} inputFormat - Input format
 * @param {string} outputFormat - Output format
 * @returns {boolean} Whether to use LibreOffice
 */
function isLibreOfficeConversion(inputFormat, outputFormat) {
  const libreInputFormats = ['doc', 'docx', 'odt', 'rtf', 'txt'];
  const libreOutputFormats = ['pdf', 'doc', 'docx', 'odt', 'rtf'];
  
  return libreInputFormats.includes(inputFormat) && libreOutputFormats.includes(outputFormat);
}

/**
 * Convert document using LibreOffice
 * @param {Buffer} inputBuffer - Input file buffer
 * @param {string} outputFormat - Target format
 * @param {string} inputFormat - Input format
 * @returns {Buffer} Converted file buffer
 */
async function convertWithLibreOffice(inputBuffer, outputFormat, inputFormat) {
  try {
    // LibreOffice format mapping
    const formatMap = {
      'pdf': 'pdf',
      'doc': 'doc',
      'docx': 'docx',
      'odt': 'odt',
      'rtf': 'rtf',
      'txt': 'txt'
    };
    
    const libreFormat = formatMap[outputFormat];
    if (!libreFormat) {
      throw new Error(`LibreOffice format mapping not found for: ${outputFormat}`);
    }
    
    // Convert using LibreOffice
    const outputBuffer = await libreConvert(inputBuffer, libreFormat, undefined);
    
    return outputBuffer;
    
  } catch (error) {
    console.error('LibreOffice conversion error:', error);
    throw error;
  }
}

/**
 * Convert DOCX to plain text using Mammoth
 * @param {Buffer} inputBuffer - DOCX file buffer
 * @returns {Buffer} Text file buffer
 */
async function convertDocxToText(inputBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: inputBuffer });
    
    if (result.messages.length > 0) {
      console.log('Mammoth conversion messages:', result.messages);
    }
    
    return Buffer.from(result.value, 'utf8');
    
  } catch (error) {
    console.error('DOCX to text conversion error:', error);
    throw error;
  }
}

/**
 * Convert plain text to DOCX format
 * @param {Buffer} inputBuffer - Text file buffer
 * @returns {Buffer} DOCX file buffer
 */
async function convertTextToDocx(inputBuffer) {
  // This is a simplified implementation
  // In production, you'd use a proper library like docx or officegen
  
  const text = inputBuffer.toString('utf8');
  const lines = text.split('\n');
  
  // Create a simple DOCX structure (this is a placeholder)
  // You would need to implement proper DOCX creation here
  const docxContent = createSimpleDocx(lines);
  
  return Buffer.from(docxContent);
}

/**
 * Create a simple DOCX structure (placeholder implementation)
 * @param {Array} lines - Array of text lines
 * @returns {string} Basic DOCX XML content
 */
function createSimpleDocx(lines) {
  // This is a very basic DOCX structure
  // In production, use a proper DOCX library
  
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;
  
  const footer = `  </w:body>
</w:document>`;
  
  const content = lines.map(line => 
    `    <w:p>
      <w:r>
        <w:t>${escapeXml(line)}</w:t>
      </w:r>
    </w:p>`
  ).join('\n');
  
  return header + '\n' + content + '\n' + footer;
}

/**
 * Escape XML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extract text from various document formats
 * @param {Buffer} inputBuffer - Input file buffer
 * @param {string} inputFormat - Input format
 * @returns {Buffer} Extracted text buffer
 */
async function extractTextFromDocument(inputBuffer, inputFormat) {
  switch (inputFormat) {
    case 'txt':
      return inputBuffer; // Already text
      
    case 'docx':
      return await convertDocxToText(inputBuffer);
      
    case 'rtf':
      // Basic RTF text extraction (remove RTF formatting)
      const rtfText = inputBuffer.toString('utf8');
      const cleanText = extractTextFromRTF(rtfText);
      return Buffer.from(cleanText, 'utf8');
      
    default:
      // Try LibreOffice conversion to text first
      try {
        return await convertWithLibreOffice(inputBuffer, 'txt', inputFormat);
      } catch (error) {
        throw new Error(`Text extraction from ${inputFormat} not supported`);
      }
  }
}

/**
 * Extract plain text from RTF content
 * @param {string} rtfContent - RTF file content
 * @returns {string} Plain text
 */
function extractTextFromRTF(rtfContent) {
  // Very basic RTF text extraction
  // Remove RTF control codes and formatting
  let text = rtfContent
    .replace(/\\[a-z]+\d*\s?/g, '') // Remove control words
    .replace(/[{}]/g, '') // Remove braces
    .replace(/\\\\/g, '\\') // Unescape backslashes
    .replace(/\\'/g, "'") // Unescape quotes
    .trim();
  
  return text;
}

/**
 * Get supported input formats for documents
 * @returns {Array} Array of supported input formats
 */
function getSupportedInputFormats() {
  return ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'];
}

/**
 * Get supported output formats for documents
 * @returns {Array} Array of supported output formats
 */
function getSupportedOutputFormats() {
  return ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'];
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
  
  // Some specific conversion limitations
  if (inputFormat === 'pdf' && outputFormat !== 'txt') {
    return false; // PDF can only be converted to text
  }
  
  return true;
}

/**
 * Get format recommendations based on use case
 * @param {string} inputFormat - Input format
 * @param {Object} options - Options with use case info
 * @returns {Array} Array of recommended formats
 */
function getRecommendations(inputFormat, options = {}) {
  const recommendations = [];
  
  if (inputFormat === 'doc') {
    recommendations.push({
      format: 'docx',
      reason: 'Modern format with better compatibility',
      compatibility: 'Microsoft Office 2007+'
    });
    
    recommendations.push({
      format: 'pdf',
      reason: 'Preserve formatting and prevent editing',
      compatibility: 'Universal'
    });
  }
  
  if (inputFormat === 'docx' && options.sharing) {
    recommendations.push({
      format: 'pdf',
      reason: 'Best for sharing and printing',
      compatibility: 'Universal'
    });
  }
  
  if (inputFormat === 'txt' && options.formatting) {
    recommendations.push({
      format: 'docx',
      reason: 'Add formatting capabilities',
      features: 'Fonts, styles, images'
    });
  }
  
  return recommendations;
}

/**
 * Validate document before conversion
 * @param {Buffer} inputBuffer - Input file buffer
 * @param {string} inputFormat - Input format
 * @returns {Object} Validation result
 */
async function validateDocument(inputBuffer, inputFormat) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    metadata: {}
  };
  
  try {
    // Basic file size check
    if (inputBuffer.length === 0) {
      validation.isValid = false;
      validation.errors.push('File is empty');
      return validation;
    }
    
    if (inputBuffer.length > 20 * 1024 * 1024) { // 20MB limit
      validation.warnings.push('File is very large, conversion may be slow');
    }
    
    // Format-specific validation
    switch (inputFormat) {
      case 'docx':
        // Check for DOCX magic bytes
        if (!inputBuffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
          validation.isValid = false;
          validation.errors.push('Invalid DOCX file format');
        }
        break;
        
      case 'pdf':
        // Check for PDF magic bytes
        if (!inputBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
          validation.isValid = false;
          validation.errors.push('Invalid PDF file format');
        }
        break;
        
      case 'txt':
        // Check if it's valid UTF-8
        try {
          inputBuffer.toString('utf8');
        } catch (error) {
          validation.warnings.push('File may contain non-UTF-8 characters');
        }
        break;
    }
    
    validation.metadata = {
      size: inputBuffer.length,
      format: inputFormat,
      encoding: inputFormat === 'txt' ? 'utf8' : 'binary'
    };
    
  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Validation error: ${error.message}`);
  }
  
  return validation;
}

module.exports = {
  convert,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isConversionSupported,
  getRecommendations,
  validateDocument
};