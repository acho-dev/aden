import { BaseFileProvider } from './base-provider.js';
import fetch from 'node-fetch';
import { URL } from 'url';

/**
 * HTTP/HTTPS file provider
 * Handles downloading files from HTTP/HTTPS URLs
 */
export class HttpProvider extends BaseFileProvider {
  constructor(config) {
    super(config);
    // Handle both http and https schemes
    this.schemes = ['http', 'https'];
  }

  /**
   * Check if URI can be handled
   * @param {string} uri - URI to check
   * @returns {boolean} True if can handle
   */
  canHandle(uri) {
    return uri.startsWith('http://') || uri.startsWith('https://');
  }

  /**
   * Parse HTTP/HTTPS URI
   * @param {string} uri - URI like "https://example.com/data/file.csv"
   * @returns {Object} Parsed URI components
   */
  parseUri(uri) {
    try {
      const url = new URL(uri);
      
      return {
        scheme: url.protocol.replace(':', ''),
        host: url.host,
        path: url.pathname,
        query: url.search,
        raw: uri,
        url: url
      };
    } catch (error) {
      throw new Error(`Invalid HTTP/HTTPS URI: ${uri}`);
    }
  }

  /**
   * Download a file from HTTP/HTTPS URL
   * @param {string} uri - HTTP/HTTPS URL
   * @param {Object} options - Download options
   * @returns {Promise<Object>} File data
   */
  async download(uri, options = {}) {
    const parsed = this.parseUri(uri);
    
    console.log(`🌐 Downloading from HTTP: ${uri}`);
    
    const fetchOptions = {
      method: 'GET',
      timeout: this.config.config.timeout || 300000,
      headers: {
        'User-Agent': this.config.config.userAgent || 'Aden-MCP-FileDownloader/1.0'
      }
    };
    
    // Add custom headers if provided
    if (options.headers) {
      Object.assign(fetchOptions.headers, options.headers);
    }
    
    // Add authentication if provided
    if (options.auth) {
      if (options.auth.type === 'bearer') {
        fetchOptions.headers['Authorization'] = `Bearer ${options.auth.token}`;
      } else if (options.auth.type === 'basic') {
        const credentials = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString('base64');
        fetchOptions.headers['Authorization'] = `Basic ${credentials}`;
      }
    }
    
    try {
      const response = await fetch(uri, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
      }
      
      // Get content length for size validation
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        this.validateFileSize(size);
      }
      
      // Get file content as buffer
      const buffer = await response.arrayBuffer();
      
      // Extract metadata from headers and URL
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const contentDisposition = response.headers.get('content-disposition');
      
      // Extract filename from various sources
      let filename = this.extractFilename(parsed.path, contentDisposition);
      
      return {
        success: true,
        provider: 'http',
        uri: uri,
        filename: filename,
        url: uri,
        contentType: contentType,
        size: buffer.byteLength,
        data: Buffer.from(buffer),
        encoding: 'buffer',
        metadata: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          downloadedAt: new Date().toISOString(),
          source: 'http'
        }
      };
      
    } catch (error) {
      console.error(`❌ HTTP download error:`, error.message);
      throw error;
    }
  }

  /**
   * Get file metadata using HEAD request
   * @param {string} uri - HTTP/HTTPS URL
   * @returns {Promise<Object>} File metadata
   */
  async getMetadata(uri) {
    const parsed = this.parseUri(uri);
    
    const fetchOptions = {
      method: 'HEAD',
      timeout: 30000,
      headers: {
        'User-Agent': this.config.config.userAgent || 'Aden-MCP-FileDownloader/1.0'
      }
    };
    
    try {
      const response = await fetch(uri, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`Failed to get metadata: ${response.status} ${response.statusText}`);
      }
      
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const lastModified = response.headers.get('last-modified');
      const etag = response.headers.get('etag');
      
      return {
        uri: uri,
        url: uri,
        filename: this.extractFilename(parsed.path, response.headers.get('content-disposition')),
        size: contentLength ? parseInt(contentLength, 10) : null,
        contentType: contentType,
        lastModified: lastModified || null,
        etag: etag || null,
        headers: Object.fromEntries(response.headers.entries())
      };
      
    } catch (error) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  /**
   * List is not supported for HTTP provider
   * @throws {Error} Always throws not supported error
   */
  async list(uri, options = {}) {
    throw new Error('Directory listing is not supported for HTTP/HTTPS URLs');
  }

  /**
   * Extract filename from path or content-disposition header
   * @param {string} urlPath - URL path
   * @param {string} contentDisposition - Content-Disposition header value
   * @returns {string} Extracted filename
   */
  extractFilename(urlPath, contentDisposition) {
    // Try to get from Content-Disposition header first
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        return filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // Fallback to URL path
    const pathParts = urlPath.split('/').filter(p => p);
    return pathParts[pathParts.length - 1] || 'download';
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