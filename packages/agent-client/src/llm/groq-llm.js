import { AdvancedLLMBase } from "./advanced-llm-base.js";

/**
 * Groq LLM Client - Full-featured LLM with advanced capabilities
 * Supports conversation, tool calling, and all advanced features like Gemini
 * Also optimized for fast decision-making tasks
 */
export class GroqLLM extends AdvancedLLMBase {
  constructor(apiKey, options = {}) {
    // Initialize models first, before calling super() which needs getDefaultModel()
    const models = {
      // Main conversation model - high performance for general tasks
      conversation: options.conversationModel || "llama-3.3-70b-versatile",

      // Super fast for binary decisions (yes/no, true/false)
      binary: options.binaryModel || "llama-3.3-70b-versatile",

      // Fast for simple classifications (3-5 categories)
      classification: options.classificationModel || "llama-3.3-70b-versatile",

      // Fast for simple JSON extraction
      extraction: options.extractionModel || "llama-3.3-70b-versatile",
    };

    super({
      model: models.conversation,
      maxTokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      ...options,
    });

    // Validate API key
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      console.warn(`⚠️ Groq API key is missing or invalid - fast optimization will be disabled`);
      this.apiKey = null;
      this.enabled = false;
    } else {
      this.apiKey = apiKey;
      this.enabled = true;
    }

    this.baseUrl = options.baseUrl || "https://api.groq.com/openai/v1";
    this.models = models;
    this.defaultTimeout = options.timeout || 10000; // 10s timeout for fast models
    
    // Retry configuration with exponential backoff
    this.retryConfig = {
      maxRetries: options.maxRetries || 3,           // Max number of retry attempts
      baseDelay: options.baseDelay || 1000,          // Initial delay in ms (1 second)
      maxDelay: options.maxDelay || 60000,           // Maximum delay in ms (60 seconds)
      backoffMultiplier: options.backoffMultiplier || 2, // Exponential multiplier
    };
  }

  // ==================== RETRY LOGIC METHODS ====================

  /**
   * Sleep for a specified number of milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse rate limit information from Groq error response
   */
  parseRateLimitInfo(error) {
    if (error.message && error.message.includes('Please try again in')) {
      const match = error.message.match(/Please try again in ([\d.]+)s/);
      if (match) {
        const seconds = parseFloat(match[1]);
        return Math.ceil(seconds * 1000); // Convert to milliseconds
      }
    }
    return null;
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  calculateDelay(attempt, suggestedDelay = null) {
    if (suggestedDelay) {
      // Use API suggested delay with some jitter
      return Math.min(suggestedDelay + Math.random() * 1000, this.retryConfig.maxDelay);
    }

    // Standard exponential backoff
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error) {
    if (error.message) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('500') ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('enotfound')
      );
    }
    return false;
  }

  /**
   * Execute API call with exponential backoff retry
   */
  async executeWithRetry(apiCall, context = "API call") {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await apiCall();
        if (attempt > 0) {
          console.log(`✅ ${context} succeeded after ${attempt} retries`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on the last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          console.warn(`❌ ${context} failed with non-retryable error: ${error.message}`);
          throw error;
        }
        
        // Calculate delay
        const suggestedDelay = this.parseRateLimitInfo(error);
        const delay = this.calculateDelay(attempt, suggestedDelay);
        
        console.warn(
          `⏱️  ${context} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}): ${error.message}`
        );
        console.warn(`🔄 Retrying in ${Math.ceil(delay / 1000)}s...`);
        
        await this.sleep(delay);
      }
    }
    
    console.error(`❌ ${context} failed after ${this.retryConfig.maxRetries + 1} attempts`);
    throw lastError;
  }

  /**
   * Binary decision: returns true/false for yes/no questions
   * Optimized for shouldReplan, needsClarification, etc.
   */
  async binaryDecision(prompt, context = "", options = {}) {
    if (!this.enabled) {
      console.warn(`⚠️ Groq binary decision skipped - API key not configured`);
      return false; // Conservative default
    }

    const model = options.model || this.models.binary;

    const systemPrompt = `You are a precise decision maker. Answer ONLY with "true" or "false" based on the prompt.
${context ? `\nContext: ${context}` : ""}

CRITICAL: Your response must be exactly "true" or "false" with no other text.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    try {
      const response = await this.callGroqAPI(messages, model, {
        temperature: 0.1,
        max_tokens: 10,
        ...options,
      });

      const result = response.choices[0]?.message?.content?.trim().toLowerCase();
      return result === "true";
    } catch (error) {
      console.warn(`⚠️ Groq binary decision failed: ${error.message}`);
      return false; // Conservative default
    }
  }

  /**
   * Classification: returns one of the provided categories
   * Optimized for gap analysis, task prioritization, etc.
   */
  async classify(prompt, categories, context = "", options = {}) {
    if (!this.enabled) {
      console.warn(`⚠️ Groq classification skipped - API key not configured`);
      return categories[0]; // Conservative default to first category
    }

    const model = options.model || this.models.classification;

    const categoryList = categories.join("|");
    const systemPrompt = `You are a precise classifier. Choose EXACTLY ONE category from: ${categoryList}

${context ? `Context: ${context}` : ""}

CRITICAL: Your response must be exactly one of these categories: ${categories.join(", ")}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    try {
      const response = await this.callGroqAPI(messages, model, {
        temperature: 0.1,
        max_tokens: 50,
        ...options,
      });

      const result = response.choices[0]?.message?.content?.trim();

      // Validate result is in categories
      if (categories.includes(result)) {
        return result;
      }

      // Fallback: try to find partial match
      const match = categories.find(
        cat =>
          result.toLowerCase().includes(cat.toLowerCase()) ||
          cat.toLowerCase().includes(result.toLowerCase())
      );

      return match || categories[0]; // Default to first category
    } catch (error) {
      console.warn(`⚠️ Groq classification failed: ${error.message}`);
      return categories[0]; // Conservative default to first category
    }
  }

  /**
   * JSON extraction: extracts structured data from text
   * Returns parsed JSON object
   */
  async extractJSON(prompt, schema, context = "", options = {}) {
    if (!this.enabled) {
      console.warn(`⚠️ Groq JSON extraction skipped - API key not configured`);
      return schema; // Return schema as fallback
    }

    const model = options.model || this.models.extraction;

    const systemPrompt = `You are a precise JSON extractor. Extract information according to the schema and return ONLY valid JSON.

Schema format: ${JSON.stringify(schema, null, 2)}

${context ? `Context: ${context}` : ""}

CRITICAL: 
- Return ONLY valid JSON that matches the schema
- No explanations or additional text
- Use null for missing values`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    try {
      const response = await this.callGroqAPI(messages, model, {
        temperature: 0.1,
        max_tokens: 500,
        ...options,
      });

      const result = response.choices[0]?.message?.content?.trim();

      // Validate response is not HTML or error content
      if (!result) {
        console.warn(`⚠️ Groq JSON extraction: Empty response received`);
        return schema;
      }

      if (result.startsWith("<") || result.includes("<!DOCTYPE") || result.includes("<html>")) {
        console.warn(`⚠️ Groq JSON extraction: Received HTML response instead of JSON`);
        console.warn(`Response preview: ${result.substring(0, 200)}...`);
        return schema;
      }

      try {
        return JSON.parse(result);
      } catch (parseError) {
        console.warn(`⚠️ Groq JSON extraction: Initial parse failed - ${parseError.message}`);
        console.warn(`Response content: ${result.substring(0, 500)}...`);

        // Try to extract JSON from response if it has extra text
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (extractError) {
            console.warn(
              `⚠️ Groq JSON extraction: JSON extraction from match failed - ${extractError.message}`
            );
            console.warn(`Matched content: ${jsonMatch[0].substring(0, 200)}...`);
          }
        }

        // Final fallback
        throw parseError;
      }
    } catch (error) {
      console.warn(`⚠️ Groq JSON extraction failed: ${error.message}`);
      if (error.message.includes("fetch")) {
        console.warn(`⚠️ Network error - check Groq API connectivity and credentials`);
      }
      return schema; // Return schema as fallback
    }
  }

  /**
   * Required by BaseLLM - return default model for binary decisions
   */
  getDefaultModel() {
    return this.models.conversation;
  }

  /**
   * Provider name for logging and identification
   */
  getProviderName() {
    return "groq";
  }

  /**
   * Validate if a model name is supported by Groq
   */
  isValidModel(model) {
    const validModels = [
      "llama-3.3-70b-versatile",
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
      "moonshotai/kimi-k2-instruct",
      "qwen/qwen3-32b",
      "openai/gpt-oss-120b",
    ];
    return validModels.includes(model);
  }

  /**
   * Check if the current model supports tool calling (function calling)
   */
  supportsToolCalling() {
    // Some Groq models may not support function calling yet
    const toolCallingSupportedModels = [
      "moonshotai/kimi-k2-instruct",
      "llama-3.3-70b-versatile",
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "openai/gpt-oss-120b",
    ];
    return toolCallingSupportedModels.includes(this.config.model);
  }

  /**
   * Get provider capabilities - Full advanced features like Gemini
   */
  getProviderCapabilities() {
    return {
      streaming: true,
      functionCalling: true,
      vision: false, // Groq doesn't support vision yet
      codeExecution: false,
      internetAccess: false,
      maxContextLength: 131072, // 128k context for llama-3.3-70b-versatile
      supportedLanguages: ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi"],
      multiModal: false,
      longContext: true,
      analyticsSubagent: true, // Same as Claude/Gemini
      businessQueryDetection: true,
      schemaAwareQueries: true,
    };
  }

  // ==================== ADVANCED LLM BASE IMPLEMENTATIONS ====================

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Groq API call
   */
  async callProviderAPI(messages, tools, config = {}) {
    const systemPrompt = this.createSystemPrompt();

    // Start performance tracking for LLM API call
    const llmCallId = this.performanceLogger?.startLLMCall(
      this.getProviderName(),
      this.config.model,
      systemPrompt?.length || 0,
      { streaming: false, tools_count: tools?.length || 0 }
    );

    // Filter out system messages and use the latest system prompt
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    // Add system message to the beginning
    const allMessages = [{ role: "system", content: systemPrompt }, ...conversationMessages];

    const requestBody = {
      model: this.config.model,
      messages: allMessages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: false,
    };

    // Add function calling if tools provided (check model compatibility)
    if (tools && tools.length > 0 && this.supportsToolCalling()) {
      requestBody.tools = tools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));
      requestBody.tool_choice = "auto";
    } else if (tools && tools.length > 0) {
      console.warn(
        `⚠️ Model ${this.config.model} does not support function calling - tools will be ignored`
      );
    }

    try {
      const response = await this.callGroqAPI(allMessages, this.config.model, {
        ...requestBody,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        tools: requestBody.tools,
        tool_choice: requestBody.tool_choice,
      });

      // End performance tracking successfully
      if (llmCallId) {
        this.performanceLogger.endLLMCall(llmCallId, {
          total_tokens: response.usage?.total_tokens || 0,
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
          tool_calls_generated: response.choices[0]?.message?.tool_calls?.length || 0,
        });
      }

      return {
        text: response.choices[0]?.message?.content || "",
        toolCalls: this.extractGroqToolCalls(response),
        usage: response.usage,
        rawResponse: response,
      };
    } catch (error) {
      // End performance tracking on error
      if (llmCallId) {
        this.performanceLogger.endLLMCall(llmCallId, { error: error.message });
      }
      throw error;
    }
  }

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Create raw prompt data for logging
   */
  async createRawPromptData(messages, tools, response) {
    const systemPrompt = this.createSystemPrompt();
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    return {
      provider: "groq",
      model: this.config.model,
      prompt: {
        system: systemPrompt,
        messages: conversationMessages,
        tools: tools || [],
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
      response: {
        content: response.rawResponse?.choices?.[0]?.message || {},
        usage: response.usage,
        model: this.config.model,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Extract text response
   */
  extractTextResponse(response) {
    return response.text || "";
  }

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Extract tool calls
   */
  extractToolCalls(response) {
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return [];
    }

    return response.toolCalls.map(toolCall => ({
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
    }));
  }

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Add tool use to history
   */
  async addToolUseToHistory(originalToolCalls, autoGeneratedToolCalls, assistantResponse) {
    // For Groq: Add tool_use content blocks (same format as Claude)
    let assistantContent = [];

    // Add initial text response if any
    if (assistantResponse && assistantResponse.trim()) {
      assistantContent.push({ type: "text", text: assistantResponse });
    }

    // Add all tool calls as proper tool_use objects
    const allToolCalls = [...originalToolCalls, ...autoGeneratedToolCalls];
    allToolCalls.forEach(toolCall => {
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

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Add tool results to history
   */
  async addToolResultsToHistory(toolResults) {
    // For Groq: Add tool results as user message with tool_result content blocks
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

  /**
   * VENDOR-SPECIFIC IMPLEMENTATION: Generate analytical response
   */
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

  /**
   * STREAMING SUPPORT (Groq-specific)
   */
  async callProviderAPIStreaming(messages, tools, config = {}, callbacks = {}) {
    return this.executeWithRetry(async () => {
      const systemPrompt = this.createSystemPrompt();

      // Start performance tracking for streaming LLM API call
      const llmCallId = this.performanceLogger?.startLLMCall(
        this.getProviderName(),
        this.config.model,
        systemPrompt?.length || 0,
        { streaming: true, tools_count: tools?.length || 0 }
      );

      try {
        // Filter out system messages and use the latest system prompt
        const conversationMessages = messages.filter(msg => msg.role !== "system");

        // Add system message to the beginning
        const allMessages = [{ role: "system", content: systemPrompt }, ...conversationMessages];

        const requestBody = {
          model: this.config.model,
          messages: allMessages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: true,
        };

        // Add function calling if tools provided (check model compatibility)
        if (tools && tools.length > 0 && this.supportsToolCalling()) {
          requestBody.tools = tools.map(tool => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          }));
          requestBody.tool_choice = "auto";
        } else if (tools && tools.length > 0) {
          console.warn(
            `⚠️ Model ${this.config.model} does not support function calling - tools will be ignored`
          );
        }

        console.log(
          `🔧 Groq Streaming API call - Model: ${this.config.model}, Messages: ${
            allMessages.length
          }, Temperature: ${requestBody.temperature}, Tools: ${tools?.length || 0}`
        );

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(config.timeout || 60000), // 60s timeout for streaming
        });

        if (!response.ok) {
          let errorMessage = response.statusText;
          try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = await response.json();
              errorMessage = errorData.error?.message || errorMessage;
              console.error(`❌ Groq Streaming API detailed error:`, errorData);
            } else {
              const textContent = await response.text();
              errorMessage = textContent.substring(0, 500) || errorMessage;
              console.error(`❌ Groq Streaming API text error:`, textContent.substring(0, 500));
            }
          } catch (parseError) {
            console.error(
              `❌ Failed to parse Groq Streaming API error response: ${parseError.message}`
            );
          }

          console.error(`❌ Groq Streaming API error: ${response.status} - ${errorMessage}`);
          throw new Error(`Groq API error: ${response.status} - ${errorMessage}`);
        }

        let fullText = "";
        let toolCalls = [];
        let usage = null;

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.content) {
                  fullText += delta.content;
                  if (callbacks.onText) {
                    callbacks.onText(delta.content);
                  }
                }

                if (delta?.tool_calls) {
                  // Handle streaming tool calls
                  toolCalls.push(...this.extractGroqToolCalls({ choices: [{ message: delta }] }));
                }

                if (parsed.usage) {
                  usage = parsed.usage;
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }

        // End performance tracking successfully
        if (llmCallId) {
          this.performanceLogger.endLLMCall(llmCallId, {
            total_tokens: usage?.total_tokens || 0,
            prompt_tokens: usage?.prompt_tokens || 0,
            completion_tokens: usage?.completion_tokens || 0,
            tool_calls_generated: toolCalls.length,
            streaming: true,
          });
        }

        return {
          text: fullText,
          toolCalls: toolCalls,
          usage: usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
          rawResponse: {
            choices: [{ message: { content: fullText, tool_calls: toolCalls } }],
            usage,
          },
        };
      } catch (error) {
        // End performance tracking on error
        if (llmCallId) {
          this.performanceLogger.endLLMCall(llmCallId, {
            error: error.message,
            streaming: true,
          });
        }
        throw error;
      }
    }, `Groq Streaming API call (${this.config.model})`);
  }

  // ==================== GROQ-SPECIFIC HELPER METHODS ====================

  /**
   * Extract tool calls from Groq response format
   */
  extractGroqToolCalls(response) {
    const toolCalls = [];
    const message = response.choices?.[0]?.message;

    if (message?.tool_calls) {
      message.tool_calls.forEach(toolCall => {
        if (toolCall.type === "function") {
          toolCalls.push({
            id: toolCall.id || this.generateToolCallId(toolCall.function.name),
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments || "{}"),
          });
        }
      });
    }

    return toolCalls;
  }

  /**
   * Generate unique tool call ID for Groq
   */
  generateToolCallId(toolName) {
    return `groq_${toolName}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Core Groq API call (enhanced for full LLM capabilities)
   */
  async callGroqAPI(messages, model, options = {}) {
    return this.executeWithRetry(async () => {
      const requestBody = {
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 4000,
        stream: false,
      };

      // Add function calling support if tools are provided
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
        requestBody.tool_choice = options.tool_choice || "auto";
      }

      console.log(
        `🔧 Groq API call - Model: ${model}, Messages: ${messages.length}, Temperature: ${requestBody.temperature}`
      );

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(options.timeout || this.defaultTimeout),
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
          } else {
            // Handle HTML error pages
            const textContent = await response.text();
            if (textContent.includes("<title>") || textContent.includes("<!DOCTYPE")) {
              console.error(`❌ Groq API returned HTML error page (${response.status})`);
              errorMessage = `HTML error page returned (status: ${response.status})`;
            } else {
              errorMessage = textContent.substring(0, 200) || errorMessage;
            }
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse Groq API error response: ${parseError.message}`);
        }

        console.error(`❌ Groq API error: ${response.status} - ${errorMessage}`);
        console.error(`❌ Request body:`, JSON.stringify(requestBody, null, 2));
        throw new Error(`Groq API error: ${response.status} - ${errorMessage}`);
      }

      const result = await response.json();
      console.log(
        `✅ Groq API success - Model: ${model}, Usage: ${
          result.usage?.total_tokens || "unknown"
        } tokens`
      );
      return result;
    }, `Groq API call (${model})`);
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      provider: "groq",
      models: this.models,
      timeout: this.defaultTimeout,
    };
  }

  /**
   * Get token costs for different Groq models
   */
  getTokenCosts() {
    // Groq pricing as of late 2024 (very competitive rates)
    const costs = {
      "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
      "llama-3.1-70b-versatile": { input: 0.59, output: 0.79 },
      "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
      "mixtral-8x7b-32768": { input: 0.24, output: 0.24 },
      "gemma2-9b-it": { input: 0.2, output: 0.2 },
      "moonshotai/kimi-k2-instruct": { input: 0.15, output: 0.15 },
      "qwen/qwen3-32b": { input: 0.18, output: 0.18 },
      "openai/gpt-oss-120b": { input: 0.18, output: 0.18 },
    };

    return costs[this.config.model] || { input: 0.59, output: 0.79 };
  }

  extractJSONFromResponse(text, fallback = {}) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : fallback;
    } catch {
      return fallback;
    }
  }
}
