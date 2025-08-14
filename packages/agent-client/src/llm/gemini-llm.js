import { GoogleGenerativeAI } from "@google/generative-ai";
import { AdvancedLLMBase } from "./advanced-llm-base.js";
import { proxyConfig } from "../utils/proxy-config.js";

/**
 * Gemini implementation - vendor-specific methods only
 * All sophisticated conversation logic is in AdvancedLLMBase
 */
export class GeminiLLM extends AdvancedLLMBase {
  constructor(config = {}) {
    super(config);
    this.genAI = null;
  }

  /**
   * Override tiered model configuration for Gemini models
   * @param {Object} tieredConfig - Custom configuration
   * @returns {Object} Gemini-specific tiered model configuration
   */
  initializeTieredModels(tieredConfig = {}) {
    // Gemini-specific model tiers for optimal performance/cost balance
    const geminiDefaults = {
      planning: "gemini-2.5-pro",      // Highest reasoning for planning
      execution: "gemini-2.5-flash",   // Fast but capable for execution  
      analysis: "gemini-2.5-pro",     // High quality for analysis
      simple: "gemini-2.5-flash",     // Fastest for simple tasks
      fast: "gemini-2.5-flash",       // Fastest for time-critical tasks
    };

    const merged = { ...geminiDefaults, ...tieredConfig };
    
    console.log(`🎯 Gemini tiered models configured:`, merged);
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
    return "gemini";
  }

  getDefaultModel() {
    return "gemini-2.5-pro";
  }

  getProviderCapabilities() {
    return {
      streaming: true,
      functionCalling: true,
      vision: true,
      codeExecution: true,
      internetAccess: false,
      maxContextLength: 2097152,
      supportedLanguages: [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ru",
        "ja",
        "ko",
        "zh",
        "ar",
        "hi",
        "bn",
        "te",
        "mr",
      ],
      multiModal: true,
      longContext: true,
      analyticsSubagent: true, // Same as Claude
      businessQueryDetection: true,
      schemaAwareQueries: true,
    };
  }

  isValidModel(model) {
    const validModels = [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.0-pro",
    ];
    return validModels.includes(model);
  }

  getTokenCosts() {
    const costs = {
      "gemini-2.5-pro": { input: 2.5, output: 10.0 }, // Latest model
      "gemini-2.5-flash": { input: 0.075, output: 0.3 }, // Latest flash model
      "gemini-1.5-pro": { input: 3.5, output: 10.5 },
      "gemini-1.5-flash": { input: 0.075, output: 0.3 },
      "gemini-1.0-pro": { input: 0.5, output: 1.5 },
    };

    return costs[this.config.model] || { input: 2.5, output: 10.0 };
  }

  async initialize(credentials) {
    if (!credentials.apiKey) {
      throw new Error("Google AI API key is required");
    }

    // Note: Google's Gemini SDK doesn't have built-in proxy support
    // We'll need to use a custom fetch if proxy is configured
    const geminiConfig = proxyConfig.getGeminiConfig(credentials.apiKey);
    
    // GoogleGenerativeAI constructor only accepts API key directly
    // Proxy support would need to be added via custom HTTP layer
    this.genAI = new GoogleGenerativeAI(credentials.apiKey);
    
    // Store proxy config for later use if needed
    if (proxyConfig.hasProxy()) {
      console.log('⚠️ Note: Gemini SDK has limited proxy support. Proxy may not work for all operations.');
      console.log('🔌 Testing Gemini API connection through proxy...');
      await proxyConfig.testConnection('https://generativelanguage.googleapis.com');
    }

    return true;
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Gemini API call
  async callProviderAPI(messages, tools, config = {}) {
    // Select appropriate model based on agent role and task complexity
    const selectedModel = this.selectModelFromConfig(config);
    
    if (selectedModel !== this.config.model) {
      console.log(`🎯 Model tier selection: ${this.config.model} → ${selectedModel} (role: ${config.agentRole || 'default'}, complexity: ${config.complexity || 'unknown'})`);
    }
    // Get system prompt with schema context
    const systemPrompt = this.createSystemPrompt();

    // Start performance tracking for LLM API call
    const llmCallId = this.performanceLogger?.startLLMCall(
      this.getProviderName(),
      selectedModel,
      systemPrompt?.length || 0,
      { streaming: false, tools_count: tools?.length || 0 }
    );

    const model = this.genAI.getGenerativeModel({
      model: selectedModel,
      systemInstruction: systemPrompt, // Add system prompt to model configuration
    });

    // Build Gemini messages format with error handling
    let geminiHistory;
    try {
      geminiHistory = this.buildGeminiHistory(messages);
      if (!geminiHistory || !Array.isArray(geminiHistory)) {
        console.log(`   ❌ buildGeminiHistory returned invalid result: ${typeof geminiHistory}`);
        throw new Error("Invalid Gemini history format");
      }
    } catch (error) {
      console.log(`   ❌ buildGeminiHistory failed: ${error.message}`);
      console.log(`   Input messages type: ${typeof messages}, length: ${messages?.length}`);
      throw new Error(`Failed to build Gemini history: ${error.message}`);
    }

    console.log(
      `🔍 GEMINI DEBUG - System prompt length: ${systemPrompt ? systemPrompt.length : 0} chars`
    );
    if (systemPrompt && systemPrompt.includes("DATA SCHEMA CONTEXT")) {
      console.log(`✅ GEMINI: System prompt includes schema context`);
    } else {
      console.log(`❌ GEMINI: No schema context in system prompt`);
    }

    const requestConfig = {
      history: geminiHistory,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    };

    console.log(`   Request config keys: ${Object.keys(requestConfig).join(", ")}`);

    // Add function calling if tools provided
    if (tools && tools.length > 0) {
      const geminiTools = tools.map(tool => {
        // Enhanced description for tools with required parameters
        let enhancedDescription = tool.description;

        if (tool.name === "db_query") {
          enhancedDescription +=
            ' CRITICAL: You MUST provide the "query" parameter with a valid SQL query string. Never call this tool without a query parameter.';
        } else if (tool.name === "plan_tasks") {
          enhancedDescription +=
            ' CRITICAL: You MUST provide the "objective" parameter with a clear task objective. Never call this tool without an objective parameter.';
        } else if (tool.name === "execute_task") {
          enhancedDescription +=
            ' CRITICAL: You MUST provide the "taskId" parameter with a valid task ID. Never call this tool without a taskId parameter.';
        } else if (tool.name === "think_sequentially") {
          enhancedDescription +=
            ' CRITICAL: You MUST provide the "problem" parameter with a clear problem statement. Never call this tool without a problem parameter.';
        }

        // Get the correct schema - handle both MCP format and simplified format
        const inputSchema = tool.input_schema || tool.inputSchema || {};
        
        // Add required parameter info to all tool descriptions
        if (inputSchema.required && inputSchema.required.length > 0) {
          const requiredParams = inputSchema.required.join(", ");
          enhancedDescription += ` REQUIRED PARAMETERS: ${requiredParams}. These parameters are mandatory and must be provided.`;
        }

        // Convert MCP schema format to Gemini format
        const geminiParameters = {
          type: inputSchema.type || "object",
          properties: inputSchema.properties || {},
          required: inputSchema.required || []
        };

        return {
          name: tool.name,
          description: enhancedDescription,
          parameters: geminiParameters,
        };
      });

      // Debug logging for db_query tool specifically
      const dbQueryTool = geminiTools.find(t => t.name === "db_query");
      if (dbQueryTool) {
        console.log(
          `🐛 DEBUG db_query tool schema sent to Gemini:`,
          JSON.stringify(dbQueryTool, null, 2)
        );
        console.log(`🐛 DEBUG db_query parameters.required:`, dbQueryTool.parameters?.required);
        console.log(
          `🐛 DEBUG db_query parameters.properties.query:`,
          dbQueryTool.parameters?.properties?.query
        );
      }

      requestConfig.tools = {
        functionDeclarations: geminiTools,
      };

      requestConfig.toolConfig = {
        functionCallingConfig: {
          mode: "ANY", // Changed back to ANY to ensure tool calls are generated more reliably
          allowedFunctionNames: geminiTools.map(t => t.name), // Explicitly specify allowed functions
        },
      };
    }

    let chat;
    let result;

    try {
      // Start operation and get abort controller
      const abortController = this.startOperation();

      // Check if already cancelled before making request
      this.checkCancellation();

      console.log(`   Starting Gemini chat...`);
      chat = model.startChat(requestConfig);

      const lastMessage = messages[messages.length - 1];
      const userMessage =
        typeof lastMessage.content === "string"
          ? lastMessage.content
          : this.extractTextFromContent(lastMessage.content);

      console.log(`   Sending message: "${userMessage.substring(0, 100)}..."`);

      // Use cancellation wrapper for Gemini API call
      result = await this.withCancellationSupport(
        () => chat.sendMessage(userMessage),
        abortController
      );

      console.log(`   ✅ Gemini API call successful`);
    } catch (error) {
      console.log(`   ❌ Gemini API call failed: ${error.message}`);

      // End performance tracking on error
      if (llmCallId) {
        this.performanceLogger.endLLMCall(llmCallId, { error: error.message });
      }

      // Handle cancellation errors specifically
      if (error.message === "Operation cancelled by user" || this.isOperationCancelled()) {
        console.log("🛑 Gemini operation cancelled by user");
        throw new Error("Operation cancelled by user");
      }

      throw error;
    }
    const response = result.response;

    // End performance tracking successfully
    if (llmCallId) {
      this.performanceLogger.endLLMCall(llmCallId, {
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        tool_calls_generated: this.extractGeminiToolCalls(response)?.length || 0,
      });
    }

    return {
      text: response.text() || "",
      toolCalls: this.extractGeminiToolCalls(response),
      usage: {
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
      rawResponse: response,
    };
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Create raw prompt data for logging
  async createRawPromptData(messages, tools, response) {
    const systemPrompt = this.createSystemPrompt();
    const geminiHistory = this.buildGeminiHistory(messages);

    return {
      provider: "gemini",
      model: this.config.model,
      prompt: {
        systemInstruction: systemPrompt,
        history: geminiHistory,
        tools: tools || [],
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
      response: {
        content: response.rawResponse?.candidates?.[0]?.content || {},
        usage: response.usage,
        model: this.config.model,
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

    const extracted = response.toolCalls.map(toolCall => {
      console.log(
        `🐛 DEBUG Gemini extractToolCalls - raw toolCall:`,
        JSON.stringify(toolCall, null, 2)
      );
      const extracted = {
        id: this.generateToolCallId(toolCall.name),
        name: toolCall.name,
        input: toolCall.args || {},
      };
      console.log(
        `🐛 DEBUG Gemini extractToolCalls - extracted:`,
        JSON.stringify(extracted, null, 2)
      );
      return extracted;
    });

    return extracted;
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Add tool use to history
  async addToolUseToHistory(originalToolCalls, autoGeneratedToolCalls, assistantResponse) {
    // For Gemini: Create assistant message with function calls
    const allToolCalls = [...originalToolCalls, ...autoGeneratedToolCalls];

    let assistantContent = [];

    // Add initial text response if any
    if (assistantResponse && assistantResponse.trim()) {
      assistantContent.push({ type: "text", text: assistantResponse });
    }

    // Add tool calls as proper tool_use objects (same format as Claude)
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

  // VENDOR-SPECIFIC IMPLEMENTATION: Add tool results to history
  async addToolResultsToHistory(toolResults) {
    console.log(`\n🔍 GEMINI addToolResultsToHistory:`);
    console.log(`   Tool results to add: ${toolResults ? toolResults.length : "undefined"}`);

    if (!toolResults || !Array.isArray(toolResults) || toolResults.length === 0) {
      console.log(`   No tool results to add`);
      return;
    }

    try {
      // For Gemini: Add tool results as proper tool_result objects (same format as Claude)
      const toolResultContent = toolResults.map((result, index) => {
        console.log(`   Processing result ${index}: ${result.tool_use_id}`);
        return {
          type: "tool_result",
          tool_use_id: result.tool_use_id,
          content: result.content,
          is_error: result.is_error || false,
        };
      });

      const toolResultMessage = {
        role: "user",
        content: toolResultContent,
      };

      console.log(`   Adding tool result message with ${toolResultContent.length} results`);
      this.conversationHistory.push(toolResultMessage);

      console.log(`   Conversation history now has ${this.conversationHistory.length} messages`);
    } catch (error) {
      console.log(`   ❌ Error in addToolResultsToHistory: ${error.message}`);
      throw error;
    }
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

  // Gemini-specific helper methods
  buildGeminiHistory(messages) {
    console.log(`\n🔍 GEMINI buildGeminiHistory DEBUG:`);
    console.log(`   Input messages: ${messages ? messages.length : "undefined/null"}`);

    if (!messages || !Array.isArray(messages)) {
      console.log(`   ❌ Invalid messages input: ${typeof messages}`);
      return [];
    }

    const result = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // console.log(
      //   `   Processing message ${i}: role=${msg?.role}, content type=${typeof msg?.content}`
      // );

      if (!msg || !msg.role) {
        console.log(`     Skipping invalid message at index ${i}`);
        continue;
      }

      if (msg.role === "system") {
        console.log(`     Skipping system message`);
        continue;
      }

      try {
        if (typeof msg.content === "string") {
          const geminiMsg = {
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          };
          result.push(geminiMsg);
          console.log(`     Added string message: ${msg.content.substring(0, 50)}...`);
        } else if (Array.isArray(msg.content)) {
          console.log(`     Processing array content with ${msg.content.length} items`);

          const parts = [];
          for (const item of msg.content) {
            if (!item || !item.type) {
              console.log(`       Skipping invalid content item`);
              continue;
            }

            if (item.type === "text") {
              if (item.text && item.text.trim()) {
                parts.push({ text: item.text });
                console.log(`       Added text part: ${item.text.substring(0, 30)}...`);
              }
            } else if (item.type === "tool_use") {
              const toolText = `[Tool Call: ${item.name}(${JSON.stringify(item.input)})]`;
              parts.push({ text: toolText });
              console.log(`       Added tool_use part: ${item.name}`);
            } else if (item.type === "tool_result") {
              const resultText = item.is_error
                ? `[Tool Error: ${item.content}]`
                : `[Tool Result: ${item.content}]`;
              parts.push({ text: resultText });
              console.log(`       Added tool_result part: ${item.is_error ? "ERROR" : "SUCCESS"}`);
            } else {
              console.log(`       Unknown content type: ${item.type}`);
            }
          }

          if (parts.length > 0) {
            const geminiMsg = {
              role: msg.role === "assistant" ? "model" : "user",
              parts: parts,
            };
            result.push(geminiMsg);
            console.log(`     Added array message with ${parts.length} parts`);
          } else {
            console.log(`     Skipped empty array message`);
          }
        } else {
          console.log(`     Unknown content type: ${typeof msg.content}`);
        }
      } catch (error) {
        console.log(`     ❌ Error processing message ${i}: ${error.message}`);
      }
    }

    console.log(`   Built ${result.length} Gemini messages`);
    return result;
  }

  extractGeminiToolCalls(response) {
    const toolCalls = [];

    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const content = response.candidates[0].content;
      if (content.parts) {
        for (const part of content.parts) {
          if (part.functionCall) {
            // console.log(`🐛 DEBUG Gemini functionCall raw:`, JSON.stringify(part.functionCall, null, 2));

            // Validate that required parameters are present
            const toolName = part.functionCall.name;
            const args = part.functionCall.args || {};

            // Define required parameters for critical tools
            const requiredParams = {
              db_query: ["query"],
              search_memories: ["sessionId", "query"],
              remember: ["sessionId", "content"],
              plan_tasks: ["objective"],
              execute_task: ["taskId"],
              think_sequentially: ["problem"],
            };

            if (requiredParams[toolName]) {
              const missing = requiredParams[toolName].filter(
                param => args[param] === undefined || args[param] === null || args[param] === ""
              );

              if (missing.length > 0) {
                console.log(
                  `⚠️ WARNING: Gemini generated ${toolName} call without required parameters: ${missing.join(
                    ", "
                  )}`
                );
                console.log(`   Skipping this tool call to prevent errors`);
                continue; // Skip this malformed tool call
              }
            }

            toolCalls.push({
              name: toolName,
              args: args,
            });
          }
        }
      }
    }

    console.log(
      `🐛 DEBUG Gemini extracted ${toolCalls.length} tool calls:`,
      JSON.stringify(toolCalls, null, 2)
    );
    return toolCalls;
  }

  extractTextFromContent(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join(" ");
    }
    return "";
  }

  generateToolCallId(toolName) {
    // Generate a short unique ID for Gemini tool calls
    return `gm_${toolName}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // STREAMING SUPPORT (Gemini-specific)
  async callProviderAPIStreaming(messages, tools, config = {}, callbacks = {}) {
    // Select appropriate model based on agent role and task complexity
    const selectedModel = this.selectModelFromConfig(config);
    
    if (selectedModel !== this.config.model) {
      console.log(`🎯 Streaming model tier selection: ${this.config.model} → ${selectedModel} (role: ${config.agentRole || 'default'})`);
    }
    // Get system prompt with schema context
    const systemPrompt = this.createSystemPrompt();

    // Start performance tracking for streaming LLM API call
    const llmCallId = this.performanceLogger?.startLLMCall(
      this.getProviderName(),
      selectedModel,
      systemPrompt?.length || 0,
      { streaming: true, tools_count: tools?.length || 0 }
    );

    const model = this.genAI.getGenerativeModel({
      model: selectedModel,
      systemInstruction: systemPrompt, // Add system prompt to model configuration
    });

    const geminiHistory = this.buildGeminiHistory(messages);

    console.log(
      `🔍 GEMINI STREAMING DEBUG - System prompt length: ${
        systemPrompt ? systemPrompt.length : 0
      } chars`
    );
    if (systemPrompt && systemPrompt.includes("DATA SCHEMA CONTEXT")) {
      console.log(`✅ GEMINI STREAMING: System prompt includes schema context`);
    } else {
      console.log(`❌ GEMINI STREAMING: No schema context in system prompt`);
    }

    const requestConfig = {
      history: geminiHistory,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    };

    if (tools && tools.length > 0) {
      const geminiTools = tools.map(tool => {
        // Get the correct schema - handle both MCP format and simplified format
        const inputSchema = tool.input_schema || tool.inputSchema || {};
        
        // Convert MCP schema format to Gemini format
        const geminiParameters = {
          type: inputSchema.type || "object",
          properties: inputSchema.properties || {},
          required: inputSchema.required || []
        };

        return {
          name: tool.name,
          description: tool.description,
          parameters: geminiParameters,
        };
      });

      requestConfig.tools = {
        functionDeclarations: geminiTools,
      };

      requestConfig.toolConfig = {
        functionCallingConfig: {
          mode: "ANY", // Changed back to ANY to ensure tool calls are generated more reliably
          allowedFunctionNames: geminiTools.map(t => t.name), // Explicitly specify allowed functions
        },
      };
    }

    let chat, stream, response;

    try {
      // Start operation
      this.startOperation();

      // Check if already cancelled before making request
      this.checkCancellation();

      chat = model.startChat(requestConfig);
      const lastMessage = messages[messages.length - 1];
      const userMessage =
        typeof lastMessage.content === "string"
          ? lastMessage.content
          : this.extractTextFromContent(lastMessage.content);

      stream = await chat.sendMessageStream(userMessage);

      let fullText = "";
      let toolCalls = [];
      let usage = null;

      for await (const chunk of stream.stream) {
        // Check for cancellation before processing each chunk
        if (this.isOperationCancelled()) {
          console.log("🛑 Gemini streaming cancelled by user");
          break;
        }

        const text = chunk.text();
        if (text) {
          fullText += text;
          if (callbacks.onText) {
            callbacks.onText(text);
          }
        }

        // Extract function calls from chunk
        const chunkToolCalls = this.extractGeminiToolCalls(chunk);
        if (chunkToolCalls.length > 0) {
          toolCalls.push(...chunkToolCalls);
        }
      }

      // Final cancellation check
      this.checkCancellation();

      response = await stream.response;
      usage = {
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      };

      // End performance tracking successfully
      if (llmCallId) {
        this.performanceLogger.endLLMCall(llmCallId, {
          total_tokens: usage.total_tokens,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          tool_calls_generated: toolCalls.length,
          streaming: true,
        });
      }

      const result = {
        text: fullText,
        toolCalls: toolCalls,
        usage: usage,
        rawResponse: response,
      };

      return result;
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
  }

  /**
   * Wrapper to add cancellation support to Gemini SDK calls
   * Since the SDK doesn't support AbortSignal natively, we implement polling
   */
  async withCancellationSupport(apiCall, abortController) {
    return new Promise(async (resolve, reject) => {
      // Set up abort handler
      const abortHandler = () => {
        console.log("🛑 Gemini API call aborted");
        reject(new Error("Operation cancelled by user"));
      };

      if (abortController.signal.aborted) {
        return reject(new Error("Operation cancelled by user"));
      }

      abortController.signal.addEventListener("abort", abortHandler);

      try {
        // Execute the API call
        const result = await apiCall();

        // Clean up
        abortController.signal.removeEventListener("abort", abortHandler);

        // Check one final time if cancelled during execution
        if (this.isOperationCancelled()) {
          reject(new Error("Operation cancelled by user"));
        } else {
          resolve(result);
        }
      } catch (error) {
        // Clean up
        abortController.signal.removeEventListener("abort", abortHandler);

        // Check if this is a cancellation
        if (this.isOperationCancelled()) {
          reject(new Error("Operation cancelled by user"));
        } else {
          reject(error);
        }
      }
    });
  }
}
