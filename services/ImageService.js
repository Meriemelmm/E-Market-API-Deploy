const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

class ImageService {
  
  constructor() {
    this.baseDir = 'uploads/products';
    this.sizes = {
      thumbnail: { width: 150, height: 150 },
      small: { width: 300, height: 300 },
      medium: { width: 600, height: 600 },
      large: { width: 1200, height: 1200 }
    };
  }

  /**
   * Create directories for different image sizes
   */
  async createDirectories() {
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, 'original'),
      path.join(this.baseDir, 'thumbnails'),
      path.join(this.baseDir, 'small'),
      path.join(this.baseDir, 'medium'),
      path.join(this.baseDir, 'large')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Generate unique filename
   */
  generateFilename(originalName, size = 'original') {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    
    return `${name}-${timestamp}-${random}-${size}${ext}`;
  }

  /**
   * Process single image and create multiple sizes
   */
  async processImage(file, productId = null) {
    try {
      await this.createDirectories();

      const originalName = file.originalname;
      const originalFilename = this.generateFilename(originalName, 'original');
      const originalPath = path.join(this.baseDir, 'original', originalFilename);

      // Save original image
      await sharp(file.buffer)
        .jpeg({ quality: 90 })
        .toFile(originalPath);

      const processedImages = {
        original: {
          url: `/uploads/products/original/${originalFilename}`,
          filename: originalFilename,
          originalName: originalName,
          size: file.size,
          mimetype: file.mimetype,
          isMain: true
        }
      };

      // Generate different sizes
      for (const [sizeName, dimensions] of Object.entries(this.sizes)) {
        const filename = this.generateFilename(originalName, sizeName);
        const sizeDir = sizeName === 'thumbnail' ? 'thumbnails' : sizeName;
        const outputPath = path.join(this.baseDir, sizeDir, filename);

        await sharp(file.buffer)
          .resize(dimensions.width, dimensions.height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 85 })
          .toFile(outputPath);

        processedImages[sizeName] = {
          url: `/uploads/products/${sizeDir}/${filename}`,
          filename: filename,
          width: dimensions.width,
          height: dimensions.height,
          size: fs.statSync(outputPath).size
        };
      }

      return processedImages;

    } catch (error) {
      console.error('Error processing image:', error);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Process multiple images
   */
  async processMultipleImages(files) {
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const processed = await this.processImage(file);
      
      // Set first image as main
      if (i === 0) {
        processed.original.isMain = true;
      } else {
        processed.original.isMain = false;
      }
      
      results.push(processed);
    }
    
    return results;
  }

  /**
   * Get all image URLs for a product
   */
  getImageUrls(processedImages, baseUrl = 'http://localhost:3000') {
    const urls = {};
    
    for (const [size, data] of Object.entries(processedImages)) {
      if (data.url) {
        urls[size] = data.url.startsWith('/') 
          ? `${baseUrl}${data.url}` 
          : data.url;
      }
    }
    
    return urls;
  }

  /**
   * Delete image files
   */
  async deleteImageFiles(processedImages) {
    try {
      for (const [size, data] of Object.entries(processedImages)) {
        if (data.filename) {
          const filePath = path.join(this.baseDir, size, data.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      console.error('Error deleting image files:', error);
    }
  }

  /**
   * Optimize existing image
   */
  async optimizeImage(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      width: 800,
      height: 600,
      quality: 85,
      format: 'jpeg'
    };

    const config = { ...defaultOptions, ...options };

    await sharp(inputPath)
      .resize(config.width, config.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: config.quality })
      .toFile(outputPath);
  }

  /**
   * Convert to WebP format
   */
  async convertToWebP(inputPath, outputPath, quality = 80) {
    await sharp(inputPath)
      .webp({ quality })
      .toFile(outputPath);
  }

  /**
   * Get image metadata
   */
  async getImageMetadata(filePath) {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        density: metadata.density
      };
    } catch (error) {
      console.error('Error getting image metadata:', error);
      return null;
    }
  }
}

module.exports = new ImageService();