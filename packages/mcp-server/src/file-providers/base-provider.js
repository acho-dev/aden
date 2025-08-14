/**
 * Base class for file providers
 * All file providers must extend this class and implement the required methods
 */
export class BaseFileProvider {
  constructor(config) {
    this.config = config;
    this.scheme = config.scheme;
    this.name = config.name;
    this.enabled = config.enabled || false;
  }

  /**
   * Parse a URI and extract provider-specific components
   * @param {string} uri - The URI to parse (e.g., "aden://path/to/file")
   * @returns {Object} Parsed URI components
   */
  parseUri(uri) {
    const match = uri.match(new RegExp(`^${this.scheme}://(.+)$`));
    if (!match) {
      throw new Error(`Invalid ${this.scheme} URI: ${uri}`);
    }
    return {
      scheme: this.scheme,
      path: match[1],
      raw: uri
    };
  }

  /**
   * Validate if a URI can be handled by this provider
   * @param {string} uri - The URI to validate
   * @returns {boolean} True if the URI can be handled
   */
  canHandle(uri) {
    return uri.startsWith(`${this.scheme}://`);
  }

  /**
   * Check if the provider is properly configured and ready
   * @returns {Promise<boolean>} True if ready, false otherwise
   */
  async isReady() {
    if (!this.enabled) {
      return false;
    }

    if (this.config.config.requiresAuth) {
      const authEnvVar = this.config.config.authEnvVar;
      if (!process.env[authEnvVar]) {
        console.warn(`⚠️ ${this.name} provider requires ${authEnvVar} environment variable`);
        return false;
      }
    }

    return true;
  }

  /**
   * Download a file from the provider
   * @param {string} uri - The URI of the file to download
   * @param {Object} options - Download options
   * @returns {Promise<Object>} Download result with file data and metadata
   */
  async download(uri, options = {}) {
    throw new Error(`download() method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Get file metadata without downloading the content
   * @param {string} uri - The URI of the file
   * @returns {Promise<Object>} File metadata
   */
  async getMetadata(uri) {
    throw new Error(`getMetadata() method must be implemented by ${this.constructor.name}`);
  }

  /**
   * List files in a directory/bucket
   * @param {string} uri - The URI of the directory/bucket
   * @param {Object} options - List options
   * @returns {Promise<Array>} List of files
   */
  async list(uri, options = {}) {
    throw new Error(`list() method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Check if a file exists
   * @param {string} uri - The URI of the file
   * @returns {Promise<boolean>} True if file exists
   */
  async exists(uri) {
    try {
      await this.getMetadata(uri);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get provider info
   * @returns {Object} Provider information
   */
  getInfo() {
    return {
      scheme: this.scheme,
      name: this.name,
      description: this.config.description,
      enabled: this.enabled,
      features: this.config.features,
      supportedFormats: this.config.supportedFormats,
      maxFileSize: this.config.maxFileSize
    };
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Validate file size against provider limits
   * @param {number} size - File size in bytes
   * @throws {Error} If file size exceeds limit
   */
  validateFileSize(size) {
    if (size > this.config.maxFileSize) {
      throw new Error(
        `File size (${this.formatFileSize(size)}) exceeds ${this.name} limit (${this.formatFileSize(this.config.maxFileSize)})`
      );
    }
  }
}