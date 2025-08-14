import fs from "fs/promises";
import path from "path";
import { createNeo4jSchemaService } from "./neo4j-schema-service.js";
import { getPerformanceLogger } from "../performance-logger.js";

export class DecisionContext {
  constructor({
    llmClient,
    tools = [],
    sessionId,
    mcpClient,
    logger = null,
    callbacks = null,
    maxIterations = 10,
    conversationHistory = [],
    maxReplans = 3,
    maxTasks = 15,
    tenantId = null,
  }) {
    // Store raw inputs for validation
    this.rawInputs = {
      llmClient,
      tools,
      sessionId,
      mcpClient,
      logger,
      callbacks,
      maxIterations,
      conversationHistory,
      maxReplans,
      maxTasks,
      tenantId,
    };

    // Validate and set properties
    this.validateAndSet();
  }

  validateAndSet() {
    const {
      llmClient,
      tools,
      sessionId,
      mcpClient,
      logger,
      callbacks,
      maxIterations,
      conversationHistory,
      maxReplans,
      maxTasks,
      tenantId,
    } = this.rawInputs;

    // Required parameters validation
    this.validateRequired("llmClient", llmClient);
    this.validateRequired("sessionId", sessionId);
    this.validateRequired("mcpClient", mcpClient);

    // Type validations
    this.validateLLMClient(llmClient);
    this.validateTools(tools);
    this.validateSessionId(sessionId);
    this.validateMCPClient(mcpClient);
    this.validateLogger(logger);
    this.validateCallbacks(callbacks);
    this.validateMaxIterations(maxIterations);
    this.validateConversationHistory(conversationHistory);
    this.validateMaxReplans(maxReplans);
    this.validateMaxTasks(maxTasks);

    // Set validated properties
    this.llmClient = llmClient;
    this.tools = Array.isArray(tools) ? tools : [];
    this.sessionId = sessionId;
    this.mcpClient = mcpClient;
    this.logger = logger;
    this.callbacks = this.createSafeCallbacks(callbacks);
    this.maxIterations = maxIterations;
    this.conversationHistory = conversationHistory;
    this.maxReplans = maxReplans;
    this.maxTasks = maxTasks;
    this.tenantId = tenantId;
    this.stream = !!this.callbacks;

    // Schema context will be populated during initialization
    this.schemaContext = null;
    this.schemaLoaded = false;

    // Memory context will be populated during initialization
    this.memoryLoaded = false;
    
    // RAG context will be populated during initialization
    this.ragContext = null;
    this.ragLoaded = false;
    
    // Initialize performance logger
    this.performanceLogger = getPerformanceLogger(this.sessionId);
  }

  validateRequired(paramName, value) {
    if (value === null || value === undefined) {
      throw new Error(`DecisionContext: ${paramName} is required`);
    }
  }

  validateLLMClient(llmClient) {
    const requiredMethods = [
      "callProviderAPI",
      "extractTextResponse",
      "extractToolCalls",
      "createRawPromptData",
      "executeToolCalls",
      "extractJSONFromResponse",
    ];

    requiredMethods.forEach(method => {
      if (typeof llmClient[method] !== "function") {
        throw new Error(`DecisionContext: llmClient missing required method: ${method}`);
      }
    });

    // Check for conversation history
    if (!Array.isArray(llmClient.conversationHistory)) {
      throw new Error("DecisionContext: llmClient must have conversationHistory array");
    }
  }

  validateTools(tools) {
    if (tools !== null && tools !== undefined && !Array.isArray(tools)) {
      throw new Error("DecisionContext: tools must be an array or null/undefined");
    }

    if (Array.isArray(tools)) {
      tools.forEach((tool, index) => {
        if (!tool || typeof tool !== "object") {
          throw new Error(`DecisionContext: tool at index ${index} must be an object`);
        }

        if (typeof tool.name !== "string") {
          throw new Error(`DecisionContext: tool at index ${index} must have a name string`);
        }

        if (typeof tool.description !== "string") {
          throw new Error(`DecisionContext: tool at index ${index} must have a description string`);
        }
      });
    }
  }

  validateSessionId(sessionId) {
    if (typeof sessionId !== "string") {
      throw new Error("DecisionContext: sessionId must be a string");
    }

    if (sessionId.trim().length === 0) {
      throw new Error("DecisionContext: sessionId cannot be empty");
    }
  }

  validateMCPClient(mcpClient) {
    if (!mcpClient || typeof mcpClient !== "object") {
      throw new Error("DecisionContext: mcpClient must be an object");
    }
  }

  validateLogger(logger) {
    if (logger !== null && logger !== undefined) {
      if (typeof logger !== "object") {
        throw new Error("DecisionContext: logger must be an object or null");
      }

      if (typeof logger.logRawPrompt !== "function") {
        throw new Error("DecisionContext: logger must have logRawPrompt method");
      }
    }
  }

  validateCallbacks(callbacks) {
    if (callbacks) {
      const validCallbacks = [
        "onText",
        "onResponseChunk",
        "onToolCall",
        "onToolResult",
        "onStatusChange",
        "onPlanGenerated",
        "onGapAnalysis",
        "onTaskQueueUpdate",
        "onComplete",
      ];

      Object.keys(callbacks).forEach(callbackName => {
        if (!validCallbacks.includes(callbackName)) {
          console.warn(`DecisionContext: unknown callback: ${callbackName}`);
        }

        if (typeof callbacks[callbackName] !== "function") {
          throw new Error(`DecisionContext: callback ${callbackName} must be a function`);
        }
      });
    }
  }

  validateMaxIterations(maxIterations) {
    if (typeof maxIterations !== "number") {
      throw new Error("DecisionContext: maxIterations must be a number");
    }

    if (maxIterations < 1 || maxIterations > 15) {
      throw new Error("DecisionContext: maxIterations must be between 1 and 15");
    }
  }

  validateConversationHistory(conversationHistory) {
    if (!Array.isArray(conversationHistory)) {
      throw new Error("DecisionContext: conversationHistory must be an array");
    }
  }

  validateMaxReplans(maxReplans) {
    if (typeof maxReplans !== "number") {
      throw new Error("DecisionContext: maxReplans must be a number");
    }

    if (maxReplans < 0 || maxReplans > 10) {
      throw new Error("DecisionContext: maxReplans must be between 0 and 10");
    }
  }

  validateMaxTasks(maxTasks) {
    if (typeof maxTasks !== "number") {
      throw new Error("DecisionContext: maxTasks must be a number");
    }

    if (maxTasks < 1 || maxTasks > 50) {
      throw new Error("DecisionContext: maxTasks must be between 1 and 50");
    }
  }

  createSafeCallbacks(callbacks = {}) {
    return {
      onText: text => {
        if (callbacks.onText && typeof callbacks.onText === "function") {
          try {
            callbacks.onText(text);
          } catch (error) {
            console.warn("onText callback error:", error);
          }
        }
      },

      onTokenReceived: (token) => {
        if (callbacks.onTokenReceived && typeof callbacks.onTokenReceived === "function") {
          try {
            callbacks.onTokenReceived(token);
          } catch (error) {
            console.warn("onTokenReceived callback error:", error);
          }
        }
      },

      onResponseChunk: chunk => {
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk(chunk);
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onToolCall: toolCall => {
        if (callbacks.onToolCall && typeof callbacks.onToolCall === "function") {
          try {
            callbacks.onToolCall(toolCall);
          } catch (error) {
            console.warn("onToolCall callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'tool_call',
              data: toolCall
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onToolResult: (toolCall, result) => {
        if (callbacks.onToolResult && typeof callbacks.onToolResult === "function") {
          try {
            callbacks.onToolResult(toolCall, result);
          } catch (error) {
            console.warn("onToolResult callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'tool_result',
              data: { toolCall, result }
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onStatusChange: status => {
        if (callbacks.onStatusChange && typeof callbacks.onStatusChange === "function") {
          try {
            callbacks.onStatusChange(status);
          } catch (error) {
            console.warn("onStatusChange callback error:", error);
          }
        }
      },

      onPlanGenerated: plan => {
        if (callbacks.onPlanGenerated && typeof callbacks.onPlanGenerated === "function") {
          try {
            callbacks.onPlanGenerated(plan);
          } catch (error) {
            console.warn("onPlanGenerated callback error:", error);
          }
        } else if (callbacks.onText && typeof callbacks.onText === "function") {
          try {
            callbacks.onText(`📋 Plan Generated: ${plan.understanding}`);
          } catch (error) {
            console.warn("onText fallback callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'plan_generated',
              data: plan
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onGapAnalysis: analysis => {
        if (callbacks.onGapAnalysis && typeof callbacks.onGapAnalysis === "function") {
          try {
            callbacks.onGapAnalysis(analysis);
          } catch (error) {
            console.warn("onGapAnalysis callback error:", error);
          }
        } else if (callbacks.onText && typeof callbacks.onText === "function") {
          try {
            callbacks.onText(`🔍 Analysis: ${analysis.action} - ${analysis.reasoning}`);
          } catch (error) {
            console.warn("onText fallback callback error:", error);
          }
        }
      },

      onTaskQueueUpdate: taskInfo => {
        if (callbacks.onTaskQueueUpdate && typeof callbacks.onTaskQueueUpdate === "function") {
          try {
            callbacks.onTaskQueueUpdate(taskInfo);
          } catch (error) {
            console.warn("onTaskQueueUpdate callback error:", error);
          }
        } else if (callbacks.onText && typeof callbacks.onText === "function") {
          try {
            callbacks.onText(
              `⚡ Executing: ${taskInfo.currentTask?.description} (${taskInfo.remainingTasks} remaining)`
            );
          } catch (error) {
            console.warn("onText fallback callback error:", error);
          }
        }
      },

      onComplete: result => {
        if (callbacks.onComplete && typeof callbacks.onComplete === "function") {
          try {
            callbacks.onComplete(result);
          } catch (error) {
            console.warn("onComplete callback error:", error);
          }
        }
      },

      // ============ Agent-specific callbacks ============
      onIntentAnalyzed: (analysis) => {
        if (callbacks.onIntentAnalyzed && typeof callbacks.onIntentAnalyzed === "function") {
          try {
            callbacks.onIntentAnalyzed(analysis);
          } catch (error) {
            console.warn("onIntentAnalyzed callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'intent_analyzed',
              data: analysis
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onAnalysisStart: (analysisInfo) => {
        if (callbacks.onAnalysisStart && typeof callbacks.onAnalysisStart === "function") {
          try {
            callbacks.onAnalysisStart(analysisInfo);
          } catch (error) {
            console.warn("onAnalysisStart callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'analysis_start',
              data: analysisInfo
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onInsightsExtracted: (insights) => {
        if (callbacks.onInsightsExtracted && typeof callbacks.onInsightsExtracted === "function") {
          try {
            callbacks.onInsightsExtracted(insights);
          } catch (error) {
            console.warn("onInsightsExtracted callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'insights_extracted',
              data: insights
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onResponseGenerationStart: (responseInfo) => {
        if (callbacks.onResponseGenerationStart && typeof callbacks.onResponseGenerationStart === "function") {
          try {
            callbacks.onResponseGenerationStart(responseInfo);
          } catch (error) {
            console.warn("onResponseGenerationStart callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'response_generation_start',
              data: responseInfo
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onTaskExecutionStart: (taskInfo) => {
        if (callbacks.onTaskExecutionStart && typeof callbacks.onTaskExecutionStart === "function") {
          try {
            callbacks.onTaskExecutionStart(taskInfo);
          } catch (error) {
            console.warn("onTaskExecutionStart callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'task_execution_start',
              data: taskInfo
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onTaskExecutionComplete: (result) => {
        if (callbacks.onTaskExecutionComplete && typeof callbacks.onTaskExecutionComplete === "function") {
          try {
            callbacks.onTaskExecutionComplete(result);
          } catch (error) {
            console.warn("onTaskExecutionComplete callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'task_execution_complete',
              data: result
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onAgentDecision: (decision) => {
        if (callbacks.onAgentDecision && typeof callbacks.onAgentDecision === "function") {
          try {
            callbacks.onAgentDecision(decision);
          } catch (error) {
            console.warn("onAgentDecision callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'agent_decision',
              data: decision
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },

      onAgentTransition: (transition) => {
        if (callbacks.onAgentTransition && typeof callbacks.onAgentTransition === "function") {
          try {
            callbacks.onAgentTransition(transition);
          } catch (error) {
            console.warn("onAgentTransition callback error:", error);
          }
        }
        // Forward to response chunk
        if (callbacks.onResponseChunk && typeof callbacks.onResponseChunk === "function") {
          try {
            callbacks.onResponseChunk({
              type: 'agent_transition',
              data: transition
            });
          } catch (error) {
            console.warn("onResponseChunk callback error:", error);
          }
        }
      },
    };
  }

  async preloadSchema() {
    if (this.schemaLoaded) {
      // Return cached schema context
      const cachedId = this.performanceLogger.startSchemaOperation('schema_cache_hit', 
        this.schemaContext?.length || 0);
      this.performanceLogger.endSchemaOperation(cachedId, { cache_hit: true });
      return this.schemaContext;
    }

    // Start performance tracking for schema loading
    const schemaLoadId = this.performanceLogger.startSchemaOperation('schema_preload');

    // Try Neo4j first if enabled, fallback to JSON file
    const useNeo4j = process.env.ENABLE_NEO4J_SCHEMA === 'true';
    
    try {
      let result;
      if (useNeo4j) {
        try {
          result = await this.preloadSchemaFromNeo4j();
        } catch (error) {
          console.warn("⚠️ Failed to load schema from Neo4j, falling back to JSON:", error.message);
          result = await this.preloadSchemaFromFile();
        }
      } else {
        result = await this.preloadSchemaFromFile();
      }

      // End performance tracking successfully
      this.performanceLogger.endSchemaOperation(schemaLoadId, {
        method: useNeo4j ? 'neo4j' : 'json_file',
        schema_size: result?.length || 0,
        cache_miss: true
      });

      return result;
    } catch (error) {
      // End performance tracking on error
      this.performanceLogger.endSchemaOperation(schemaLoadId, {
        error: error.message,
        method: useNeo4j ? 'neo4j' : 'json_file'
      });
      throw error;
    }
  }

  async preloadSchemaFromNeo4j() {
    console.log(`🔍 Preloading minimal schema from Neo4j for tenant: ${this.tenantId || 'public:default'}`);
    
    if (!this.neo4jSchemaService) {
      this.neo4jSchemaService = createNeo4jSchemaService();
      await this.neo4jSchemaService.initialize();
    }

    const schemaData = await this.neo4jSchemaService.preloadSchemaMinimal(this.tenantId);
    this.schemaContext = JSON.stringify(schemaData, null, 2);
    this.schemaLoaded = true;
    
    const { summary } = schemaData;
    console.log(`✅ Minimal Neo4j schema loaded: ${summary.tables} tables, ${summary.columns} columns, ${summary.knowledge} knowledge nodes`);
    
    return this.schemaContext;
  }

  async preloadSchemaFromFile() {
    console.log("🔍 Preloading database schema from JSON file...");

    try {
      // Read schema from JSON file
      const schemaPath = path.join(
        process.cwd(),
        "..",
        "src",
        "reference",
        "schema_graph_full.json"
      );
      const schemaData = await fs.readFile(schemaPath, "utf8");
      const schemaJson = JSON.parse(schemaData);

      // Convert to the same format that graph_export would return
      this.schemaContext = JSON.stringify(schemaJson, null, 2);
      this.schemaLoaded = true;
      console.log("✅ Database schema preloaded successfully from JSON file");
      return this.schemaContext;

    } catch (error) {
      console.warn("⚠️ Failed to preload schema from file:", error.message);
      this.schemaContext = `Schema unavailable - error: ${error.message}`;
      return this.schemaContext;
    }
  }

  getSchemaContext() {
    return this.schemaContext || "Schema not yet loaded";
  }



  /**
   * Preload RAG query context based on user message
   * This should be called during the planning stage to gather relevant knowledge
   */
  async preloadRagContext(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') {
      console.warn('⚠️ No user message provided for RAG context preloading');
      return null;
    }

    const ragLoadId = this.performanceLogger.startSchemaOperation('rag_preload');

    try {
      console.log(`🔍 Preloading RAG context for query: "${userMessage.substring(0, 100)}..."`);
      
      // Call rag_query tool with the user's message
      const toolResults = await this.mcpClient.callTool('rag_query', {
        query: userMessage
      });

      if (toolResults && !toolResults.isError && toolResults.content) {
        // Extract text from MCP content array format
        const ragText = toolResults.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
        this.ragContext = ragText;
        console.log(`✅ RAG context preloaded successfully: ${ragText.length} characters`);
        
        this.performanceLogger.endSchemaOperation(ragLoadId, {
          success: true,
          context_length: ragText.length || 0
        });
        
        return this.ragContext;
      } else {
        console.warn('⚠️ RAG query returned empty or error result');
        this.ragContext = "RAG context unavailable - empty result";
        
        this.performanceLogger.endSchemaOperation(ragLoadId, {
          success: false,
          empty_result: true
        });
        
        return this.ragContext;
      }
    } catch (error) {
      console.warn("⚠️ Failed to preload RAG context:", error.message);
      this.ragContext = `RAG context unavailable - error: ${error.message}`;
      
      this.performanceLogger.endSchemaOperation(ragLoadId, {
        error: error.message,
        success: false
      });
      
      return this.ragContext;
    }
  }

  getRagContext() {
    return this.ragContext || "RAG context not yet loaded";
  }
}
