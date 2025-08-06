const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs').promises;

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Convert audio to specified format using FFmpeg
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputFormat - Target format (mp3, wav, ogg, etc.)
 * @param {Object} options - Conversion options
 * @returns {string} Path to converted file
 */
async function convert(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `output_${Date.now()}.${outputFormat}`);
  
  return new Promise((resolve, reject) => {
    try {
      console.log(`Converting audio: ${path.basename(inputPath)} → ${outputFormat}`);
      
      let command = ffmpeg(inputPath);
      
      // Apply format-specific settings
      const settings = getFormatSettings(outputFormat, options.quality || 'medium');
      
      // Set audio codec
      if (settings.codec) {
        command = command.audioCodec(settings.codec);
      }
      
      // Set bitrate
      if (settings.bitrate) {
        command = command.audioBitrate(settings.bitrate);
      }
      
      // Set sample rate
      if (settings.sampleRate) {
        command = command.audioFrequency(settings.sampleRate);
      }
      
      // Set channels
      if (settings.channels) {
        command = command.audioChannels(settings.channels);
      }
      
      // Apply additional options
      if (options.trim && options.trim.start && options.trim.duration) {
        command = command.seekInput(options.trim.start).duration(options.trim.duration);
      }
      
      if (options.normalize) {
        command = command.audioFilters(['loudnorm']);
      }
      
      // Set output format
      command = command.format(getFFmpegFormat(outputFormat));
      
      // Start conversion
      command
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`Audio conversion successful: ${inputPath} → ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error('Audio conversion error:', error);
          
          // Clean up on error
          fs.unlink(outputPath).catch(() => {});
          
          // Provide specific error messages
          if (error.message.includes('Invalid data found')) {
            const err = new Error('Audio file appears to be corrupted');
            err.code = 'CORRUPTED_FILE';
            reject(err);
          } else if (error.message.includes('not supported')) {
            const err = new Error('Audio format not supported');
            err.code = 'UNSUPPORTED_FORMAT';
            reject(err);
          } else {
            const err = new Error('Audio processing failed');
            err.code = 'PROCESSING_ERROR';
            reject(err);
          }
        })
        .run();
        
    } catch (error) {
      console.error('Audio conversion setup error:', error);
      reject(error);
    }
  });
}

/**
 * Get format-specific encoding settings
 * @param {string} format - Output format
 * @param {string} quality - Quality level (low, medium, high)
 * @returns {Object} Format settings
 */
function getFormatSettings(format, quality) {
  const qualitySettings = {
    low: { mp3: 128, aac: 96, ogg: 128, wav: null, flac: null },
    medium: { mp3: 192, aac: 128, ogg: 192, wav: null, flac: null },
    high: { mp3: 320, aac: 256, ogg: 256, wav: null, flac: null }
  };
  
  const settings = {
    mp3: {
      codec: 'libmp3lame',
      bitrate: qualitySettings[quality].mp3,
      sampleRate: 44100,
      channels: 2
    },
    wav: {
      codec: 'pcm_s16le',
      sampleRate: 44100,
      channels: 2
    },
    ogg: {
      codec: 'libvorbis',
      bitrate: qualitySettings[quality].ogg,
      sampleRate: 44100,
      channels: 2
    },
    flac: {
      codec: 'flac',
      sampleRate: 44100,
      channels: 2
    },
    m4a: {
      codec: 'aac',
      bitrate: qualitySettings[quality].aac,
      sampleRate: 44100,
      channels: 2
    },
    aac: {
      codec: 'aac',
      bitrate: qualitySettings[quality].aac,
      sampleRate: 44100,
      channels: 2
    }
  };
  
  return settings[format.toLowerCase()] || settings.mp3;
}

/**
 * Get FFmpeg format name for output format
 * @param {string} format - Output format
 * @returns {string} FFmpeg format name
 */
function getFFmpegFormat(format) {
  const formatMap = {
    'mp3': 'mp3',
    'wav': 'wav',
    'ogg': 'ogg',
    'flac': 'flac',
    'm4a': 'ipod',
    'aac': 'adts'
  };
  
  return formatMap[format.toLowerCase()] || format;
}

/**
 * Get audio file metadata
 * @param {string} inputPath - Path to audio file
 * @returns {Promise<Object>} Audio metadata
 */
function getAudioMetadata(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) {
        reject(error);
      } else {
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        
        resolve({
          duration: metadata.format.duration,
          bitrate: metadata.format.bit_rate,
          format: metadata.format.format_name,
          codec: audioStream?.codec_name,
          sampleRate: audioStream?.sample_rate,
          channels: audioStream?.channels,
          size: metadata.format.size
        });
      }
    });
  });
}

/**
 * Get supported input formats for audio
 * @returns {Array} Array of supported input formats
 */
function getSupportedInputFormats() {
  return ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', '3gp', 'amr'];
}

/**
 * Get supported output formats for audio
 * @returns {Array} Array of supported output formats
 */
function getSupportedOutputFormats() {
  return ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'];
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
  
  if (options.streaming) {
    recommendations.push({
      format: 'mp3',
      reason: 'Best compatibility for streaming',
      compatibility: '99%'
    });
  }
  
  if (options.quality === 'high' || options.archival) {
    recommendations.push({
      format: 'flac',
      reason: 'Lossless compression for archival',
      quality: 'Perfect'
    });
  }
  
  if (options.fileSize === 'small') {
    recommendations.push({
      format: 'ogg',
      reason: 'Better compression than MP3',
      savings: '15-20%'
    });
  }
  
  if (inputFormat === 'm4a' && options.compatibility) {
    recommendations.push({
      format: 'mp3',
      reason: 'Universal compatibility',
      compatibility: 'All devices'
    });
  }
  
  return recommendations;
}

/**
 * Estimate conversion time based on duration and format
 * @param {number} duration - Audio duration in seconds
 * @param {string} outputFormat - Target format
 * @param {string} quality - Quality setting
 * @returns {number} Estimated time in seconds
 */
function estimateConversionTime(duration, outputFormat, quality) {
  // Base conversion speed (real-time multiplier)
  const baseSpeed = {
    'mp3': 0.1,
    'wav': 0.05,
    'ogg': 0.15,
    'flac': 0.2,
    'm4a': 0.12,
    'aac': 0.1
  };
  
  const qualityMultiplier = {
    'low': 0.8,
    'medium': 1.0,
    'high': 1.3
  };
  
  const speed = baseSpeed[outputFormat.toLowerCase()] || 0.1;
  const multiplier = qualityMultiplier[quality] || 1.0;
  
  return Math.max(1, Math.round(duration * speed * multiplier));
}

/**
 * Extract audio from video file
 * @param {string} inputPath - Path to video file
 * @param {string} outputFormat - Audio format to extract
 * @param {Object} options - Extraction options
 * @returns {string} Path to extracted audio
 */
async function extractAudioFromVideo(inputPath, outputFormat, options = {}) {
  const outputPath = path.join('/tmp', `extracted_${Date.now()}.${outputFormat}`);
  
  return new Promise((resolve, reject) => {
    const settings = getFormatSettings(outputFormat, options.quality || 'medium');
    
    let command = ffmpeg(inputPath)
      .noVideo()
      .audioCodec(settings.codec);
    
    if (settings.bitrate) {
      command = command.audioBitrate(settings.bitrate);
    }
    
    command
      .output(outputPath)
      .on('end', () => {
        console.log(`Audio extraction successful: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (error) => {
        console.error('Audio extraction error:', error);
        fs.unlink(outputPath).catch(() => {});
        reject(error);
      })
      .run();
  });
}

module.exports = {
  convert,
  getAudioMetadata,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isConversionSupported,
  getRecommendations,
  estimateConversionTime,
  extractAudioFromVideo
};