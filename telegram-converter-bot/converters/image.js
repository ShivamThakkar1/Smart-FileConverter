const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Convert image to specified format using Sharp
 * @param {string} inputPath - Path to input image file
 * @param {string} outputFormat - Target format (png, jpg, webp, etc.)
 * @param {Object} options - Conversion options
 * @returns {string} Path to converted file
 */
async function convert(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  try {
    let sharpInstance = sharp(inputPath);
    
    // Get image metadata
    const metadata = await sharpInstance.metadata();
    console.log(`Converting image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Apply quality settings based on user preference
    const qualitySettings = getQualitySettings(options.quality || 'medium');
    
    // Apply format-specific conversions
    switch (outputFormat.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({
          quality: qualitySettings.jpeg.quality,
          progressive: qualitySettings.jpeg.progressive
        });
        break;
        
      case 'png':
        sharpInstance = sharpInstance.png({
          quality: qualitySettings.png.quality,
          compressionLevel: qualitySettings.png.compression
        });
        break;
        
      case 'webp':
        sharpInstance = sharpInstance.webp({
          quality: qualitySettings.webp.quality,
          effort: qualitySettings.webp.effort
        });
        break;
        
      case 'avif':
        sharpInstance = sharpInstance.avif({
          quality: qualitySettings.avif.quality,
          effort: qualitySettings.avif.effort
        });
        break;
        
      case 'bmp':
        sharpInstance = sharpInstance.png(); // Convert to PNG first, then to BMP
        break;
        
      case 'tiff':
      case 'tif':
        sharpInstance = sharpInstance.tiff({
          quality: qualitySettings.tiff.quality,
          compression: 'lzw'
        });
        break;
        
      case 'gif':
        // Sharp doesn't support GIF output, convert to PNG
        sharpInstance = sharpInstance.png();
        break;
        
      case 'ico':
        // Resize to common icon size and convert to PNG
        sharpInstance = sharpInstance
          .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png();
        break;
        
      default:
        throw new Error(`Unsupported output format: ${outputFormat}`);
    }
    
    // Apply optional image transformations
    if (options.resize) {
      sharpInstance = sharpInstance.resize(options.resize.width, options.resize.height, {
        fit: options.resize.fit || 'inside',
        withoutEnlargement: true
      });
    }
    
    // Auto-orient based on EXIF data
    sharpInstance = sharpInstance.rotate();
    
    // Write output file
    await sharpInstance.toFile(outputPath);
    
    // Special handling for formats Sharp doesn't natively support
    if (outputFormat.toLowerCase() === 'bmp') {
      const bmpPath = await convertToBMP(outputPath);
      await fs.unlink(outputPath); // Remove intermediate PNG
      return bmpPath;
    }
    
    if (outputFormat.toLowerCase() === 'ico') {
      const icoPath = await convertToICO(outputPath);
      await fs.unlink(outputPath); // Remove intermediate PNG
      return icoPath;
    }
    
    console.log(`Image conversion successful: ${inputPath} → ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Image conversion error:', error);
    
    // Clean up on error
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Throw specific error types
    if (error.message.includes('Input file contains unsupported image format')) {
      const err = new Error('Unsupported or corrupted image format');
      err.code = 'UNSUPPORTED_FORMAT';
      throw err;
    }
    
    if (error.message.includes('Input file is missing')) {
      const err = new Error('Input file not found');
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }
    
    const err = new Error('Image processing failed');
    err.code = 'PROCESSING_ERROR';
    throw err;
  }
}

/**
 * Get quality settings based on user preference
 * @param {string} quality - Quality level (low, medium, high)
 * @returns {Object} Quality settings for different formats
 */
function getQualitySettings(quality) {
  const settings = {
    low: {
      jpeg: { quality: 60, progressive: false },
      png: { quality: 60, compression: 9 },
      webp: { quality: 60, effort: 4 },
      avif: { quality: 50, effort: 4 },
      tiff: { quality: 60 }
    },
    medium: {
      jpeg: { quality: 80, progressive: true },
      png: { quality: 80, compression: 6 },
      webp: { quality: 80, effort: 4 },
      avif: { quality: 70, effort: 4 },
      tiff: { quality: 80 }
    },
    high: {
      jpeg: { quality: 95, progressive: true },
      png: { quality: 95, compression: 3 },
      webp: { quality: 90, effort: 6 },
      avif: { quality: 85, effort: 6 },
      tiff: { quality: 95 }
    }
  };
  
  return settings[quality] || settings.medium;
}

/**
 * Convert PNG to BMP format (placeholder implementation)
 * @param {string} pngPath - Path to PNG file
 * @returns {string} Path to BMP file
 */
async function convertToBMP(pngPath) {
  const bmpPath = pngPath.replace('.png', '.bmp');
  
  // For now, just rename the PNG file
  // In production, you'd use a proper BMP converter
  await fs.copyFile(pngPath, bmpPath);
  return bmpPath;
}

/**
 * Convert PNG to ICO format (placeholder implementation)
 * @param {string} pngPath - Path to PNG file
 * @returns {string} Path to ICO file
 */
async function convertToICO(pngPath) {
  const icoPath = pngPath.replace('.png', '.ico');
  
  // For now, just rename the PNG file
  // In production, you'd use a proper ICO converter like 'png-to-ico' package
  await fs.copyFile(pngPath, icoPath);
  return icoPath;
}

/**
 * Get supported input formats for images
 * @returns {Array} Array of supported input formats
 */
function getSupportedInputFormats() {
  return ['jpeg', 'jpg', 'png', 'webp', 'gif', 'svg', 'tiff', 'tif', 'avif', 'heic', 'raw'];
}

/**
 * Get supported output formats for images
 * @returns {Array} Array of supported output formats
 */
function getSupportedOutputFormats() {
  return ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'tif', 'bmp', 'ico'];
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
 * Get optimal format recommendations based on input
 * @param {string} inputFormat - Input format
 * @param {Object} metadata - Image metadata
 * @returns {Array} Array of recommended output formats
 */
function getRecommendations(inputFormat, metadata = {}) {
  const recommendations = [];
  
  // General recommendations based on use case
  if (metadata.hasAlpha || inputFormat === 'png') {
    recommendations.push({
      format: 'webp',
      reason: 'Smaller file size with transparency support',
      savings: '25-35%'
    });
  }
  
  if (inputFormat === 'heic') {
    recommendations.push({
      format: 'jpg',
      reason: 'Better compatibility across devices',
      compatibility: '99%'
    });
  }
  
  if (metadata.width > 1920 || metadata.height > 1080) {
    recommendations.push({
      format: 'avif',
      reason: 'Best compression for high resolution images',
      savings: '50%+'
    });
  }
  
  return recommendations;
}

/**
 * Estimate file size after conversion
 * @param {Object} metadata - Original image metadata
 * @param {string} outputFormat - Target format
 * @param {string} quality - Quality setting
 * @returns {number} Estimated file size in bytes
 */
function estimateOutputSize(metadata, outputFormat, quality) {
  const pixels = (metadata.width || 1920) * (metadata.height || 1080);
  const qualityMultiplier = quality === 'high' ? 1.2 : quality === 'low' ? 0.6 : 1.0;
  
  const formatMultipliers = {
    'jpg': 0.1,
    'jpeg': 0.1,
    'png': 0.8,
    'webp': 0.08,
    'avif': 0.05,
    'bmp': 4.0,
    'tiff': 1.5,
    'ico': 0.02
  };
  
  const multiplier = formatMultipliers[outputFormat.toLowerCase()] || 0.5;
  return Math.round(pixels * multiplier * qualityMultiplier);
}

module.exports = {
  convert,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isConversionSupported,
  getRecommendations,
  estimateOutputSize
};