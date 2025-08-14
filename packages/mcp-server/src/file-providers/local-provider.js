import { BaseFileProvider } from './base-provider.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Local filesystem file provider
 * Handles downloading files from the local filesystem
 */
export class LocalProvider extends BaseFileProvider {
  constructor(config) {
    super(config);
  }

  /**
   * Parse local file URI
   * @param {string} uri - URI like "file:///home/user/document.pdf"
   * @returns {Object} Parsed URI components
   */
  parseUri(uri) {
    const match = uri.match(/^file:\/\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid file URI: ${uri}`);
    }
    
    return {
      scheme: 'file',
      path: match[1],
      raw: uri
    };
  }

  /**
   * Check if path is allowed based on configuration
   * @param {string} filePath - File path to check
   * @returns {boolean} True if path is allowed
   */
  isPathAllowed(filePath) {
    const allowedPaths = this.config.config.allowedPaths || [];
    const resolvedPath = path.resolve(filePath);
    
    if (allowedPaths.length === 0) {
      // No restrictions if no allowed paths configured
      return true;
    }
    
    for (const allowed of allowedPaths) {
      const resolvedAllowed = path.resolve(allowed);
      if (resolvedPath.startsWith(resolvedAllowed)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Download (read) a file from local filesystem
   * @param {string} uri - URI like "file:///home/user/document.pdf"
   * @param {Object} options - Download options
   * @returns {Promise<Object>} File data
   */
  async download(uri, options = {}) {
    const parsed = this.parseUri(uri);
    const filePath = parsed.path;
    
    // Check if path is allowed
    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${filePath} is not in allowed paths`);
    }
    
    console.log(`📁 Reading local file: ${filePath}`);
    
    try {
      // Check if file exists
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      // Validate file size
      this.validateFileSize(stats.size);
      
      // Read file content
      const data = await fs.readFile(filePath);
      
      // Determine content type from extension
      const ext = path.extname(filePath).toLowerCase();
      const contentType = this.getContentType(ext);
      
      return {
        success: true,
        provider: this.scheme,
        uri: uri,
        filename: path.basename(filePath),
        path: filePath,
        contentType: contentType,
        size: stats.size,
        data: data,
        encoding: 'buffer',
        metadata: {
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          downloadedAt: new Date().toISOString(),
          source: 'local_filesystem'
        }
      };
      
    } catch (error) {
      console.error(`❌ Local file read error:`, error.message);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {string} uri - File URI
   * @returns {Promise<Object>} File metadata
   */
  async getMetadata(uri) {
    const parsed = this.parseUri(uri);
    const filePath = parsed.path;
    
    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${filePath} is not in allowed paths`);
    }
    
    try {
      const stats = await fs.stat(filePath);
      
      return {
        uri: uri,
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        contentType: this.getContentType(path.extname(filePath))
      };
      
    } catch (error) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  /**
   * List files in a directory
   * @param {string} uri - Directory URI
   * @param {Object} options - List options
   * @returns {Promise<Array>} List of files
   */
  async list(uri, options = {}) {
    const parsed = this.parseUri(uri);
    const dirPath = parsed.path;
    
    if (!this.isPathAllowed(dirPath)) {
      throw new Error(`Access denied: ${dirPath} is not in allowed paths`);
    }
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const files = [];
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        const stats = await fs.stat(fullPath);
        
        files.push({
          uri: `file://${fullPath}`,
          path: fullPath,
          name: item.name,
          size: stats.size,
          isDirectory: item.isDirectory(),
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          contentType: item.isDirectory() ? 'directory' : this.getContentType(path.extname(item.name))
        });
      }
      
      return files;
      
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  /**
   * Get content type from file extension
   * @param {string} ext - File extension
   * @returns {string} Content type
   */
  getContentType(ext) {
    const mimeTypes = {
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.xml': 'text/xml',
      '.html': 'text/html',
      '.md': 'text/markdown'
    };
    
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Convert file format
   * @param {Object} fileData - File data
   * @param {string} targetFormat - Target format
   * @returns {Object} Converted file data
   */
  convertFormat(fileData, targetFormat) {
    const result = { ...fileData };
    
    switch (targetFormat) {
      case 'base64':
        if (fileData.encoding === 'buffer') {
          result.data = fileData.data.toString('base64');
          result.encoding = 'base64';
        }
        break;
        
      case 'text':
        if (fileData.encoding === 'buffer') {
          result.data = fileData.data.toString('utf-8');
          result.encoding = 'text';
        }
        break;
        
      case 'buffer':
        // Already in buffer format
        break;
        
      default:
        break;
    }
    
    return result;
  }
}