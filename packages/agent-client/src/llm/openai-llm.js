import OpenAI from "openai";
import { AdvancedLLMBase } from "./advanced-llm-base.js";
import { proxyConfig } from "../utils/proxy-config.js";

/**
 * OpenAI implementation - vendor-specific methods only
 * All sophisticated conversation logic is in AdvancedLLMBase
 */
export class OpenAILLM extends AdvancedLLMBase {
  constructor(config = {}) {
    super(config);
    this.openai = null;
  }

  getProviderName() {
    return "openai";
  }

  getDefaultModel() {
    return "gpt-4o";
  }

  getProviderCapabilities() {
    return {
      streaming: true,
      functionCalling: true,
      vision: true,
      codeExecution: false,
      internetAccess: false,
      maxContextLength: 128000,
      supportedLanguages: ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi"],
      analyticsSubagent: true, // Same as Claude
      businessQueryDetection: true,
      schemaAwareQueries: true,
    };
  }

  isValidModel(model) {
    const validModels = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"];
    return validModels.includes(model);
  }

  getTokenCosts() {
    const costs = {
      "gpt-4o": { input: 2.5, output: 10.0 },
      "gpt-4o-mini": { input: 0.15, output: 0.6 },
      "gpt-4-turbo": { input: 10.0, output: 30.0 },
      "gpt-4": { input: 30.0, output: 60.0 },
      "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
    };

    return costs[this.config.model] || { input: 2.5, output: 10.0 };
  }

  async initialize(credentials) {
    if (!credentials.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    // Use proxy configuration if available
    const openAIConfig = proxyConfig.getOpenAIConfig(credentials.apiKey);
    
    this.openai = new OpenAI(openAIConfig);

    // Test proxy connection if configured
    if (proxyConfig.hasProxy()) {
      console.log('🔌 Testing OpenAI API connection through proxy...');
      await proxyConfig.testConnection('https://api.openai.com');
    }

    return true;
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: OpenAI API call
  async callProviderAPI(messages, tools, config = {}) {
    const systemPrompt = this.createSystemPrompt();

    console.log(`\n🔍 OPENAI DEBUG - Input messages to callProviderAPI:`);
    console.log(`   Number of input messages: ${messages.length}`);
    messages.forEach((msg, i) => {
      console.log(`   Message ${i}: role=${msg.role}, content type=${typeof msg.content}`);
      if (Array.isArray(msg.content)) {
        console.log(`     Array content types: ${msg.content.map(item => item.type).join(", ")}`);
      } else {
        console.log(`     Content preview: "${String(msg.content).substring(0, 100)}..."`);
      }
    });

    // Build OpenAI messages format (system message goes first)
    const builtMessages = this.buildOpenAIMessages(messages);
    console.log(`\n🔍 OPENAI DEBUG - After buildOpenAIMessages:`);
    console.log(`   Number of built messages: ${builtMessages.length}`);
    builtMessages.forEach((msg, i) => {
      console.log(
        `   Built ${i}: role=${msg.role}, content="${String(msg.content).substring(0, 50)}...", tool_call_id=${msg.tool_call_id || "none"}`
      );
    });

    const openaiMessages = [{ role: "system", content: systemPrompt }, ...builtMessages];

    console.log(`\n🔍 OPENAI DEBUG - Final messages to API:`);
    console.log(`   Total messages for API: ${openaiMessages.length}`);
    openaiMessages.forEach((msg, i) => {
      console.log(`   Final ${i}: role=${msg.role}, tool_call_id=${msg.tool_call_id || "none"}`);
      if (msg.tool_calls) {
        console.log(`     Has tool_calls: ${msg.tool_calls.length}`);
      }
    });

    // Validate OpenAI message format
    const toolMessages = openaiMessages.filter(msg => msg.role === "tool");
    const assistantWithToolCalls = openaiMessages.filter(
      msg => msg.role === "assistant" && msg.tool_calls
    );
    console.log(`\n🔍 OPENAI DEBUG - Message validation:`);
    console.log(`   Tool messages: ${toolMessages.length}`);
    console.log(`   Assistant messages with tool_calls: ${assistantWithToolCalls.length}`);

    // Check for orphaned tool messages
    for (let i = 0; i < openaiMessages.length; i++) {
      const msg = openaiMessages[i];
      if (msg.role === "tool") {
        // Find the previous assistant message with tool_calls
        let foundPrecedingToolCall = false;
        for (let j = i - 1; j >= 0; j--) {
          const prevMsg = openaiMessages[j];
          if (prevMsg.role === "assistant" && prevMsg.tool_calls) {
            const hasMatchingToolCall = prevMsg.tool_calls.some(tc => tc.id === msg.tool_call_id);
            if (hasMatchingToolCall) {
              foundPrecedingToolCall = true;
              break;
            }
          }
        }
        if (!foundPrecedingToolCall) {
          console.log(
            `   ❌ VALIDATION ERROR: Tool message at index ${i} (tool_call_id: ${msg.tool_call_id}) has no preceding assistant message with matching tool_calls`
          );
        }
      }
    }

    const requestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    // Add function calling if tools provided
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));

      // Smart tool choice logic (from previous implementation)
      const isDiagramRequest = this.isDiagramRequest(messages[messages.length - 1]?.content || "");
      requestBody.tool_choice = tools.length > 0 && !isDiagramRequest ? "required" : "auto";
    }

    const response = await this.openai.chat.completions.create(requestBody);

    return {
      text: response.choices[0]?.message?.content || "",
      toolCalls: response.choices[0]?.message?.tool_calls || [],
      usage: response.usage,
      rawResponse: response,
    };
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Create raw prompt data for logging
  async createRawPromptData(messages, tools, response) {
    const systemPrompt = this.createSystemPrompt();
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...this.buildOpenAIMessages(messages),
    ];

    return {
      provider: "openai",
      model: this.config.model,
      prompt: {
        messages: openaiMessages,
        tools: tools || [],
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
      response: {
        content: response.rawResponse?.choices?.[0]?.message || {},
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

    return response.toolCalls.map(toolCall => ({
      id: this.shortenToolCallId(toolCall.id),
      name: toolCall.function.name,
      input: JSON.parse(toolCall.function.arguments || "{}"),
    }));
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Add tool use to history
  async addToolUseToHistory(originalToolCalls, autoGeneratedToolCalls, assistantResponse) {
    // For OpenAI: Create assistant message with tool_calls
    const allToolCalls = [...originalToolCalls, ...autoGeneratedToolCalls];

    const assistantMessage = {
      role: "assistant",
      content: assistantResponse || null,
    };

    if (allToolCalls.length > 0) {
      assistantMessage.tool_calls = allToolCalls.map(toolCall => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.input),
        },
      }));
    }

    this.conversationHistory.push(assistantMessage);
  }

  // VENDOR-SPECIFIC IMPLEMENTATION: Add tool results to history
  async addToolResultsToHistory(toolResults) {
    // For OpenAI: Add individual tool messages with tool_call_id
    for (const result of toolResults) {
      this.conversationHistory.push({
        role: "tool",
        content: result.content,
        tool_call_id: result.tool_use_id,
      });
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

  // OpenAI-specific helper methods
  buildOpenAIMessages(messages) {
    const result = [];

    for (const msg of messages) {
      console.log(`\n🔍 Processing message: role=${msg.role}, content type=${typeof msg.content}`);

      // Skip messages that are already in OpenAI format (tool messages from previous processing)
      if (msg.role === "tool") {
        console.log(`   Skipping existing tool message (probably from OpenAI history)`);
        continue;
      }

      // Handle different message content formats
      if (typeof msg.content === "string") {
        console.log(`   Adding string content message`);
        result.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        console.log(`   Processing array content with ${msg.content.length} items`);

        // Check content types
        const contentTypes = msg.content.map(item => item.type);
        console.log(`   Content types: ${contentTypes.join(", ")}`);

        if (msg.content.every(item => item.type === "tool_result")) {
          console.log(`   Converting tool_result array to individual tool messages`);
          // This is a tool result message - convert to individual OpenAI tool messages
          for (const item of msg.content) {
            result.push({
              role: "tool",
              content: item.content,
              tool_call_id: item.tool_use_id,
            });
            console.log(`     Added tool message with tool_call_id: ${item.tool_use_id}`);
          }
        } else {
          // Convert Claude-style content blocks to OpenAI format
          let textContent = "";
          const toolUseBlocks = [];

          for (const item of msg.content) {
            if (item.type === "text") {
              textContent += item.text;
            } else if (item.type === "tool_use") {
              console.log(`     Found tool_use block: ${item.name} (id: ${item.id})`);
              toolUseBlocks.push(item);
            } else if (item.type === "tool_result") {
              console.log(`     Found tool_result block: ${item.tool_use_id}`);
              // Tool results should be separate messages - skip here
              continue;
            }
          }

          // Create assistant message with tool_calls if we have tool_use blocks
          if (msg.role === "assistant") {
            const assistantMessage = {
              role: "assistant",
              content: textContent.trim() || null,
            };

            if (toolUseBlocks.length > 0) {
              assistantMessage.tool_calls = toolUseBlocks.map(toolUse => ({
                id: this.shortenToolCallId(toolUse.id),
                type: "function",
                function: {
                  name: toolUse.name,
                  arguments: JSON.stringify(toolUse.input || {}),
                },
              }));
              console.log(`   Created assistant message with ${toolUseBlocks.length} tool_calls`);
            }

            result.push(assistantMessage);
          } else if (textContent.trim()) {
            console.log(`   Adding text content for non-assistant message`);
            result.push({ role: msg.role, content: textContent });
          }
        }
      } else if (msg.role && msg.content !== undefined) {
        console.log(`   Adding direct content message`);
        result.push({ role: msg.role, content: msg.content });
      } else {
        console.log(`   Skipping message with undefined/null content`);
      }
    }

    const filtered = result.filter(
      msg =>
        msg.content !== null &&
        msg.content !== "" &&
        !(msg.role === "assistant" && !msg.content && !msg.tool_calls)
    );

    console.log(`\n🔍 buildOpenAIMessages result: ${result.length} -> ${filtered.length} messages`);
    return filtered;
  }

  shortenToolCallId(id) {
    // OpenAI has 40-character limit for tool call IDs
    if (id.length <= 40) return id;

    // Create a shorter but still unique ID
    const hash = id.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    return `tc_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`.slice(0, 40);
  }

  isDiagramRequest(message) {
    if (!message || typeof message !== "string") return false;
    const lowerMessage = message.toLowerCase();
    return /\\b(diagram|chart|graph|visual|flow|process|structure|relationship|mermaid)\\b/.test(
      lowerMessage
    );
  }

  // STREAMING SUPPORT (OpenAI-specific)
  async callProviderAPIStreaming(messages, tools, config = {}, callbacks = {}) {
    const systemPrompt = this.createSystemPrompt();
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...this.buildOpenAIMessages(messages),
    ];

    const requestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));
    }

    const stream = await this.openai.chat.completions.create(requestBody);

    let fullText = "";
    let toolCalls = [];
    let usage = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullText += delta.content;
        if (callbacks.onText) {
          callbacks.onText(delta.content);
        }
      }

      if (delta?.tool_calls) {
        toolCalls.push(...delta.tool_calls);
      }

      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    if (callbacks.onComplete) {
      callbacks.onComplete();
    }

    return {
      text: fullText,
      toolCalls: toolCalls,
      usage: usage,
      rawResponse: {
        choices: [{ message: { content: fullText, tool_calls: toolCalls } }],
        usage,
      },
    };
  }
}
