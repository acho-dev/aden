import { AgentContext } from "../agents/agent-context.js";
import { CoordinatorAgent } from "../agents/coordinator-agent.js";
import { ExecutionResult } from "./models.js";
import { getPerformanceLogger } from "../performance-logger.js";

/**
 * MultiAgentDecisionExecutor - Modern multi-agent replacement for the monolithic DecisionExecutor
 * Uses specialized agents for planning, execution, and analysis with proper separation of concerns
 */
export class MultiAgentDecisionExecutor {
  constructor(context) {
    if (!context) {
      throw new Error("MultiAgentDecisionExecutor: context is required");
    }

    // Extract configuration from context
    this.llmClient = context.llmClient;
    this.tools = context.tools;
    this.sessionId = context.sessionId;
    this.mcpClient = context.mcpClient;
    this.logger = context.logger || console;
    this.callbacks = context.callbacks;
    this.conversationHistory = context.conversationHistory;
    this.maxIterations = context.maxIterations;
    this.stream = context.stream;
    this.tenantId = context.tenantId;

    // Multi-agent specific configuration
    this.maxAgentTransitions = context.maxAgentTransitions || 8;
    this.maxReplans = context.maxReplans || 3;
    this.maxTasks = context.maxTasks || 10;

    // Initialize performance logging
    this.performanceLogger = getPerformanceLogger(this.sessionId);

    // Initialize coordinator agent
    this.coordinatorAgent = new CoordinatorAgent({
      logger: this.logger,
      performanceLogger: this.performanceLogger,
      maxAgentTransitions: this.maxAgentTransitions,
    });

    console.log("✅ MultiAgentDecisionExecutor initialized");
  }

  /**
   * Main chat method - orchestrates multi-agent workflow
   * @param {string} message - User message to process
   * @returns {ExecutionResult} Comprehensive execution result
   */
  async chat(message) {
    if (!message || typeof message !== "string") {
      throw new Error("MultiAgentDecisionExecutor.chat: message must be a non-empty string");
    }

    // Start performance tracking for the entire chat session
    const chatSessionId = this.performanceLogger.startPipelineStage("multi_agent_chat_session", {
      message_length: message.length,
      tools_available: this.tools.length,
      executor_type: "multi_agent",
    });

    try {
      console.log(
        `🤖 Starting multi-agent workflow for message: "${message.substring(0, 100)}..."`
      );

      // Quick optimization: Try fast single-step execution for simple requests
      const fastResult = await this.tryFastExecution(message);
      if (fastResult) {
        console.log("⚡ Used fast single-step execution, bypassing multi-agent coordination");
        this.performanceLogger.endPipelineStage(chatSessionId, { optimization: "fast_execution_bypass" });
        return fastResult;
      }

      // Load schema context and set it on the LLM client
      const schemaContext = await this.loadSchemaContext();
      if (schemaContext && this.llmClient.setSchemaContext) {
        this.llmClient.setSchemaContext(schemaContext);
        console.log(`📊 Schema context set on LLM client: ${schemaContext.length} chars`);
      }

      // Create agent context with all necessary data
      const agentContext = new AgentContext({
        llmClient: this.llmClient,
        mcpClient: this.mcpClient,
        logger: this.logger,
        callbacks: this.callbacks,
        performanceLogger: this.performanceLogger,
        sessionId: this.sessionId,
        teamId: this.extractTeamId(),
        userId: this.extractUserId(),
        tenantId: this.tenantId,
        conversationHistory: this.conversationHistory,
        originalMessage: message.trim(),
        userIntent: await this.extractUserIntent(message),
        tools: this.tools,
        schemaContext: schemaContext,
        ragContext: await this.loadRagContext(message),
        maxIterations: this.maxIterations,
        maxReplans: this.maxReplans,
        maxTasks: this.maxTasks,
        stream: this.stream,
      });

      // Initialize coordinator with context
      this.coordinatorAgent.initialize(agentContext);

      // Execute multi-agent workflow
      const coordinationInput = {
        message: message,
        context: agentContext,
      };

      const coordinationResult = await this.coordinatorAgent.execute(coordinationInput);

      // Handle different result types
      if (coordinationResult.metadata?.finalResultType === "clarification") {
        console.log("❓ Multi-agent workflow requires user clarification");
      } else {
        console.log(`✅ Multi-agent workflow completed successfully`);
      }

      // End performance tracking
      this.performanceLogger.endPipelineStage(chatSessionId, {
        success: true,
        agent_transitions: coordinationResult.metadata?.agentTransitions || 0,
        total_tool_calls: coordinationResult.toolCalls?.length || 0,
        response_length: coordinationResult.response?.length || 0,
        final_result_type: coordinationResult.metadata?.finalResultType || "unknown",
      });

      // Log performance summary
      this.performanceLogger.logPerformanceSummary();

      return coordinationResult;
    } catch (error) {
      // End performance tracking on error
      this.performanceLogger.endPipelineStage(chatSessionId, {
        error: error.message,
        partial_execution: true,
      });

      console.error("❌ MultiAgentDecisionExecutor.chat failed:", error);

      // Create fallback execution result
      return this.createFallbackResult(message, error);
    }
  }

  /**
   * Load schema context for database operations
   * Schema should be preloaded by the advanced LLM base - this is a fallback
   */
  async loadSchemaContext() {
    // Check if schema is already available on the LLM client
    if (this.llmClient && this.llmClient.schemaContext) {
      console.log(
        `📊 Using preloaded schema context: ${this.llmClient.schemaContext.length} characters`
      );
      return this.llmClient.schemaContext;
    }

    // Fallback: Schema should be preloaded by the system, but if not available, return null
    console.log(
      "📊 No preloaded schema context available - schema should be loaded by the advanced LLM base"
    );
    console.log("📊 Multi-agent system will continue without schema context");
    return null;
  }

  /**
   * Load RAG context based on user message
   * RAG context provides relevant information from indexed documents
   */
  async loadRagContext(message) {
    if (!this.mcpClient) {
      console.log("📚 No MCP client available for RAG loading");
      return null;
    }

    try {
      console.log("📚 Loading RAG context...");

      const ragResult = await this.mcpClient.callTool("rag_query", {
        query: message,
      });

      if (ragResult && !ragResult.isError && ragResult.content) {
        // Extract text from MCP content array format
        const ragText = ragResult.content
          .filter(item => item.type === "text")
          .map(item => item.text)
          .join("\n");
        console.log(`📚 RAG context loaded: ${ragText.length} characters`);
        console.log(ragText);
        return ragText;
      } else {
        console.log("📚 No relevant RAG context found");
        return null;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load RAG context: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract user intent from message for better agent coordination
   */
  async extractUserIntent(message) {
    // Simple intent classification - could be enhanced with ML
    const lowerMessage = message.toLowerCase();

    // Business data queries
    if (/\b(our|my|the)\s+(customers?|deals?|sales?|revenue|accounts?|data)\b/.test(lowerMessage)) {
      return "business_data_query";
    }

    // Visualization requests
    if (/\b(chart|graph|diagram|visualiz|plot)\b/.test(lowerMessage)) {
      return "visualization_request";
    }

    // Analysis requests
    if (/\b(analyz|compare|examine|study|investigate)\b/.test(lowerMessage)) {
      return "analysis_request";
    }

    // Task execution
    if (/\b(execute|run|perform|do|complete)\b/.test(lowerMessage)) {
      return "task_execution";
    }

    // Information seeking
    if (/\b(what|how|when|where|why|tell me|show me|find)\b/.test(lowerMessage)) {
      return "information_seeking";
    }

    return "general_request";
  }

  /**
   * Check if word is a stop word
   */
  isStopWord(word) {
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "are",
      "but",
      "not",
      "you",
      "all",
      "can",
      "had",
      "her",
      "was",
      "one",
      "our",
      "out",
      "day",
      "get",
      "has",
      "him",
      "his",
      "how",
      "man",
      "new",
      "now",
      "old",
      "see",
      "two",
      "way",
      "who",
      "boy",
      "did",
      "its",
      "let",
      "put",
      "say",
      "she",
      "too",
      "use",
    ]);
    return stopWords.has(word);
  }

  /**
   * Try fast single-step execution for simple requests
   * Combines planning and execution in one LLM call to reduce latency
   */
  async tryFastExecution() {
    // Fast execution disabled - always use full multi-agent coordination
    return null;
  }
  
  /**
   * Get simplified tool set for fast execution
   */
  getSimplifiedTools() {
    return [
      {
        name: "db_query",
        description: "Execute SQL queries against the database",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "SQL query to execute" },
            limit: { type: "number", description: "Maximum results to return" }
          },
          required: ["query"]
        }
      },
      {
        name: "markdown_table", 
        description: "Format data in table format",
        input_schema: {
          type: "object",
          properties: {
            headers: { type: "array", description: "Table headers" },
            rows: { type: "array", description: "Table rows" },
            title: { type: "string", description: "Table title" }
          },
          required: ["headers", "rows"]
        }
      },
      {
        name: "read_file",
        description: "Read the contents of a file from the filesystem",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "The file path to read" }
          },
          required: ["path"]
        }
      },
      {
        name: "write_file",
        description: "Write content to a file on the filesystem",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "The file path to write to" },
            content: { type: "string", description: "The content to write to the file" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "execute_command",
        description: "Execute a shell command",
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command to execute" },
            workingDirectory: { type: "string", description: "Working directory for the command (optional)" }
          },
          required: ["command"]
        }
      },
      {
        name: "list_directory",
        description: "List the contents of a directory",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "The directory path to list" }
          },
          required: ["path"]
        }
      }
    ];
  }

  /**
   * Extract team ID from context or session
   */
  extractTeamId() {
    // This would extract team ID from JWT token or session context
    // For now, return null - would be implemented based on auth system
    return process.env.CURRENT_TEAM_ID || null;
  }

  /**
   * Extract user ID from context or session
   */
  extractUserId() {
    // This would extract user ID from JWT token or session context
    // For now, return null - would be implemented based on auth system
    return process.env.CURRENT_USER_ID || null;
  }

  /**
   * Create fallback result when execution fails
   */
  createFallbackResult(message, error) {
    console.log(`🛡️ Creating fallback result for failed execution: ${error.message}`);

    // Don't apologize for user-initiated cancellation
    let response;
    if (error.message === 'Operation cancelled by user') {
      response = `Operation cancelled by user. You can start a new request when ready.`;
    } else {
      response = `I apologize, but I encountered an error while processing your request: "${message}"\n\nError: ${error.message}\n\nPlease try rephrasing your question or break it down into smaller parts. I'm here to help once the issue is resolved.`;
    }

    return new ExecutionResult({
      response: response,
      rawPrompts: [],
      toolCalls: [],
      toolResults: [],
      knowledgeGraph: {},
      metadata: {
        multiAgent: true,
        fallback: true,
        error: error.message,
        originalMessage: message,
      },
    });
  }

  /**
   * Get execution statistics
   */
  getExecutionStats() {
    return {
      executorType: "multi_agent",
      sessionId: this.sessionId,
      maxAgentTransitions: this.maxAgentTransitions,
      maxReplans: this.maxReplans,
      maxTasks: this.maxTasks,
      toolsAvailable: this.tools?.length || 0,
      hasSchemaAccess: !!this.mcpClient,
      hasMemoryAccess: !!this.mcpClient && !!this.sessionId,
    };
  }
}
