/**
 * Base Agent class - defines the interface and common functionality for all agents
 */
export class BaseAgent {
  constructor(config = {}) {
    this.agentType = this.constructor.name;
    this.context = null;
    this.logger = config.logger || console;
    this.performanceLogger = config.performanceLogger;
  }

  /**
   * Initialize the agent with execution context
   * @param {AgentContext} context - Shared context between agents
   */
  initialize(context) {
    this.context = context;
    
    // If context has a performance logger and we don't have one from constructor, use context's
    if (!this.performanceLogger && context.performanceLogger) {
      this.performanceLogger = context.performanceLogger;
    }
    
    this.debug(`${this.agentType} initialized`);
  }

  /**
   * Get agent-specific system prompt
   * @returns {string} System prompt for this agent
   */
  getSystemPrompt() {
    throw new Error(`${this.agentType} must implement getSystemPrompt()`);
  }

  /**
   * Get tools available to this specific agent
   * @returns {Array} Array of tool definitions
   */
  getAvailableTools() {
    throw new Error(`${this.agentType} must implement getAvailableTools()`);
  }

  /**
   * Execute the agent's main functionality
   * @param {Object} input - Input data for the agent
   * @returns {Object} Agent execution result
   */
  async execute(input) {
    throw new Error(`${this.agentType} must implement execute()`);
  }

  /**
   * Validate input data for this agent
   * @param {Object} input - Input to validate
   * @returns {boolean} Whether input is valid
   */
  validateInput(input) {
    return input && typeof input === "object";
  }

  /**
   * Prepare handoff data for the next agent
   * @param {Object} result - Execution result
   * @returns {Object} Data to pass to next agent
   */
  prepareHandoff(result) {
    return {
      agentType: this.agentType,
      timestamp: new Date().toISOString(),
      result,
    };
  }

  /**
   * Create process-aware callbacks that inject process/stage info into streaming
   */
  createProcessAwareCallbacks(process, stage) {
    const originalCallbacks = this.context?.callbacks || {};
    const metadata = {
      agent: this.agentType,
      process: process || this.getDefaultProcess(),
      stage: stage || this.getDefaultStage(),
    };

    // console.log('🔍 DEBUG creating processAware callbacks with metadata:', metadata);

    return {
      ...originalCallbacks,

      // Enhanced onText that forwards to onResponseChunk directly (don't call original to avoid duplication)
      onText: text => {
        // console.log('🔍 DEBUG processAware onText called with text:', text.substring(0, 50) + '...');

        // DON'T call original onText to avoid duplication
        // Instead, directly forward to onResponseChunk with metadata
        if (
          originalCallbacks.onResponseChunk &&
          typeof originalCallbacks.onResponseChunk === "function"
        ) {
          // console.log('🔍 DEBUG forwarding to onResponseChunk with metadata:', metadata);
          originalCallbacks.onResponseChunk({
            chunk: text,
            timestamp: new Date().toISOString(),
            metadata: { ...metadata, dataType: "text" },
          });
        }
      },

      // Enhanced onTokenReceived that forwards to onResponseChunk directly (don't call original to avoid duplication)
      onTokenReceived: token => {
        // DON'T call original onTokenReceived to avoid duplication
        // Instead, directly forward to onResponseChunk with metadata
        if (
          originalCallbacks.onResponseChunk &&
          typeof originalCallbacks.onResponseChunk === "function"
        ) {
          originalCallbacks.onResponseChunk({
            chunk: token,
            timestamp: new Date().toISOString(),
            metadata: { ...metadata, dataType: "token" },
          });
        }
      },
    };
  }

  /**
   * Get default process name for this agent type
   */
  getDefaultProcess() {
    const agentProcessMap = {
      PlannerAgent: "planning",
      ExecutorAgent: "execution",
      AnalyzerAgent: "analysis",
      CoordinatorAgent: "coordination",
      DataOnboardingAgent: "data_onboarding",
    };
    return agentProcessMap[this.agentType] || "unknown";
  }

  /**
   * Get default stage name for this agent type
   */
  getDefaultStage() {
    const agentStageMap = {
      PlannerAgent: "planning_llm_call",
      ExecutorAgent: "execution_llm_call",
      AnalyzerAgent: "analysis_llm_call",
      CoordinatorAgent: "coordination_llm_call",
      DataOnboardingAgent: "onboarding_llm_call",
    };
    return agentStageMap[this.agentType] || "llm_call";
  }

  /**
   * Call LLM with agent-specific configuration and optional tool execution
   * @param {Array} messages - Messages for LLM
   * @param {Array} tools - Available tools
   * @param {Object} options - Additional options (executeTools: boolean to auto-execute tool calls, stream: boolean for streaming)
   * @returns {Object} LLM response with executed tool results if executeTools is true
   */
  async callLLM(messages, tools = [], options = {}) {
    if (!this.context?.llmClient) {
      throw new Error(`${this.agentType}: No LLM client available in context`);
    }

    // Add agent-specific system prompt
    const systemPrompt = this.getSystemPrompt();
    this.debug(`System prompt length: ${systemPrompt.length} chars`);
    const messagesWithSystem = [{ role: "system", content: systemPrompt }, ...messages];

    // Filter tools based on agent permissions
    const allowedTools = this.filterToolsForAgent(tools);

    // Add agent role context for tiered model selection
    const enhancedOptions = {
      ...options,
      agentRole: this.getAgentRole(),
      message: messages[messages.length - 1]?.content || '',
      tools: allowedTools,
      taskContext: this.analyzeTaskContext(messages, allowedTools)
    };

    // Check if streaming is enabled and callbacks are available
    const shouldStream =
      enhancedOptions.stream !== false && this.context?.stream && this.context?.callbacks;

    // Debug streaming decision
    this.debug(
      `Streaming check: options.stream=${options.stream}, context.stream=${
        this.context?.stream
      }, has callbacks=${!!this.context?.callbacks}, shouldStream=${shouldStream}`
    );

    let response;
    if (shouldStream) {
      this.debug("Using streaming LLM call");
      // Create process-aware callbacks that inject process/stage info into streaming
      const processAwareCallbacks = this.createProcessAwareCallbacks(
        options.process,
        options.stage
      );
      console.log("🔍 DEBUG processAwareCallbacks created:", {
        hasOnText: !!processAwareCallbacks.onText,
        hasOnTokenReceived: !!processAwareCallbacks.onTokenReceived,
        hasOnResponseChunk: !!processAwareCallbacks.onResponseChunk,
      });
      response = await this.context.llmClient.callProviderAPIStreaming(
        messagesWithSystem,
        allowedTools,
        enhancedOptions,
        processAwareCallbacks
      );
    } else {
      response = await this.context.llmClient.callProviderAPI(
        messagesWithSystem,
        allowedTools,
        enhancedOptions
      );
    }

    // If tool execution is requested and we have tool calls, execute them
    if (options.executeTools && response.toolCalls && response.toolCalls.length > 0) {
      console.log(`🔧 [${this.agentType}] Executing ${response.toolCalls.length} tool calls`);

      try {
        const toolResults = await this.executeToolCalls(response.toolCalls);

        // If we got results, make another LLM call with the tool results
        if (toolResults.length > 0) {
          const toolResultsMessage = {
            role: "user",
            content: this.formatToolResults(toolResults),
          };

          const followUpMessages = [
            ...messagesWithSystem,
            { role: "assistant", content: response.text || "" },
            toolResultsMessage,
          ];

          console.log(`🔧 [${this.agentType}] Making follow-up LLM call with tool results`);

          // Use streaming for follow-up call too if it was used for initial call
          if (shouldStream) {
            return await this.context.llmClient.callProviderAPIStreaming(
              followUpMessages,
              [],
              options,
              this.context.callbacks
            );
          } else {
            return await this.context.llmClient.callProviderAPI(followUpMessages, [], options);
          }
        }
      } catch (toolError) {
        console.error(`❌ [${this.agentType}] Tool execution failed:`, toolError.message);
        // Return original response if tool execution fails
      }
    }

    return response;
  }

  /**
   * Execute tool calls using MCP client
   * @param {Array} toolCalls - Tool calls to execute
   * @returns {Array} Tool results
   */
  async executeToolCalls(toolCalls) {
    if (!this.context?.mcpClient) {
      console.warn(`⚠️ [${this.agentType}] No MCP client available for tool execution`);
      return [];
    }

    const results = [];

    for (const toolCall of toolCalls) {
      try {
        console.log(`🔧 [${this.agentType}] Executing tool: ${toolCall.name}`);

        // Prepare tool input with sessionId for file operations
        let toolInput = toolCall.input || toolCall.args || {};
        const fileOperationTools = ['read_file', 'write_file', 'execute_command', 'list_directory'];
        if (fileOperationTools.includes(toolCall.name)) {
          if (!toolInput.sessionId && this.context?.sessionId) {
            toolInput = { ...toolInput, sessionId: this.context.sessionId };
            console.log(`📁 [${this.agentType}] Injected sessionId for ${toolCall.name}`);
          }
        }

        const result = await this.context.mcpClient.callTool(
          toolCall.name,
          toolInput
        );

        results.push({
          tool_use_id: toolCall.id || `tool_${Date.now()}`,
          tool_name: toolCall.name,
          content: result.content || JSON.stringify(result),
          is_error: result.isError || false,
        });

        console.log(`✅ [${this.agentType}] Tool ${toolCall.name} executed successfully`);
      } catch (error) {
        console.error(`❌ [${this.agentType}] Tool ${toolCall.name} failed:`, error.message);

        results.push({
          tool_use_id: toolCall.id || `tool_${Date.now()}`,
          tool_name: toolCall.name,
          content: `Error: ${error.message}`,
          is_error: true,
        });
      }
    }

    return results;
  }

  /**
   * Format tool results for LLM consumption
   * @param {Array} toolResults - Tool execution results
   * @returns {string} Formatted results
   */
  formatToolResults(toolResults) {
    return toolResults
      .map(result => {
        if (result.is_error) {
          return `Tool ${result.tool_name} failed: ${result.content}`;
        } else {
          return `Tool ${result.tool_name} result: ${result.content}`;
        }
      })
      .join("\n\n");
  }

  /**
   * Filter tools based on agent-specific permissions
   * @param {Array} allTools - All available tools
   * @returns {Array} Tools allowed for this agent
   */
  filterToolsForAgent(allTools) {
    // Handle null/undefined tools gracefully
    if (!allTools || !Array.isArray(allTools)) {
      return [];
    }

    const allowedToolNames = this.getAvailableTools().map(tool => tool.name);
    return allTools.filter(tool => allowedToolNames.includes(tool.name));
  }

  /**
   * Log agent-specific debug information
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.logger) {
      // Handle different logger interfaces
      if (typeof this.logger.log === "function") {
        this.logger.log(`🤖 [${this.agentType}]`, ...args);
      } else if (typeof this.logger.info === "function") {
        this.logger.info(`🤖 [${this.agentType}]`, ...args);
      } else if (typeof this.logger === "function") {
        this.logger(`🤖 [${this.agentType}]`, ...args);
      } else {
        console.log(`🤖 [${this.agentType}]`, ...args);
      }
    } else {
      console.log(`🤖 [${this.agentType}]`, ...args);
    }
  }

  /**
   * Start performance tracking for agent operations
   * @param {string} operation - Operation name
   * @param {Object} metadata - Additional metadata
   * @returns {string} Stage ID for ending tracking
   */
  startPerformanceTracking(operation, metadata = {}) {
    if (!this.performanceLogger) {
      this.debug(`⚠️ No performance logger available for ${this.agentType}`);
      return null;
    }

    try {
      return this.performanceLogger.startPipelineStage(
        `${this.agentType.toLowerCase()}_${operation}`,
        {
          agent_type: this.agentType,
          ...metadata,
        }
      );
    } catch (error) {
      this.debug(`❌ Performance tracking start failed: ${error.message}`);
      return null;
    }
  }

  /**
   * End performance tracking
   * @param {string} stageId - Stage ID from startPerformanceTracking
   * @param {Object} metadata - Additional metadata
   */
  endPerformanceTracking(stageId, metadata = {}) {
    if (!this.performanceLogger) {
      this.debug(`⚠️ No performance logger available for ${this.agentType}`);
      return;
    }
    
    if (!stageId) {
      this.debug(`⚠️ No stage ID provided for performance tracking end`);
      return;
    }

    try {
      this.performanceLogger.endPipelineStage(stageId, {
        agent_type: this.agentType,
        ...metadata,
      });
    } catch (error) {
      this.debug(`❌ Performance tracking end failed: ${error.message}`);
    }
  }

  /**
   * Get agent role for model tier selection
   */
  getAgentRole() {
    // Map agent types to standardized roles
    const roleMap = {
      'CoordinatorAgent': 'coordinator',
      'PlannerAgent': 'planner',
      'ExecutorAgent': 'executor',
      'AnalyzerAgent': 'analyzer',
      'DataOnboardingAgent': 'analyzer',
    };

    return roleMap[this.agentType] || 'executor';
  }

  /**
   * Analyze task context for complexity assessment
   */
  analyzeTaskContext(messages, tools) {
    if (!messages || messages.length === 0) {
      return { complexity: 'medium' };
    }

    const lastMessage = messages[messages.length - 1];
    const content = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : lastMessage.content?.text || '';

    // Use LLM client's complexity analysis if available
    if (this.context?.llmClient?.analyzeTaskComplexity) {
      return this.context.llmClient.analyzeTaskComplexity(content, tools);
    }

    // Simple fallback analysis
    const complexity = content.length > 200 || tools.length > 3 ? 'high' : 
                      content.length < 50 && tools.length <= 1 ? 'low' : 'medium';

    return { complexity };
  }
}
