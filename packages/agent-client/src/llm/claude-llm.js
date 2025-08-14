import Anthropic from "@anthropic-ai/sdk";
import { AdvancedLLMBase } from "./advanced-llm-base.js";
import { proxyConfig } from "../utils/proxy-config.js";

/**
 * Claude implementation - vendor-specific methods only
 * All sophisticated conversation logic is in AdvancedLLMBase
 */
export class ClaudeLLM extends AdvancedLLMBase {
  constructor(config = {}) {
    super(config);
    this.anthropic = null;
  }

  /**
   * Override tiered model configuration for Claude models
   * @param {Object} tieredConfig - Custom configuration
   * @returns {Object} Claude-specific tiered model configuration
   */
  initializeTieredModels(tieredConfig = {}) {
    // Claude-specific model tiers for optimal performance/cost balance
    const claudeDefaults = {
      planning: "claude-opus-4-1-20250805",      // Highest reasoning for planning
      execution: "claude-sonnet-4-20250514",      // Fast but capable for execution
      analysis: "claude-sonnet-4-20250514",     // High quality for analysis
      simple: "claude-3-5-haiku-20241022",        // Fastest for simple tasks
      fast: "claude-3-5-haiku-20241022",          // Fastest for time-critical tasks
    };

    const merged = { ...claudeDefaults, ...tieredConfig };
    
    console.log(`🎯 Claude tiered models configured:`, merged);
    return merged;
  }

  /**
   * Select model from configuration context
   * @param {Object} config - Configuration object with agent role and task context
   * @returns {string} Selected model name
   */
  selectModelFromConfig(config = {}) {
    if (!this.enableTieredModels) {
      return this.config.model || this.getDefaultModel();
    }

    const { agentRole, message, tools } = config;
    
    // Analyze task complexity if not provided
    let taskContext = config.taskContext || {};
    if (message && !taskContext.complexity) {
      taskContext = this.analyzeTaskComplexity(message, tools || [], config);
    }

    return this.selectModelForTask(agentRole || 'executor', taskContext);
  }

  getProviderName() {
    return "claude";
  }

  getDefaultModel() {
    return "claude-3-5-sonnet-20241022";
  }

  getProviderCapabilities() {
    return {
      streaming: true,
      functionCalling: true,
      vision: true,
      codeExecution: false,
      internetAccess: false,
      maxContextLength: 200000,
      supportedLanguages: ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh"],
      analyticsSubagent: true, // Claude-specific advanced feature
      businessQueryDetection: true,
      schemaAwareQueries: true,
    };
  }

  isValidModel(model) {
    const validModels = [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ];
    return validModels.includes(model);
  }

  getTokenCosts() {
    // Claude costs as of late 2024 (approximate, should be updated regularly)
    const costs = {
      "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
      "claude-3-5-haiku-20241022": { input: 0.25, output: 1.25 },
      "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
      "claude-3-sonnet-20240229": { input: 3.0, output: 15.0 },
      "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    };

    return costs[this.config.model] || { input: 3.0, output: 15.0 };
  }

  async initialize(credentials) {
    if (!credentials.apiKey) {
      throw new Error("Claude API key is required");
    }

    // Use proxy configuration if available
    const anthropicConfig = proxyConfig.getAnthropicConfig(credentials.apiKey);
    
    this.anthropic = new Anthropic(anthropicConfig);

    // Test proxy connection if configured
    if (proxyConfig.hasProxy()) {
      console.log('🔌 Testing Claude API connection through proxy...');
      await proxyConfig.testConnection('https://api.anthropic.com');
    }

    return true;
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Claude API call
  async callProviderAPI(messages, tools, config = {}) {
    // Select appropriate model based on agent role and task complexity
    const selectedModel = this.selectModelFromConfig(config);
    
    if (selectedModel !== this.config.model) {
      console.log(`🎯 Claude model tier selection: ${this.config.model} → ${selectedModel} (role: ${config.agentRole || 'default'}, complexity: ${config.complexity || 'unknown'})`);
    }

    const systemPrompt = this.createSystemPrompt();

    // Start performance tracking for LLM API call
    const llmCallId = this.performanceLogger?.startLLMCall(
      this.getProviderName(),
      selectedModel,
      systemPrompt?.length || 0,
      { streaming: false, tools_count: tools?.length || 0 }
    );

    // Filter out system messages and use the latest system prompt
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    const requestBody = {
      model: selectedModel,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      messages: conversationMessages,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    try {
      // Start operation and get abort controller
      const abortController = this.startOperation();
      
      // Check if already cancelled before making request
      this.checkCancellation();
      
      // Note: Anthropic SDK doesn't currently support AbortSignal directly
      // We'll implement a wrapper for cancellation support
      const response = await this.withCancellationSupport(
        () => this.anthropic.messages.create(requestBody),
        abortController
      );

      // End performance tracking successfully
      if (llmCallId) {
        this.performanceLogger.endLLMCall(llmCallId, {
          total_tokens: response.usage?.input_tokens + response.usage?.output_tokens || 0,
          prompt_tokens: response.usage?.input_tokens || 0,
          completion_tokens: response.usage?.output_tokens || 0,
          tool_calls_generated: response.content?.filter(block => block.type === "tool_use")?.length || 0
        });
      }

      return {
        text: response.content?.find(block => block.type === "text")?.text || "",
        toolCalls: response.content?.filter(block => block.type === "tool_use") || [],
        usage: response.usage,
        rawResponse: response,
      };
    } catch (error) {
      // End performance tracking on error
      if (llmCallId) {
        this.performanceLogger.endLLMCall(llmCallId, { error: error.message });
      }

      // Handle cancellation errors specifically
      if (error.message === 'Operation cancelled by user' || this.isOperationCancelled()) {
        console.log('🛑 Claude operation cancelled by user');
        throw new Error('Operation cancelled by user');
      }

      throw error;
    }
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Create raw prompt data for logging
  async createRawPromptData(messages, tools, response) {
    const systemPrompt = this.createSystemPrompt();
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    return {
      provider: "claude",
      model: this.config.model,
      prompt: {
        system: systemPrompt,
        messages: conversationMessages,
        tools: tools || [],
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
      response: {
        content: response.rawResponse?.content || [],
        usage: response.usage,
        model: response.rawResponse?.model,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Extract text response
  extractTextResponse(response) {
    return response.text || "";
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Extract tool calls
  extractToolCalls(response) {
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return [];
    }

    return response.toolCalls.map(toolCall => {
      // Debug logging to understand the structure
      console.log(`🔧 Extracting tool call:`, JSON.stringify(toolCall, null, 2));
      
      // Claude API returns tool_use blocks directly with id, name, input properties
      return {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
      };
    });
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Add tool use to history
  async addToolUseToHistory(originalToolCalls, autoGeneratedToolCalls, assistantResponse) {
    // For Claude: Add tool_use content blocks first
    let assistantContent = [];

    // Add initial text response if any
    if (assistantResponse && assistantResponse.trim()) {
      assistantContent.push({ type: "text", text: assistantResponse });
    }

    // Add original tool calls (from LLM response)
    originalToolCalls.forEach(toolCall => {
      assistantContent.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
      });
    });

    // Add auto-generated tool calls separately
    autoGeneratedToolCalls.forEach(toolCall => {
      assistantContent.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
      });
    });

    if (assistantContent.length > 0) {
      this.conversationHistory.push({
        role: "assistant",
        content: assistantContent,
      });
    }
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Add tool results to history
  async addToolResultsToHistory(toolResults) {
    // For Claude: Add tool results as user message with tool_result content blocks
    const toolResultContent = toolResults.map(result => ({
      type: "tool_result",
      tool_use_id: result.tool_use_id,
      content: result.content,
      is_error: result.is_error || false,
    }));

    this.conversationHistory.push({
      role: "user",
      content: toolResultContent,
    });
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Generate analytical response
  async generateVendorAnalyticalResponse(analysisPrompt, logger, collectedRawPrompts) {
    const analyticalMessages = [
      {
        role: "system",
        content:
          "You are a senior business analyst. Provide comprehensive, insightful analysis based on the provided data.",
      },
      { role: "user", content: analysisPrompt },
    ];

    const analyticalResponse = await this.callProviderAPI(analyticalMessages, [], {
      timeout: 60000, // 60 second timeout for analytical response
      temperature: 0.7,
    });

    // Log the analytical query if logger is available
    if (logger) {
      const rawPromptData = await this.createRawPromptData(
        analyticalMessages,
        [],
        analyticalResponse
      );
      await logger.logRawPrompt(rawPromptData);
      if (collectedRawPrompts) {
        collectedRawPrompts.push(rawPromptData);
      }
    }

    return analyticalResponse.text || "Analysis could not be completed.";
  }

  // STREAMING SUPPORT (Claude-specific)
  async callProviderAPIStreaming(messages, tools, config = {}, callbacks = {}) {
    // Select appropriate model based on agent role and task complexity
    const selectedModel = this.selectModelFromConfig(config);
    
    if (selectedModel !== this.config.model) {
      console.log(`🎯 Claude streaming model tier selection: ${this.config.model} → ${selectedModel} (role: ${config.agentRole || 'default'})`);
    }

    const systemPrompt = this.createSystemPrompt();
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    const requestBody = {
      model: selectedModel,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      messages: conversationMessages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(tool => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema || {
            type: "object",
            properties: {},
            required: [],
          },
        };
      });
    }

    // Start operation and get abort controller
    const abortController = this.startOperation();
    
    // Check if already cancelled before making request
    this.checkCancellation();
    
    const stream = this.anthropic.messages.stream(requestBody);

    let fullText = "";
    let toolCalls = [];
    let usage = null;

    stream.on("text", text => {
      // Check for cancellation before processing chunk
      if (this.isOperationCancelled()) {
        stream.controller?.abort();
        return;
      }
      fullText += text;
      if (callbacks.onText) {
        callbacks.onText(text);
      }
    });

    stream.on("contentBlock", block => {
      // Check for cancellation before processing content block
      if (this.isOperationCancelled()) {
        stream.controller?.abort();
        return;
      }
      if (block.type === "tool_use") {
        toolCalls.push(block);
      }
    });

    const response = await stream.finalMessage();
    
    // Final cancellation check
    this.checkCancellation();
    
    usage = response.usage;

    return {
      text: fullText,
      toolCalls: toolCalls,
      usage: usage,
      rawResponse: response,
    };
  }

  /**
   * Wrapper to add cancellation support to Anthropic SDK calls
   * Since the SDK doesn't support AbortSignal natively, we implement polling
   */
  async withCancellationSupport(apiCall, abortController) {
    return new Promise(async (resolve, reject) => {
      // Set up abort handler
      const abortHandler = () => {
        console.log('🛑 Claude API call aborted');
        reject(new Error('Operation cancelled by user'));
      };

      if (abortController.signal.aborted) {
        return reject(new Error('Operation cancelled by user'));
      }

      abortController.signal.addEventListener('abort', abortHandler);

      try {
        // Execute the API call
        const result = await apiCall();
        
        // Clean up
        abortController.signal.removeEventListener('abort', abortHandler);
        
        // Check one final time if cancelled during execution
        if (this.isOperationCancelled()) {
          reject(new Error('Operation cancelled by user'));
        } else {
          resolve(result);
        }
      } catch (error) {
        // Clean up
        abortController.signal.removeEventListener('abort', abortHandler);
        
        // Check if this is a cancellation
        if (this.isOperationCancelled()) {
          reject(new Error('Operation cancelled by user'));
        } else {
          reject(error);
        }
      }
    });
  }
}
