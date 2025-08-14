import { DecisionContext } from "./decision-context.js";
import { ExecutionResult, InitialPlan, GapAnalysis, TaskExecution } from "./models.js";
import {
  generateInitialPlanPrompt,
  generateGapAnalysisPrompt,
  generateClarificationQuestionsPrompt,
  generateExecuteCurrentTaskPrompt,
  generateFinalResponsePrompt,
  generateShouldReplanPrompt,
  generateReplanPrompt,
  generateExplanationForFormattedContentPrompt,
} from "./prompts.js";
import { getToolDisplayName } from "../../../mcp-server/src/tool-display-names.js";
import { createFastDecisionOptimizer } from "./fast-decision-optimizer.js";
import { getPerformanceLogger } from "../performance-logger.js";

export class DecisionExecutor {
  constructor(context) {
    if (!(context instanceof DecisionContext)) {
      throw new Error("DecisionExecutor: context must be an instance of DecisionContext");
    }

    this.context = context; // Store full context for schema access
    this.llmClient = context.llmClient;
    // Filter out graph_export (not advertised for general agent use) and search_memories (preloaded in context)
    this.tools = context.tools.filter(
      tool => tool.name !== "graph_export" && tool.name !== "search_memories"
    );
    this.sessionId = context.sessionId;
    this.mcpClient = context.mcpClient;
    this.logger = context.logger;
    this.callbacks = context.callbacks;
    this.conversationHistory = context.conversationHistory;
    this.maxIterations = context.maxIterations;
    this.stream = context.stream;

    // Budget constraints to prevent infinite loops
    this.maxReplans = context.maxReplans || 3;
    this.maxTasks = context.maxTasks || 10;

    // Initialize fast decision optimizer for performance gains
    this.fastOptimizer = createFastDecisionOptimizer({
      groqApiKey: process.env.GROQ_API_KEY,
      fallbackToMainLLM: true,
      sessionId: this.sessionId,
    });

    // Initialize performance logging
    this.performanceLogger = getPerformanceLogger(this.sessionId);

    this.init();

    console.log("✅ DecisionExecutor initialized with DecisionContext");

    // Show optimization status
    setTimeout(() => {
      const optimizerStats = this.fastOptimizer.getStats();
      if (optimizerStats.enabled) {
        console.log(
          `⚡ Fast decision optimization enabled with ${optimizerStats.provider} (${optimizerStats.model})`
        );
        console.log(`   Available optimizations: ${optimizerStats.features.join(", ")}`);
      } else {
        console.log(`🐌 Fast decision optimization disabled - using main LLM for all decisions`);
      }
    }, 1000);
  }

  init() {
    this.taskQueue = [];
    this.gatheredFacts = [];
    this.collectedRawPrompts = [];
    this.allToolCalls = [];
    this.allToolResults = [];

    this.message = "";
    this.memoryContext = "";
    this.memorySearchResults = [];

    // Reset budget counters
    this.replanCount = 0;
    this.totalTasksCreated = 0;
  }

  async chat(message) {
    if (!message || typeof message !== "string") {
      throw new Error("DecisionExecutor.chat: message must be a non-empty string");
    }

    // Start performance tracking for the entire chat session
    const chatSessionId = this.performanceLogger.startPipelineStage("chat_session", {
      message_length: message.length,
      tools_available: this.tools.length,
    });

    try {
      // Reset state for new chat
      this.init();
      this.message = message.trim();

      // Preload schema and memory context before planning
      const contextLoadId = this.performanceLogger.startPipelineStage("context_loading");
      await this.context.preloadSchema();

      // await this.context.preloadMemories(this.message);
      this.performanceLogger.endPipelineStage(contextLoadId, {
        schema_loaded: true,
        schema_size: this.context.getSchemaContext()?.length || 0,
      });

      // Set schema context on LLM client to include in system prompt instead of individual task prompts
      const schemaContext = this.context.getSchemaContext();
      console.log(
        `🔍 DEBUG: About to set schema on LLM client. Schema length: ${
          schemaContext ? schemaContext.length : 0
        }`
      );
      console.log(
        `🔍 DEBUG: LLM client has setSchemaContext method: ${!!this.llmClient.setSchemaContext}`
      );
      console.log(`🔍 DEBUG: LLM client type: ${this.llmClient.constructor.name}`);

      if (this.llmClient.setSchemaContext) {
        this.llmClient.setSchemaContext(schemaContext);
        console.log(`✅ Schema context successfully set on LLM client`);
      } else {
        console.log(`❌ ERROR: LLM client does not have setSchemaContext method!`);
      }

      // await this.context.preloadMemories(this.message);

      // Initialize fast optimizer and wait for it
      try {
        console.log("⚡ Initializing fast decision optimizer...");
        await this.fastOptimizer.initialize();
        console.log("⚡ Fast decision optimizer initialization complete");
      } catch (err) {
        console.warn("⚡ Fast optimizer initialization failed:", err.message);
      }

      // Initial Planning
      const initialPlan = await this.generateInitialPlan();
      console.log(`📝 Initial plan generated:`, JSON.stringify(initialPlan.tasks));

      // Debug: Log plan details for diagram requests
      if (
        this.message.toLowerCase().includes("chart") ||
        this.message.toLowerCase().includes("diagram") ||
        this.message.toLowerCase().includes("visual")
      ) {
        console.log(`🎨 DIAGRAM REQUEST DETECTED - Plan Analysis:`);
        console.log(`   User message: "${this.message}"`);
        console.log(`   Understanding: ${initialPlan.understanding}`);
        console.log(`   Number of tasks: ${initialPlan.tasks?.length || 0}`);
        initialPlan.tasks?.forEach((task, i) => {
          console.log(`   Task ${i + 1}: ${task.description}`);
          console.log(`     Tools: ${task.toolsRequired?.join(", ") || "none"}`);
          console.log(`     Dependencies: ${task.dependencies?.join(", ") || "none"}`);
        });
      }

      // Async debug logging (non-blocking)
      if (process.env.DEBUG_MODE === "true") {
        setImmediate(async () => {
          try {
            const fs = await import("fs");
            const path = await import("path");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `initialPlan_${timestamp}.json`;
            const filepath = path.join(process.cwd(), "debug", filename);
            await fs.promises.mkdir(path.join(process.cwd(), "debug"), { recursive: true });
            const planData = {
              timestamp: new Date().toISOString(),
              sessionId: this.sessionId,
              userMessage: this.message,
              initialPlan: {
                understanding: initialPlan.understanding,
                contextAnalysis: initialPlan.contextAnalysis,
                response: initialPlan.response,
                tasks:
                  initialPlan.tasks?.map(t => ({ id: t.id, description: t.description })) || [],
              },
            };
            await fs.promises.writeFile(filepath, JSON.stringify(planData, null, 2), "utf8");
          } catch (error) {
            // Silently fail - debug logging should not break execution
          }
        });
      }

      // Initialize task queue from plan with task limit enforcement
      const tasks = initialPlan.tasks || [];
      if (tasks.length > this.maxTasks) {
        console.warn(`⚠️ Initial plan has ${tasks.length} tasks, limiting to ${this.maxTasks}`);
        this.taskQueue = tasks.slice(0, this.maxTasks);
      } else {
        this.taskQueue = tasks;
      }
      this.totalTasksCreated = this.taskQueue.length;
      console.log(
        `📋 Generated initial plan with ${this.taskQueue.length} tasks (limit: ${this.maxTasks})`
      );

      // Iterative Execution
      let iterationCount = 0;
      let isFirstTask = true;
      let totalTasks = this.taskQueue.length;
      let consecutiveNoProgressCount = 0; // Track consecutive iterations without progress

      console.log(`🔄 Starting iterative execution with ${totalTasks} tasks`);
      while (this.taskQueue.length > 0 && iterationCount <= this.maxIterations) {
        iterationCount++;

        if (iterationCount > this.maxIterations) {
          console.warn(
            `⚠️ Reached maximum iterations (${this.maxIterations}), ending execution loop`
          );
          break;
        }

        const gapAnalysis = await this.performGapAnalysis(isFirstTask);
        console.log(
          `🔍 GapAnalysis Analysis Result: ${gapAnalysis.action} - ${gapAnalysis.reasoning}`
        );

        if (gapAnalysis.action === "ASK_CLARIFICATION") {
          return await this.processAskClarification(gapAnalysis);
        }

        if (gapAnalysis.action === "EXECUTE_TASKS") {
          const currentTask = this.taskQueue.shift();
          const taskExecution = await this.processExecuteTask(currentTask);

          // Check if we made progress (tool calls were executed)
          if (!taskExecution.toolCalls || taskExecution.toolCalls.length === 0) {
            consecutiveNoProgressCount++;
            console.warn(
              `⚠️ No tool calls executed in iteration ${iterationCount} (${consecutiveNoProgressCount} consecutive no-progress iterations)`
            );

            // Exit if we've had too many consecutive iterations without progress
            if (consecutiveNoProgressCount >= 3) {
              console.warn(
                `❌ Stopping execution - ${consecutiveNoProgressCount} consecutive iterations without tool calls`
              );
              break;
            }
          } else {
            consecutiveNoProgressCount = 0; // Reset counter on progress
          }

          const needsReplan = await this.shouldReplan(currentTask, taskExecution);

          if (needsReplan) {
            // Check replan budget before replanning
            if (this.replanCount >= this.maxReplans) {
              console.warn(
                `⚠️ Replan budget exhausted (${this.replanCount}/${this.maxReplans}), continuing with remaining tasks`
              );
            } else {
              const newPlan = await this.replanTasks(currentTask, taskExecution);
              this.taskQueue = newPlan.tasks || [];
              this.replanCount++;
              console.log(`🔄 Replanned tasks (${this.replanCount}/${this.maxReplans})`);
              isFirstTask = true;
            }
          }

          isFirstTask = false;
          continue;
        }

        if (gapAnalysis.action === "GENERATE_ANSWER") {
          console.log("✅ GapAnalysis analysis indicates sufficient information for final answer");
          break;
        }
      }

      const finalMessage = await this.generateFinalResponse(initialPlan.response);

      // Create knowledge graph nodes and edges after generating final response
      // const knowledgeGraph = await this.createKnowledgeGraph(this.message, finalMessage);

      // End performance tracking for the entire chat session
      this.performanceLogger.endPipelineStage(chatSessionId, {
        final_response_generated: true,
        total_tool_calls: this.allToolCalls.length,
        total_facts_gathered: this.gatheredFacts.length,
        replans_executed: this.replanCount,
      });

      // Log performance summary
      this.performanceLogger.logPerformanceSummary();

      return new ExecutionResult({
        response: finalMessage,
        rawPrompts: this.collectedRawPrompts,
        toolCalls: this.allToolCalls,
        toolResults: this.allToolResults,
        knowledgeGraph: {},
      });
    } catch (error) {
      // End performance tracking on error
      this.performanceLogger.endPipelineStage(chatSessionId, {
        error: error.message,
        partial_tool_calls: this.allToolCalls?.length || 0,
      });

      console.error("❌ DecisionExecutor.chat failed:", error);
      throw error;
    }
  }

  async processAskClarification(gapAnalysis) {
    this.callbacks.onStatusChange("❓ Generating clarification questions");
    console.log("❓ Generating clarification questions");
    const questionResponse = await this.generateClarificationQuestions(this.message);
    return new ExecutionResult({
      response: questionResponse,
      rawPrompts: this.collectedRawPrompts,
      toolCalls: this.allToolCalls,
      toolResults: this.allToolResults,
    });
  }

  async processExecuteTask(currentTask) {
    this.callbacks.onStatusChange(`🔄 Task executing: ${currentTask.description}`);
    console.log(`⚡ Executing task: ${currentTask.description}`);

    // Non-blocking debug logging
    if (process.env.DEBUG_MODE === "true") {
      setImmediate(async () => {
        try {
          const fs = await import("fs");
          const path = await import("path");
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `taskExecution_${timestamp}.json`;
          const filepath = path.join(process.cwd(), "debug", filename);
          await fs.promises.writeFile(
            filepath,
            JSON.stringify(
              {
                taskId: currentTask.id,
                description: currentTask.description,
              },
              null,
              2
            ),
            "utf8"
          );
        } catch (error) {
          // Silently fail
        }
      });
    }

    const taskExecution = await this.executeCurrentTask(currentTask);
    if (taskExecution.toolCalls) {
      this.allToolCalls.push(...taskExecution.toolCalls);
    }

    if (taskExecution.toolResults) {
      this.allToolResults.push(...taskExecution.toolResults);
    }

    if (taskExecution.facts) {
      this.gatheredFacts.push(...taskExecution.facts);
      console.log(
        `📚 Added ${taskExecution.facts.length} new facts, total: ${this.gatheredFacts.length}`
      );
    }

    // Non-blocking debug logging for completion
    if (process.env.DEBUG_MODE === "true") {
      setImmediate(async () => {
        try {
          const fs = await import("fs");
          const path = await import("path");
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `taskComplete_${timestamp}.json`;
          const filepath = path.join(process.cwd(), "debug", filename);
          await fs.promises.writeFile(
            filepath,
            JSON.stringify(
              {
                taskId: currentTask.id,
                completed: taskExecution.taskCompleted,
                toolCalls: taskExecution.toolCalls?.length || 0,
              },
              null,
              2
            ),
            "utf8"
          );
        } catch (error) {
          // Silently fail
        }
      });
    }

    return taskExecution;
  }

  async generateInitialPlan() {
    const startTime = performance.now();
    console.log("🎯 Generating initial plan and tasks...");
    this.callbacks.onStatusChange("Generating initial plan and tasks...");
    // Analyze conversation history for context
    let conversationContext = "";

    if (this.conversationHistory.length > 1) {
      const recentHistory = this.conversationHistory
        .slice(-6, -1)
        .map(
          msg =>
            `${msg.role}: ${
              typeof msg.content === "string" ? msg.content : msg.content[0]?.text || ""
            }`
        )
        .join("\n");

      conversationContext = `Recent conversation context:\n${recentHistory}`;
      console.log(`💬 Analyzed ${this.conversationHistory - 1} previous conversation messages`);
    }

    const planningPrompt = generateInitialPlanPrompt(
      this.message,
      conversationContext,
      this.tools,
      null // Schema context is now in system prompt
    );

    try {
      const messages = [{ role: "user", content: planningPrompt }];
      const response = await this.callLLM(messages, [], { timeout: 30000 });

      const planText = this.llmClient.extractTextResponse(response);
      const planData = this.llmClient.extractJSONFromResponse(planText, {
        understanding: "Simple user interaction",
        context_analysis: "Simple request - no complex analysis needed",
        tasks: [],
        response: "Hello! How can I help you today?",
      });

      const duration = performance.now() - startTime;
      console.log(`⏱️ generateInitialPlan completed in ${duration.toFixed(2)}ms`);
      return InitialPlan.fromJSON(planData);
    } catch (error) {
      console.error("Failed to generate initial plan:", error);
      const duration = performance.now() - startTime;
      console.log(`⏱️ generateInitialPlan completed in ${duration.toFixed(2)}ms (error)`);
      return new InitialPlan({
        understanding: "Simple user interaction",
        contextAnalysis: "Unable to analyze context due to planning error",
        tasks: [],
        response: "Hello! How can I help you today?",
      });
    }
  }

  async performGapAnalysis(isFirstTask = false) {
    const startTime = performance.now();

    if (isFirstTask) {
      const duration = performance.now() - startTime;
      console.log(
        `⏱️ performGapAnalysis completed in ${duration.toFixed(2)}ms (first task bypass)`
      );
      return GapAnalysis.fromJSON({
        action: "EXECUTE_TASKS",
        confidence: 1.0,
        reasoning: "Executing first task directly as no prior context",
      });
    }

    this.callbacks.onStatusChange("🔍 Performing gap analysis on tasks");
    console.log("🔍 Performing gap analysis on tasks");

    // Try fast optimization first
    const fastResult = await this.fastOptimizer.performGapAnalysis(
      this.message,
      this.taskQueue[0],
      this.taskQueue,
      this.gatheredFacts,
      this.llmClient.conversationHistory,
      this.tools,
      null, // Schema context is now in system prompt
      memoryContext
    );

    if (fastResult !== null) {
      const duration = performance.now() - startTime;
      console.log(
        `⏱️ performGapAnalysis completed in ${duration.toFixed(2)}ms (fast optimization)`
      );
      console.log(`⚡ Using fast gap analysis: ${fastResult.action}`);
      return GapAnalysis.fromJSON(fastResult);
    }

    // Fallback to main LLM if fast optimization fails
    console.log(`🐌 Falling back to main LLM for gap analysis`);
    const schemaContext = this.context.getSchemaContext();
    const gapAnalysisPrompt = generateGapAnalysisPrompt(
      this.message,
      this.taskQueue[0],
      this.taskQueue,
      this.gatheredFacts,
      this.llmClient.conversationHistory,
      this.tools,
      schemaContext,
      memoryContext
    );

    try {
      const gapData = await callEndpoint(gapAnalysisPrompt);
      const duration = performance.now() - startTime;
      console.log(`⏱️ performGapAnalysis completed in ${duration.toFixed(2)}ms (fallback)`);

      return GapAnalysis.fromJSON(gapData);
    } catch (error) {
      console.error("Failed to perform gap analysis:", error);
      const duration = performance.now() - startTime;
      console.log(`⏱️ performGapAnalysis completed in ${duration.toFixed(2)}ms (error fallback)`);
      return GapAnalysis.fromJSON({
        action: "EXECUTE_TASKS",
        confidence: 0.3,
        reasoning: "Defaulting to task execution due to analysis error",
      });
    }
  }

  async generateClarificationQuestions(questions) {
    const clarificationPrompt = generateClarificationQuestionsPrompt(questions);

    try {
      const messages = [{ role: "user", content: clarificationPrompt }];
      const response = await this.callLLM(messages, [], {
        timeout: 30000,
      });

      return this.llmClient.extractTextResponse(response);
    } catch (error) {
      console.error("Failed to generate clarification questions:", error);
      return "I need a bit more information to help you better. Could you provide some additional details about your request?";
    }
  }

  async executeCurrentTask(task) {
    // Build context from previous tool results
    const previousResults = this.buildPreviousResultsContext();
    const taskExecutionPrompt = generateExecuteCurrentTaskPrompt(
      task,
      previousResults,
      this.tools,
      null, // Schema context is now in system prompt
      memoryContext
    );

    // console.log("###############");
    // console.log(taskExecutionPrompt);

    // Remove synchronous debug file write - use console.debug if needed
    if (process.env.DEBUG_MODE === "true" && process.env.VERBOSE_DEBUG === "true") {
      console.debug(`Task execution prompt length: ${taskExecutionPrompt.length} chars`);
    }

    // Write taskExecutionPrompt to file for debugging

    try {
      const messages = [
        ...this.conversationHistory,
        { role: "user", content: taskExecutionPrompt },
      ];

      {
        const response = await this.callLLM(messages, this.tools, {});

        let toolCalls = this.llmClient.extractToolCalls(response);
        const limitedToolCalls = toolCalls.slice(0, 25);
        if (toolCalls.length > 20) {
          console.warn(`⚠️ Tool calls limited from ${toolCalls.length} to 20 for performance`);
        }

        let _toolResults = [];
        let _toolCalls = [];
        let facts = [];

        if (limitedToolCalls.length > 0) {
          try {
            const dbQueryCalls = limitedToolCalls.filter(tc => tc.name === "db_query");
            if (dbQueryCalls.length > 0) {
              console.log(
                `🗄️ Database exploration strategy: ${dbQueryCalls.length} db_query calls generated`
              );
            }

            // Notify about initial tool calls before execution
            limitedToolCalls.forEach(toolCall => {
              this.callbacks.onToolCall(toolCall);
            });

            const originalToolCallCount = limitedToolCalls.length;

            const toolExecutionResult = await this.llmClient.executeToolCallsWithRecovery(
              limitedToolCalls,
              this.mcpClient,
              this.logger,
              task.description,
              this.collectedRawPrompts
            );

            _toolResults = toolExecutionResult.allToolResults || [];
            _toolCalls = toolExecutionResult.allToolCalls || [];

            // Notify about any new tool calls that were generated during execution
            if (_toolCalls.length > originalToolCallCount) {
              const newToolCalls = _toolCalls.slice(originalToolCallCount);
              newToolCalls.forEach(toolCall => {
                this.callbacks.onToolCall(toolCall);
              });
            }

            // Notify about tool results - ensure both result and tool call exist
            for (let i = 0; i < Math.min(_toolResults.length, _toolCalls.length); i++) {
              const result = _toolResults[i];
              const correspondingToolCall = _toolCalls[i];

              if (result && correspondingToolCall) {
                this.callbacks.onToolResult(correspondingToolCall, result);
              }
            }

            console.log(`🔧 Tool execution completed: ${_toolResults.length} results`);

            // Try fast fact extraction first
            const fastFacts = await this.fastOptimizer.extractKeyFacts(
              _toolResults,
              task.description
            );
            if (fastFacts !== null) {
              console.log(`⚡ Using fast fact extraction: ${fastFacts.facts.length} facts`);
              facts = fastFacts.facts;
            } else {
              console.log(`🐌 Using fallback fact extraction`);
              facts = this.extractFactsFromToolResults(_toolResults, task);
            }
          } catch (toolError) {
            console.error("Tool execution failed:", toolError);
          }
        }

        return TaskExecution.fromJSON({
          toolCalls: _toolCalls,
          toolResults: _toolResults,
          facts,
          taskCompleted: true,
        });
      }
    } catch (error) {
      console.error(`Failed to execute task: ${task.description}`, error);
      return TaskExecution.fromJSON({
        toolCalls: [],
        toolResults: [],
        facts: [`Task execution failed: ${error.message}`],
        taskCompleted: false,
      });
    }
  }

  async generateFinalResponse(initialResponse = "") {
    this.callbacks.onStatusChange("📝 Generating final response");
    console.log("📝 Generating final response");

    // Check if we have formatted content
    const formattedContent = this.extractFormattedContent();

    if (formattedContent) {
      // Generate human-like explanation alongside formatted content
      return await this.generateCombinedResponse(formattedContent, initialResponse);
    } else {
      // No formatted content, proceed with regular final response
      return await this.generateRegularFinalResponse(initialResponse);
    }
  }

  async shouldReplan(executedTask, taskExecution) {
    // Don't replan if budget is exhausted
    if (this.replanCount >= this.maxReplans) {
      console.log(
        `🚫 Skipping replan check - budget exhausted (${this.replanCount}/${this.maxReplans})`
      );
      return false;
    }

    this.callbacks.onStatusChange(`🔄 Checking if replan is needed for task`);

    // Try fast optimization first
    const fastResult = await this.fastOptimizer.shouldReplan(
      executedTask,
      taskExecution,
      this.gatheredFacts,
      this.taskQueue,
      this.replanCount,
      this.maxReplans
    );

    if (fastResult !== null) {
      console.log(`⚡ Using fast shouldReplan decision: ${fastResult.needsReplan}`);
      return fastResult.needsReplan;
    }

    // Fallback to main LLM
    console.log(`🐌 Falling back to main LLM for shouldReplan decision`);
    const replanPrompt = generateShouldReplanPrompt(
      executedTask,
      taskExecution,
      this.gatheredFacts,
      this.taskQueue,
      this.replanCount,
      this.maxReplans
    );

    try {
      const messages = [{ role: "user", content: replanPrompt }];
      const response = await this.callLLM(messages, [], {
        timeout: 30000,
      });

      const replanText = this.llmClient.extractTextResponse(response);
      const replanData = this.llmClient.extractJSONFromResponse(replanText, {
        needsReplan: false,
        reasoning: "No need to replan at this time",
      });

      return replanData.needsReplan;
    } catch (error) {
      console.error("Failed to determine if replan is needed:", error);
      return false; // Default to no replan on error
    }
  }

  async replanTasks(executedTask, taskExecution) {
    this.callbacks.onStatusChange(`🔄 Replanning tasks after execution`);
    console.log(`🔄 Replanning tasks after execution of: ${executedTask.description}`);
    const replanPrompt = generateReplanPrompt(
      this.message,
      this.gatheredFacts,
      executedTask,
      taskExecution,
      this.taskQueue,
      this.tools
    );

    try {
      const messages = [{ role: "user", content: replanPrompt }];
      const response = await this.callLLM(messages, [], {
        timeout: 30000,
      });

      const replanText = this.llmClient.extractTextResponse(response);
      const replanData = this.llmClient.extractJSONFromResponse(replanText, {
        tasks: [],
        response: "No new tasks generated",
      });

      const updatedPlan = InitialPlan.fromJSON(replanData);

      // Enforce task limits on replanned tasks
      const newTasks = updatedPlan.tasks || [];
      const remainingTaskBudget = this.maxTasks - this.totalTasksCreated;

      if (newTasks.length > remainingTaskBudget) {
        console.warn(
          `⚠️ Replan generated ${newTasks.length} tasks, limiting to remaining budget: ${remainingTaskBudget}`
        );
        updatedPlan.tasks = newTasks.slice(0, remainingTaskBudget);
      }

      this.totalTasksCreated += updatedPlan.tasks.length;
      console.log(
        `📋 Replan generated ${updatedPlan.tasks.length} tasks (total created: ${this.totalTasksCreated}/${this.maxTasks})`
      );

      return updatedPlan;
    } catch (error) {
      console.error("Failed to replan tasks:", error);
      return new InitialPlan({
        understanding: "Replan failed",
        contextAnalysis: "Unable to generate new tasks due to error",
        tasks: [],
        response: "No new tasks generated due to error",
      });
    }
  }

  async callLLM(messages, tools = [], options = {}) {
    let response;

    if (this.stream) {
      // Use streaming if callbacks are available
      response = await this.llmClient.callProviderAPIStreaming(
        messages,
        tools,
        options,
        this.callbacks
      );
    } else {
      // Use regular API call if no callbacks
      response = await this.llmClient.callProviderAPI(messages, tools, options);
    }

    // Log if logger is available
    if (this.logger) {
      const rawPromptData = await this.llmClient.createRawPromptData(messages, tools, response);
      await this.logger.logRawPrompt(rawPromptData);
      this.collectedRawPrompts.push(rawPromptData);
    }

    return response;
  }

  buildPreviousResultsContext() {
    if (!this.allToolResults || this.allToolResults.length === 0) {
      return "No previous tool results available.";
    }

    const contextSections = [];
    const resultsByTool = {};

    this.allToolResults.forEach(result => {
      const toolName = result.tool_name || "unknown";
      if (!resultsByTool[toolName]) {
        resultsByTool[toolName] = [];
      }
      resultsByTool[toolName].push(result);
    });

    Object.entries(resultsByTool).forEach(([toolName, results]) => {
      const successfulResults = results.filter(r => !r.is_error);

      if (successfulResults.length > 0) {
        contextSections.push(`**${toolName}** (${successfulResults.length} results):`);

        successfulResults.forEach((result, index) => {
          const content = result.content.substring(0, 15000);
          contextSections.push(
            `  ${index + 1}. ${content}${result.content.length > 15000 ? "..." : ""}`
          );
        });
      }
    });

    if (contextSections.length === 0) {
      return "Previous tool executions completed but no successful results to reference.";
    }

    return contextSections.join("\n");
  }

  extractFactsFromToolResults(toolResults, task) {
    const facts = [];

    toolResults.forEach(result => {
      if (result.content && !result.is_error) {
        const content = result.content.toString();

        if (result.tool_name === "search_memories") {
          facts.push(`Memory search revealed: ${content.substring(0, 2000)}...`);
        } else if (result.tool_name === "db_query") {
          facts.push(`Database query result: ${content.substring(0, 2000)}...`);
        } else if (result.tool_name === "graph_export") {
          facts.push(`Schema information gathered from graph export`);
        } else if (result.tool_name === "execute_task") {
          facts.push(`Task execution completed: ${content.substring(0, 2000)}...`);
        } else {
          facts.push(`${result.tool_name} provided: ${content.substring(0, 2000)}...`);
        }
      }
    });

    if (facts.length === 0) {
      facts.push(`Completed task: ${task.description}`);
    }

    return facts;
  }

  extractFormattedContent() {
    const formattedTools = [
      "markdown_table",
      "vega_lite_diagram",
      "mermaid_diagram",
      "markdown_action_item",
    ];

    // Collect all formatted content (not just the latest)
    const formattedResults = this.allToolResults.filter(
      result => formattedTools.includes(result.tool_name) && !result.is_error
    );

    return formattedResults.length > 0 ? formattedResults : null;
  }

  async generateCombinedResponse(formattedResults, initialResponse) {
    console.log("📊 Generating combined response with formatted content");

    // Create context for LLM to generate human-like explanation
    const explanationPrompt = generateExplanationForFormattedContentPrompt(
      this.message,
      this.gatheredFacts,
      this.buildFormattedContentSummary(formattedResults),
      initialResponse
    );

    try {
      const messages = [{ role: "user", content: explanationPrompt }];
      const response = await this.callLLM(messages, [], { timeout: 30000 });

      const humanExplanation = response.text || "Here's the information you requested:";

      // Combine human explanation with formatted content
      return this.combineResponseWithFormattedContent(humanExplanation, formattedResults);
    } catch (error) {
      console.error("Failed to generate explanation for formatted content:", error);

      // Fallback: simple explanation + formatted content
      const fallbackExplanation = `Based on your request, I've generated the following ${formattedResults[0].tool_name.replace(
        "_",
        " "
      )}:`;
      return this.combineResponseWithFormattedContent(fallbackExplanation, formattedResults);
    }
  }

  async generateRegularFinalResponse(initialResponse) {
    const finalResponsePrompt = generateFinalResponsePrompt(
      this.message,
      this.gatheredFacts,
      this.allToolResults,
      initialResponse
    );

    try {
      const messages = [{ role: "user", content: finalResponsePrompt }];
      const response = await this.callLLM(messages, [], { timeout: 30000 });
      return response.text || "No response generated";
    } catch (error) {
      console.error("Failed to generate final response:", error);
      // Don't apologize for user-initiated cancellation
      return error.message === "Operation cancelled by user"
        ? "Operation cancelled by user. You can start a new request when ready."
        : "I apologize, but I encountered an error generating the final response.";
    }
  }

  buildFormattedContentSummary(formattedResults) {
    return formattedResults
      .map(result => {
        const contentPreview = result.content.substring(0, 200);
        return `${result.tool_name}: ${contentPreview}${result.content.length > 200 ? "..." : ""}`;
      })
      .join("\n");
  }

  combineResponseWithFormattedContent(humanExplanation, formattedResults) {
    // Start with human explanation
    let combinedResponse = humanExplanation.trim();

    // Add formatted content for each result
    formattedResults.forEach((result, index) => {
      // Add separator between explanation and formatted content
      if (index === 0) {
        combinedResponse += "\n\n";
      }

      // Add a subtle header if there are multiple formatted results
      if (formattedResults.length > 1) {
        const toolDisplayName = getToolDisplayName(result.tool_name);
        combinedResponse += `**${toolDisplayName}:**\n`;
      }

      // Add the formatted content
      combinedResponse += result.content;

      // Add spacing between multiple formatted results
      if (index < formattedResults.length - 1) {
        combinedResponse += "\n\n";
      }
    });

    return combinedResponse;
  }

  async createKnowledgeGraph(question, response) {
    console.log("🧠 Creating knowledge graph from Q&A interaction");

    try {
      const nodes = [];
      const edges = [];

      // Initialize ID tracking for interconnections
      this.generatedKnowledgeIds = {};

      // Use LLM to extract valuable knowledge concepts only
      await this.extractKnowledgeConcepts(question, response, nodes, edges);

      const knowledgeGraph = { nodes, edges };

      // Write knowledge graph to temp directory
      const questionId = `question_${this.generateContentHash(question)}`;
      await this.writeKnowledgeGraphToTemp(knowledgeGraph, questionId);

      return knowledgeGraph;
    } catch (error) {
      console.error("Failed to create knowledge graph:", error);
      return { nodes: [], edges: [] };
    }
  }

  generateContentHash(content) {
    // Simple hash function for content-based IDs
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async extractKnowledgeConcepts(question, response, nodes, edges) {
    console.log("🧐 Extracting knowledge concepts using LLM analysis");

    try {
      const toolResultsSummary = this.allToolResults
        .filter(result => !result.is_error)
        .map(result => `${result.tool_name}: ${result.content.substring(0, 500)}`)
        .join("\n");

      // Create comprehensive prompt for knowledge extraction
      const knowledgeExtractionPrompt = this.generateKnowledgeExtractionPrompt(
        question,
        response,
        null, // Schema context is now in system prompt
        toolResultsSummary
      );

      const messages = [{ role: "user", content: knowledgeExtractionPrompt }];
      const llmResponse = await this.callLLM(messages, [], { timeout: 30000 });

      const analysisText = this.llmClient.extractTextResponse(llmResponse);
      const knowledgeData = this.llmClient.extractJSONFromResponse(analysisText, {
        knowledge_concepts: [],
      });

      // Process knowledge concepts identified by LLM
      if (knowledgeData.knowledge_concepts) {
        knowledgeData.knowledge_concepts.forEach(concept => {
          this.createKnowledgeNode(concept, nodes, edges);
        });

        // Create interconnections between knowledge nodes after all are created
        const schemaContext = this.context.getSchemaContext();
        await this.createKnowledgeInterconnections(
          knowledgeData.knowledge_concepts,
          nodes,
          edges,
          schemaContext
        );
      }

      console.log(
        `🧐 Created ${
          knowledgeData.knowledge_concepts?.length || 0
        } knowledge concepts with interconnections`
      );
    } catch (error) {
      console.error("Failed to extract knowledge concepts:", error);
    }
  }

  generateKnowledgeExtractionPrompt(question, response, _schemaContext, toolResults) {
    return `Extract valuable knowledge concepts from this Q&A interaction. Focus on:
1. Business insights, decisions, or conclusions
2. Technical findings or discoveries
3. Data patterns or relationships uncovered
4. Process insights or methodologies
5. Key facts or learnings that could be useful for future questions

QUESTION: ${question}

RESPONSE: ${response}

TOOL RESULTS:
${toolResults}

DATABASE SCHEMA (for connecting concepts to actual schema entities):
Schema context is now available in the system prompt.

IMPORTANT: When identifying schema connections, use the EXACT entity and property IDs from the schema above.

Extract ONLY valuable knowledge concepts that represent genuine insights, findings, or learnings. Avoid generic statements or obvious facts.

Return JSON with this structure:
{
  "knowledge_concepts": [
    {
      "concept_name": "descriptive-name-for-concept",
      "knowledge_data": "The actual insight, finding, or knowledge learned",
      "confidence": 0.1-1.0,
      "category": "business_insight|technical_finding|data_pattern|process_insight|key_fact",
      "related_schema_entities": ["exact_schema_node_id_1", "exact_schema_node_id_2"],
      "reasoning": "why this is valuable knowledge worth preserving and how it relates to the schema entities"
    }
  ]
}

**CRITICAL**: For related_schema_entities, use ONLY the exact IDs from the schema provided above (e.g., "contacts", "contacts.company_id", "_aden_gl_accounts.balance"). Do not make up entity names.

Be selective - only include concepts that provide genuine value for future reference.`;
  }

  createKnowledgeNode(concept, nodes, edges) {
    const {
      concept_name,
      knowledge_data,
      confidence,
      category,
      related_schema_entities,
      reasoning,
    } = concept;

    if (!concept_name || !knowledge_data || confidence < 0.6) {
      return; // Skip low-confidence or incomplete concepts
    }

    // Convert concept_name to machine-friendly format
    const machineFriendlyName = concept_name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

    // Generate random ID component
    const randomId = Math.random().toString(36).substring(2, 8);
    const knowledgeId = `K:${machineFriendlyName}-${randomId}`;
    const timestamp = new Date().toISOString();

    // Store the generated ID for interconnection lookup
    if (!this.generatedKnowledgeIds) {
      this.generatedKnowledgeIds = {};
    }
    this.generatedKnowledgeIds[machineFriendlyName] = knowledgeId;

    // Create knowledge node with proper formatting
    nodes.push({
      id: knowledgeId,
      kind: "Knowledge",
      data: knowledge_data,
      category: category,
      confidence: confidence,
      reasoning: reasoning,
      timestamp: timestamp,
    });

    // Connect to related schema entities if specified
    if (related_schema_entities && Array.isArray(related_schema_entities)) {
      related_schema_entities.forEach(entityId => {
        if (entityId && entityId.trim()) {
          edges.push({
            from: knowledgeId,
            to: entityId,
            label: "RELATES_TO_SCHEMA",
            score: confidence * 0.8,
            timestamp: timestamp,
          });
        }
      });
    }

    console.log(
      `🔗 Created knowledge node ${knowledgeId} connected to ${
        related_schema_entities?.length || 0
      } schema entities`
    );
  }

  async writeKnowledgeGraphToTemp(knowledgeGraph, questionId) {
    // Non-blocking knowledge graph logging
    if (process.env.DEBUG_MODE === "true") {
      setImmediate(async () => {
        try {
          const fs = await import("fs");
          const path = await import("path");
          const tempDir = path.join(process.cwd(), "src", "reference", "temp");
          await fs.promises.mkdir(tempDir, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `knowledge_graph_${questionId}_${timestamp}.json`;
          const filepath = path.join(tempDir, filename);
          await fs.promises.writeFile(filepath, JSON.stringify(knowledgeGraph, null, 2), "utf8");
        } catch (error) {
          // Silently fail - debug logging should not break execution
        }
      });
    }
  }
}

const endpointUrl = process.env.HF_API_ENDPOINT; // Replace with your endpoint URL
const hfToken = process.env.HF_API_TOKEN; // Replace with your Hugging Face token

async function callEndpoint(prompt) {
  const yes_prompt = {
    inputs: [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content:
          "yes, The transcript and tool calls have enough context to answer user's question very clearly",
      },
    ],
  };
  const no_prompt = {
    inputs: [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: "no, The transcript and tool calls are not sufficient to answer user's question",
      },
    ],
  };
  const yes_response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(yes_prompt),
  });

  const no_response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(no_prompt),
  });

  const yes_result = await yes_response.json();
  const no_result = await no_response.json();

  // Defensive: check for expected structure
  const yesScore =
    Array.isArray(yes_result) && yes_result.length > 0 && typeof yes_result[0].score === "number"
      ? yes_result[0].score
      : null;
  const noScore =
    Array.isArray(no_result) && no_result.length > 0 && typeof no_result[0].score === "number"
      ? no_result[0].score
      : null;

  if (yesScore === null || noScore === null) {
    return { error: "Unexpected response from endpoint", yes_result, no_result };
  }

  console.log("callEndpoint scores:", { yesScore, noScore });

  if (noScore > yesScore) {
    console.log("callEndpoint decision: ASK_CLARIFICATION");
    return {
      action: "ASK_CLARIFICATION",
      confidence: 0.3,
      reasoning: "question is not clear",
      questions: ["question is not clear"],
    };
  } else if (yesScore - noScore < 15) {
    console.log("callEndpoint decision: EXECUTE_TASKS");
    return {
      action: "EXECUTE_TASKS",
      confidence: 0.5,
      reasoning: "EXECUTE_TASKS",
    };
  } else {
    console.log("callEndpoint decision: GENERATE_ANSWER");
    return {
      action: "GENERATE_ANSWER",
      confidence: 0.8,
      reasoning: "it's clear",
    };
  }
}
