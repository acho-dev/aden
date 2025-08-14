import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

/**
 * Proxy configuration utility for managing HTTP/HTTPS/SOCKS proxy settings
 * Supports environment variables: https_proxy, http_proxy, all_proxy
 */
export class ProxyConfig {
  constructor() {
    this.proxyAgent = null;
    this.proxyUrl = null;
    this.initialize();
  }

  /**
   * Initialize proxy configuration from environment variables
   */
  initialize() {
    // Check for proxy environment variables in order of precedence
    const httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY;
    const httpProxy = process.env.http_proxy || process.env.HTTP_PROXY;
    const allProxy = process.env.all_proxy || process.env.ALL_PROXY;
    
    // Determine which proxy to use
    let proxyUrl = httpsProxy || httpProxy || allProxy;
    
    if (proxyUrl) {
      this.proxyUrl = proxyUrl;
      console.log(`🌐 Proxy detected: ${this.maskUrl(proxyUrl)}`);
      
      // Create appropriate proxy agent based on protocol
      if (proxyUrl.startsWith('socks://') || proxyUrl.startsWith('socks5://')) {
        this.proxyAgent = new SocksProxyAgent(proxyUrl);
        console.log('🧦 Using SOCKS proxy agent');
      } else {
        this.proxyAgent = new HttpsProxyAgent(proxyUrl);
        console.log('🔒 Using HTTPS proxy agent');
      }
    } else {
      console.log('ℹ️ No proxy configuration detected');
    }
  }

  /**
   * Mask sensitive parts of proxy URL for logging
   * @param {string} url - Proxy URL
   * @returns {string} Masked URL
   */
  maskUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '****';
      }
      if (urlObj.username && urlObj.username.length > 2) {
        urlObj.username = urlObj.username.substring(0, 2) + '****';
      }
      return urlObj.toString();
    } catch {
      // If URL parsing fails, just show protocol and host
      const match = url.match(/^(\w+:\/\/[^:/@]+)/);
      return match ? match[1] + ':****' : 'proxy://****';
    }
  }

  /**
   * Get proxy agent for HTTP/HTTPS requests
   * @returns {HttpsProxyAgent|SocksProxyAgent|null} Proxy agent or null if no proxy configured
   */
  getAgent() {
    return this.proxyAgent;
  }

  /**
   * Get proxy URL
   * @returns {string|null} Proxy URL or null if no proxy configured
   */
  getProxyUrl() {
    return this.proxyUrl;
  }

  /**
   * Check if proxy is configured
   * @returns {boolean} True if proxy is configured
   */
  hasProxy() {
    return this.proxyAgent !== null;
  }

  /**
   * Get configuration for Anthropic SDK
   * @param {string} apiKey - API key
   * @returns {Object} Configuration object for Anthropic SDK
   */
  getAnthropicConfig(apiKey) {
    const config = {
      apiKey: apiKey,
    };

    if (this.hasProxy()) {
      // Anthropic SDK uses fetch internally, so we need to provide a custom fetch
      config.fetch = this.createProxyFetch();
    }

    return config;
  }

  /**
   * Get configuration for OpenAI SDK
   * @param {string} apiKey - API key
   * @returns {Object} Configuration object for OpenAI SDK
   */
  getOpenAIConfig(apiKey) {
    const config = {
      apiKey: apiKey,
    };

    if (this.hasProxy()) {
      // OpenAI SDK supports httpAgent option
      config.httpAgent = this.proxyAgent;
    }

    return config;
  }

  /**
   * Get configuration for Google Generative AI SDK
   * @param {string} apiKey - API key
   * @returns {Object} Configuration object for Google Generative AI SDK
   */
  getGeminiConfig(apiKey) {
    const config = {
      apiKey: apiKey,
    };

    if (this.hasProxy()) {
      // Gemini SDK might need custom fetch implementation
      config.requestOptions = {
        agent: this.proxyAgent
      };
    }

    return config;
  }

  /**
   * Create a custom fetch function that uses the proxy
   * @returns {Function} Custom fetch function
   */
  createProxyFetch() {
    const agent = this.proxyAgent;
    
    return async (url, options = {}) => {
      const fetchOptions = {
        ...options,
        agent: agent
      };
      
      return fetch(url, fetchOptions);
    };
  }

  /**
   * Test proxy connection
   * @param {string} testUrl - URL to test (default: https://api.anthropic.com)
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection(testUrl = 'https://api.anthropic.com') {
    if (!this.hasProxy()) {
      console.log('ℹ️ No proxy configured, testing direct connection...');
    } else {
      console.log(`🧪 Testing proxy connection to ${testUrl}...`);
    }

    try {
      const response = await fetch(testUrl, {
        method: 'HEAD',
        agent: this.proxyAgent,
        timeout: 10000,
      });

      console.log(`✅ Connection successful (status: ${response.status})`);
      return true;
    } catch (error) {
      console.error(`❌ Connection failed: ${error.message}`);
      return false;
    }
  }
}

// Export singleton instance
export const proxyConfig = new ProxyConfig();