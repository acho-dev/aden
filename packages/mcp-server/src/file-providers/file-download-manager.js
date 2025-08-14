import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AdenProvider } from './aden-provider.js';
import { LocalProvider } from './local-provider.js';
import { HttpProvider } from './http-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * FileDownloadManager - Centralized file download management
 * Handles multiple file providers based on URI schemes
 */
export class FileDownloadManager {
  constructor() {
    this.providers = new Map();
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialize the download manager with configuration
   * @param {string} configPath - Path to configuration file
   */
  async initialize(configPath = null) {
    if (this.initialized) {
      return;
    }

    // Load configuration
    const defaultConfigPath = path.join(__dirname, '../config/file-providers.config.json');
    const configFile = configPath || defaultConfigPath;
    
    try {
      const configContent = await fs.readFile(configFile, 'utf-8');
      this.config = JSON.parse(configContent);
    } catch (error) {
      console.error(`Failed to load config from ${configFile}:`, error.message);
      throw new Error(`Failed to initialize FileDownloadManager: ${error.message}`);
    }

    // Initialize providers
    await this.initializeProviders();
    
    this.initialized = true;
    console.log(`✅ FileDownloadManager initialized with ${this.providers.size} providers`);
  }

  /**
   * Initialize all configured providers
   */
  async initializeProviders() {
    const providerConfigs = this.config.providers;
    
    for (const [key, providerConfig] of Object.entries(providerConfigs)) {
      if (!providerConfig.enabled) {
        console.log(`⏭️  Skipping disabled provider: ${providerConfig.name}`);
        continue;
      }

      try {
        let provider;
        
        switch (key) {
          case 'aden':
            provider = new AdenProvider(providerConfig);
            break;
          case 'local':
            provider = new LocalProvider(providerConfig);
            break;
          case 'http':
            provider = new HttpProvider(providerConfig);
            break;
          case 'gcs':
            // Future: provider = new GcsProvider(providerConfig);
            console.log(`⚠️  GCS provider not yet implemented`);
            continue;
          case 's3':
            // Future: provider = new S3Provider(providerConfig);
            console.log(`⚠️  S3 provider not yet implemented`);
            continue;
          default:
            console.warn(`Unknown provider type: ${key}`);
            continue;
        }

        if (provider && await provider.isReady()) {
          this.providers.set(providerConfig.scheme, provider);
          // Also register https as an alias for http provider
          if (providerConfig.scheme === 'http') {
            this.providers.set('https', provider);
          }
          console.log(`✅ Registered provider: ${providerConfig.name} (${providerConfig.scheme}://)`);
        }
      } catch (error) {
        console.error(`Failed to initialize ${providerConfig.name}:`, error.message);
      }
    }
  }

  /**
   * Get provider for a URI
   * @param {string} uri - File URI
   * @returns {BaseFileProvider} Provider instance
   */
  getProvider(uri) {
    // Extract scheme from URI
    const schemeMatch = uri.match(/^([a-z]+):\/\//i);
    if (!schemeMatch) {
      throw new Error(`Invalid URI format: ${uri}`);
    }
    
    const scheme = schemeMatch[1].toLowerCase();
    const provider = this.providers.get(scheme);
    
    if (!provider) {
      throw new Error(`No provider available for scheme: ${scheme}`);
    }
    
    return provider;
  }

  /**
   * Download a file from any supported URI
   * @param {string} uri - File URI (e.g., "aden://path/to/file")
   * @param {Object} options - Download options
   * @returns {Promise<Object>} Download result
   */
  async download(uri, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = this.getProvider(uri);
    
    console.log(`📥 Downloading: ${uri}`);
    console.log(`📦 Using provider: ${provider.name}`);
    
    try {
      const result = await provider.download(uri, options);
      
      // Add manager metadata
      result.downloadedBy = 'FileDownloadManager';
      result.downloadedAt = new Date().toISOString();
      
      // Convert format if requested
      if (options.format && result.encoding !== options.format) {
        const converted = provider.convertFormat(result, options.format);
        return converted;
      }
      
      // Save to local file if requested
      if (options.saveToPath) {
        await this.saveToFile(result, options.saveToPath);
        result.savedTo = options.saveToPath;
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Download failed:`, error.message);
      throw error;
    }
  }

  /**
   * Download multiple files in parallel
   * @param {Array<string>} uris - Array of file URIs
   * @param {Object} options - Download options
   * @returns {Promise<Array>} Array of download results
   */
  async downloadBatch(uris, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const downloadPromises = uris.map(uri => 
      this.download(uri, options).catch(error => ({
        success: false,
        uri: uri,
        error: error.message
      }))
    );
    
    return await Promise.all(downloadPromises);
  }

  /**
   * Get metadata for a file without downloading
   * @param {string} uri - File URI
   * @returns {Promise<Object>} File metadata
   */
  async getMetadata(uri) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = this.getProvider(uri);
    return await provider.getMetadata(uri);
  }

  /**
   * List files in a directory/bucket
   * @param {string} uri - Directory/bucket URI
   * @param {Object} options - List options
   * @returns {Promise<Array>} List of files
   */
  async list(uri, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = this.getProvider(uri);
    return await provider.list(uri, options);
  }

  /**
   * Check if a file exists
   * @param {string} uri - File URI
   * @returns {Promise<boolean>} True if file exists
   */
  async exists(uri) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = this.getProvider(uri);
    return await provider.exists(uri);
  }

  /**
   * Save downloaded file to local filesystem
   * @param {Object} fileData - Downloaded file data
   * @param {string} localPath - Local path to save file
   */
  async saveToFile(fileData, localPath) {
    const resolvedPath = path.resolve(localPath);
    const dir = path.dirname(resolvedPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Convert to buffer if needed
    let buffer;
    if (fileData.encoding === 'buffer') {
      buffer = fileData.data;
    } else if (fileData.encoding === 'base64') {
      buffer = Buffer.from(fileData.data, 'base64');
    } else if (fileData.encoding === 'text') {
      buffer = Buffer.from(fileData.data, 'utf-8');
    } else {
      throw new Error(`Unknown encoding: ${fileData.encoding}`);
    }
    
    await fs.writeFile(resolvedPath, buffer);
    console.log(`💾 Saved to: ${resolvedPath}`);
  }

  /**
   * Get list of available providers
   * @returns {Array} Provider information
   */
  getAvailableProviders() {
    const providers = [];
    
    for (const [scheme, provider] of this.providers) {
      providers.push(provider.getInfo());
    }
    
    return providers;
  }

  /**
   * Get URI patterns for all providers
   * @returns {Object} URI patterns
   */
  getUriPatterns() {
    return this.config?.uriPatterns || {};
  }

  /**
   * Validate a URI format
   * @param {string} uri - URI to validate
   * @returns {Object} Validation result
   */
  validateUri(uri) {
    try {
      const provider = this.getProvider(uri);
      const parsed = provider.parseUri(uri);
      
      return {
        valid: true,
        scheme: parsed.scheme,
        provider: provider.name,
        path: parsed.path
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const fileDownloadManager = new FileDownloadManager();