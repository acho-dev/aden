import { BaseFileProvider } from './base-provider.js';
import fetch from 'node-fetch';

/**
 * Aden Assets file provider
 * Handles downloading files from Aden's uploaded assets storage
 */
export class AdenProvider extends BaseFileProvider {
  constructor(config) {
    super(config);
  }

  /**
   * Parse Aden URI and extract path
   * @param {string} uri - URI like "aden://documents/report.pdf"
   * @returns {Object} Parsed URI components
   */
  parseUri(uri) {
    const parsed = super.parseUri(uri);
    
    // Remove leading slash if present
    parsed.path = parsed.path.replace(/^\//, '');
    
    return parsed;
  }

  /**
   * Get API endpoint URL
   * @param {string} endpoint - Endpoint path
   * @returns {string} Full API URL
   */
  getApiUrl(endpoint) {
    const host = process.env[this.config.config.hostEnvVar] || this.config.config.defaultHost;
    return `${host}${this.config.config.endpoints[endpoint]}`;
  }

  /**
   * Get authorization headers
   * @returns {Object} Headers object with authorization
   */
  getAuthHeaders() {
    const token = process.env[this.config.config.authEnvVar];
    if (!token) {
      throw new Error(`${this.config.config.authEnvVar} environment variable is not set`);
    }
    
    return {
      'Authorization': `jwt ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Download a file from Aden assets
   * @param {string} uri - URI like "aden://documents/report.pdf"
   * @param {Object} options - Download options
   * @returns {Promise<Object>} Download result
   */
  async download(uri, options = {}) {
    const parsed = this.parseUri(uri);
    const apiUrl = this.getApiUrl('download');
    
    console.log(`📥 Downloading from Aden: ${parsed.path}`);
    
    const requestBody = {
      file: {
        path: parsed.path
      }
    };
    
    if (options.customFilename) {
      requestBody.customizedFilename = options.customFilename;
    }
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to download ${parsed.path}: ${response.status} ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch (e) {
          // Use text error if not JSON
          if (errorText) {
            errorMessage = errorText;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      // Get file content as buffer
      const buffer = await response.arrayBuffer();
      
      // Extract metadata from headers
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const contentDisposition = response.headers.get('content-disposition');
      
      let filename = parsed.path.split('/').pop();
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      // Return consistent format for all providers
      return {
        success: true,
        provider: this.scheme,
        uri: uri,
        filename: filename,
        path: parsed.path,
        contentType: contentType,
        size: buffer.byteLength,
        data: Buffer.from(buffer),
        encoding: 'buffer',
        metadata: {
          downloadedAt: new Date().toISOString(),
          source: 'aden_assets'
        }
      };
      
    } catch (error) {
      console.error(`❌ Aden download error:`, error.message);
      throw error;
    }
  }

  /**
   * Get file metadata without downloading
   * @param {string} uri - URI like "aden://documents/report.pdf"
   * @returns {Promise<Object>} File metadata
   */
  async getMetadata(uri) {
    const parsed = this.parseUri(uri);
    const apiUrl = this.getApiUrl('metadata');
    
    const requestBody = {
      file: {
        path: parsed.path
      }
    };
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get metadata for ${parsed.path}`);
      }
      
      const metadata = await response.json();
      
      return {
        uri: uri,
        path: parsed.path,
        name: metadata.name,
        size: metadata.size,
        contentType: metadata.contentType,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        isPublic: metadata.isPublic || false
      };
      
    } catch (error) {
      console.error(`❌ Failed to get metadata:`, error.message);
      throw error;
    }
  }

  /**
   * List files in a directory
   * @param {string} uri - URI like "aden://documents/"
   * @param {Object} options - List options
   * @returns {Promise<Array>} List of files
   */
  async list(uri, options = {}) {
    const parsed = this.parseUri(uri);
    const apiUrl = this.getApiUrl('list');
    
    const requestBody = {
      path: parsed.path,
      limit: options.limit || 100,
      offset: options.offset || 0
    };
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list files in ${parsed.path}`);
      }
      
      const result = await response.json();
      
      // Transform to consistent format
      return (result.files || []).map(file => ({
        uri: `${this.scheme}://${file.path}`,
        path: file.path,
        name: file.name,
        size: file.size,
        contentType: file.contentType,
        isDirectory: file.isDirectory || false
      }));
      
    } catch (error) {
      console.error(`❌ Failed to list files:`, error.message);
      throw error;
    }
  }

  /**
   * Convert file to different format if needed
   * @param {Object} fileData - Downloaded file data
   * @param {string} targetFormat - Target format (base64, buffer, text)
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
        } else if (fileData.encoding === 'base64') {
          result.data = Buffer.from(fileData.data, 'base64').toString('utf-8');
          result.encoding = 'text';
        }
        break;
        
      case 'buffer':
        if (fileData.encoding === 'base64') {
          result.data = Buffer.from(fileData.data, 'base64');
          result.encoding = 'buffer';
        } else if (fileData.encoding === 'text') {
          result.data = Buffer.from(fileData.data, 'utf-8');
          result.encoding = 'buffer';
        }
        break;
        
      default:
        // Keep original format
        break;
    }
    
    return result;
  }
}