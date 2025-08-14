import { ClaudeLLM } from "./claude-llm.js";
import { OpenAILLM } from "./openai-llm.js";
import { GeminiLLM } from "./gemini-llm.js";
import { GroqLLM } from "./groq-llm.js";

/**
 * Enhanced factory for creating multi-vendor LLM instances
 */
export class LLMFactory {
  static PROVIDERS = {
    CLAUDE: "claude",
    OPENAI: "openai",
    GEMINI: "gemini",
    GROQ: "groq",
  };

  static MODELS = {
    CLAUDE: {
      "claude-3-5-sonnet-20241022": "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022": "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229": "claude-3-opus-20240229",
      "claude-3-sonnet-20240229": "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307": "claude-3-haiku-20240307",
    },
    OPENAI: {
      "gpt-4o": "gpt-4o",
      "gpt-4o-mini": "gpt-4o-mini",
      "gpt-4-turbo": "gpt-4-turbo",
      "gpt-4": "gpt-4",
      "gpt-3.5-turbo": "gpt-3.5-turbo",
    },
    GEMINI: {
      "gemini-2.5-pro": "gemini-2.5-pro",
      "gemini-2.5-flash": "gemini-2.5-flash",
      "gemini-1.5-pro": "gemini-1.5-pro",
      "gemini-1.5-flash": "gemini-1.5-flash",
      "gemini-1.0-pro": "gemini-1.0-pro",
    },
    GROQ: {
      "qwen/qwen3-32b": "qwen/qwen3-32b",
      "moonshotai/kimi-k2-instruct": "moonshotai/kimi-k2-instruct",
      "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
      "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
    },
  };

  static PROVIDER_FEATURES = {
    CLAUDE: {
      streaming: true,
      functionCalling: true,
      vision: true,
      analyticsSubagent: true,
      businessQueryDetection: true,
      maxContextLength: 200000,
      strengths: ["reasoning", "analysis", "code", "business intelligence"],
    },
    OPENAI: {
      streaming: true,
      functionCalling: true,
      vision: true,
      maxContextLength: 128000,
      strengths: ["versatility", "creativity", "general tasks", "function calling"],
    },
    GEMINI: {
      streaming: true,
      functionCalling: true,
      vision: true,
      codeExecution: true,
      longContext: true,
      maxContextLength: 2097152,
      strengths: ["long context", "multimodal", "code execution", "reasoning"],
    },
    GROQ: {
      streaming: true,
      functionCalling: true,
      vision: false,
      analyticsSubagent: true,
      businessQueryDetection: true,
      ultraFast: true,
      binaryDecisions: true,
      classification: true,
      longContext: true,
      maxContextLength: 131072, // 128k context for llama-3.3-70b-versatile
      strengths: ["speed", "cost effective", "function calling", "long context", "classification"],
    },
  };

  /**
   * Create an LLM instance
   * @param {string} provider - Provider name
   * @param {Object} config - Configuration object
   * @param {string} config.model - Model name
   * @param {number} config.maxTokens - Maximum tokens
   * @param {number} config.temperature - Temperature setting
   * @param {Object} credentials - API credentials
   * @param {string} credentials.apiKey - API key
   * @returns {Promise<BaseLLM>} LLM instance
   */
  static async create(provider, config = {}, credentials = {}) {
    // Validate provider
    if (!this.getSupportedProviders().includes(provider.toLowerCase())) {
      throw new Error(
        `Unsupported LLM provider: ${provider}. Supported providers: ${this.getSupportedProviders().join(
          ", "
        )}`
      );
    }

    // Apply provider-specific defaults
    const providerConfig = this.applyProviderDefaults(provider, config);

    let llm;

    switch (provider.toLowerCase()) {
      case this.PROVIDERS.CLAUDE:
        llm = new ClaudeLLM(providerConfig);
        break;

      case this.PROVIDERS.OPENAI:
        llm = new OpenAILLM(providerConfig);
        break;

      case this.PROVIDERS.GEMINI:
        llm = new GeminiLLM(providerConfig);
        break;

      case this.PROVIDERS.GROQ:
        llm = new GroqLLM(credentials.apiKey, providerConfig);
        return llm; // Groq doesn't need initialize() call

      default:
        throw new Error(`Provider implementation not found: ${provider}`);
    }

    await llm.initialize(credentials);
    return llm;
  }

  /**
   * Apply provider-specific default configurations
   * @param {string} provider - Provider name
   * @param {Object} config - User configuration
   * @returns {Object} Enhanced configuration
   */
  static applyProviderDefaults(provider, config) {
    const defaults = this.getRecommendedSettings(provider, config.model);
    const features = this.PROVIDER_FEATURES[provider.toUpperCase()];

    return {
      ...defaults,
      ...config,
      // Add provider metadata
      providerName: provider,
      maxContextLength: features?.maxContextLength || 4000,
      capabilities: features || {},
    };
  }

  /**
   * Get available models for a provider
   * @param {string} provider - Provider name
   * @returns {Array<string>} Available model names
   */
  static getAvailableModels(provider) {
    const providerKey = provider.toUpperCase();

    if (!this.MODELS[providerKey]) {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    return Object.keys(this.MODELS[providerKey]);
  }

  /**
   * Get all supported providers
   * @returns {Array<string>} Provider names
   */
  static getSupportedProviders() {
    return Object.values(this.PROVIDERS);
  }

  /**
   * Validate model for provider
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {boolean} Whether model is valid for provider
   */
  static isValidModel(provider, model) {
    const availableModels = this.getAvailableModels(provider);
    return availableModels.includes(model);
  }

  /**
   * Get default model for provider
   * @param {string} provider - Provider name
   * @returns {string} Default model name
   */
  static getDefaultModel(provider) {
    switch (provider.toLowerCase()) {
      case this.PROVIDERS.CLAUDE:
        return "claude-3-5-sonnet-20241022";

      case this.PROVIDERS.OPENAI:
        return "gpt-4o";

      case this.PROVIDERS.GEMINI:
        return "gemini-2.5-pro";

      case this.PROVIDERS.GROQ:
        return "llama-3.3-70b-versatile";

      case this.PROVIDERS.MISTRAL:
        return "mistral-large-latest";

      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /**
   * Get recommended settings for a provider/model combination
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {Object} Recommended settings
   */
  static getRecommendedSettings(provider, model) {
    const defaults = {
      temperature: 0.7,
      maxTokens: 4000,
    };

    switch (provider.toLowerCase()) {
      case this.PROVIDERS.CLAUDE:
        return {
          ...defaults,
          temperature: model?.includes("haiku") ? 0.5 : 0.7,
          maxTokens: model?.includes("opus") ? 8000 : 4000,
        };

      case this.PROVIDERS.OPENAI:
        return {
          ...defaults,
          temperature: model?.includes("gpt-4") ? 0.7 : 0.8,
          maxTokens: model?.includes("gpt-4") ? 4000 : 3000,
        };

      case this.PROVIDERS.GEMINI:
        return {
          ...defaults,
          temperature: 0.7,
          maxTokens: model?.includes("flash") ? 8000 : 8192,
        };

      case this.PROVIDERS.GROQ:
        return {
          ...defaults,
          temperature: 0.7,
          maxTokens: model?.includes("70b") ? 8000 : 4000,
        };

      case this.PROVIDERS.MISTRAL:
        return {
          ...defaults,
          temperature: 0.7,
          maxTokens: model?.includes("large") ? 8000 : 4000,
        };

      default:
        return defaults;
    }
  }

  /**
   * Get provider capabilities and features
   * @param {string} provider - Provider name
   * @returns {Object} Provider features and capabilities
   */
  static getProviderFeatures(provider) {
    const features = this.PROVIDER_FEATURES[provider.toUpperCase()];
    if (!features) {
      throw new Error(`Provider features not found for: ${provider}`);
    }
    return { ...features };
  }

  /**
   * Recommend best provider for a specific task type
   * @param {string} taskType - Type of task (e.g., 'analysis', 'creative', 'code', 'longContext')
   * @param {Object} requirements - Task requirements
   * @returns {Array<string>} Recommended providers in order of preference
   */
  static recommendProviderForTask(taskType, requirements = {}) {
    const recommendations = {
      "business-analysis": ["claude", "gemini", "groq", "openai", "mistral"],
      "creative-writing": ["openai", "claude", "mistral", "gemini", "groq"],
      "code-generation": ["claude", "gemini", "groq", "openai", "mistral"],
      "long-context": ["gemini", "claude", "groq", "openai", "mistral"],
      "cost-effective": ["groq", "mistral", "gemini", "openai", "claude"],
      "fast-decisions": ["groq", "gemini", "claude", "openai", "mistral"],
      "privacy-focused": ["mistral", "gemini", "claude", "openai", "groq"],
      multimodal: ["gemini", "claude", "openai"],
      streaming: ["groq", "claude", "openai", "gemini", "mistral"],
      "function-calling": ["groq", "openai", "claude", "gemini", "mistral"],
    };

    const recommended = recommendations[taskType] || ["claude", "openai", "gemini", "mistral"];

    // Filter based on requirements
    if (requirements.maxCost) {
      // Filter by cost requirements if specified
      return recommended.filter(provider => {
        const features = this.PROVIDER_FEATURES[provider.toUpperCase()];
        return features?.strengths?.includes("cost-effective") || provider === "mistral";
      });
    }

    if (requirements.europeanCompliance) {
      return recommended.filter(provider => provider === "mistral");
    }

    if (requirements.minContextLength > 100000) {
      return recommended.filter(provider => ["gemini", "claude"].includes(provider));
    }

    return recommended;
  }

  /**
   * Create multiple LLM instances for comparison or fallback
   * @param {Array<Object>} configs - Array of {provider, config, credentials} objects
   * @returns {Promise<Array<BaseLLM>>} Array of initialized LLM instances
   */
  static async createMultiple(configs) {
    const promises = configs.map(({ provider, config, credentials }) =>
      this.create(provider, config, credentials)
    );

    return Promise.all(promises);
  }

  /**
   * Create LLM with automatic fallback providers
   * @param {string} primaryProvider - Primary provider to try
   * @param {Array<string>} fallbackProviders - Fallback providers in order
   * @param {Object} config - Configuration object
   * @param {Object} credentials - Credentials object (should contain keys for all providers)
   * @returns {Promise<BaseLLM>} LLM instance with fallback capability
   */
  static async createWithFallback(primaryProvider, fallbackProviders, config, credentials) {
    const providers = [primaryProvider, ...fallbackProviders];

    for (const provider of providers) {
      try {
        const llm = await this.create(provider, config, credentials);
        console.log(`Successfully initialized LLM with provider: ${provider}`);
        return llm;
      } catch (error) {
        console.warn(`Failed to initialize ${provider}: ${error.message}`);
        if (provider === providers[providers.length - 1]) {
          throw new Error(`All providers failed. Last error: ${error.message}`);
        }
      }
    }
  }
}
