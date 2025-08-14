import { BaseAgent } from "./base-agent.js";
import { PlannerAgent } from "./planner-agent.js";
import { ExecutorAgent } from "./executor-agent.js";
import { AnalyzerAgent } from "./analyzer-agent.js";
import { DataOnboardingAgent } from "./data-onboarding-agent.js";
import { AgentContext } from "./agent-context.js";
import { ExecutionResult } from "../decision-executor/models.js";

/**
 * CoordinatorAgent - Orchestrates the multi-agent workflow
 * Manages agent transitions, context handoffs, and overall execution flow
 */
export class CoordinatorAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);
    this.agentType = "CoordinatorAgent";
    this.agents = new Map();
    this.maxAgentTransitions = config.maxAgentTransitions || 10;
  }

  /**
   * Initialize the coordinator with agent instances
   */
  initialize(context) {
    super.initialize(context);

    // Create specialized agents
    this.agents.set(
      "planner",
      new PlannerAgent({
        logger: this.logger,
        performanceLogger: this.performanceLogger,
      })
    );
    this.agents.set(
      "executor",
      new ExecutorAgent({
        logger: this.logger,
        performanceLogger: this.performanceLogger,
      })
    );
    this.agents.set(
      "analyzer",
      new AnalyzerAgent({
        logger: this.logger,
        performanceLogger: this.performanceLogger,
      })
    );
    this.agents.set(
      "data_onboarding",
      new DataOnboardingAgent({
        logger: this.logger,
        performanceLogger: this.performanceLogger,
      })
    );

    // Initialize all agents with context
    this.agents.forEach(agent => agent.initialize(context));

    this.debug("CoordinatorAgent initialized with all specialized agents");
  }

  /**
   * System prompt for coordinator (minimal since it orchestrates others)
   */
  getSystemPrompt() {
    return `You are the CoordinatorAgent, responsible for orchestrating multi-agent workflows.
    
Your role is to:
1. Manage transitions between specialized agents
2. Ensure proper context handoffs between agents
3. Monitor execution flow and handle errors
4. Make decisions about which agent should execute next
5. Aggregate results from all agents into final responses

You primarily coordinate other agents rather than execute tasks directly.`;
  }

  /**
   * Coordinator has limited direct tools - primarily uses other agents
   */
  getAvailableTools() {
    return [
      { name: "think_sequentially", description: "Structured analysis for coordination decisions" },
    ];
  }

  /**
   * Execute the multi-agent workflow
   * @param {Object} input - Coordination input
   * @returns {Object} Final execution result
   */
  async execute(input) {
    const stageId = this.startPerformanceTracking("coordination", {
      message_length: input.message?.length || 0,
      max_transitions: this.maxAgentTransitions,
    });

    // Move transitionCount outside try block so it's accessible in catch
    let transitionCount = 0;

    try {
      this.debug("Starting multi-agent coordination");

      // Check for cancellation at the start
      if (this.context.llmClient && this.context.llmClient.isOperationCancelled()) {
        this.debug('🛑 Multi-agent coordination cancelled before starting');
        throw new Error('Operation cancelled by user');
      }

      if (!this.validateInput(input)) {
        throw new Error("Invalid input for coordination");
      }

      // Initialize execution flow
      const message = input.message || this.context.originalMessage;
      let currentPhase = "planning";
      // transitionCount is now defined outside try block
      let finalResult = null;

      this.context.setExecutionPhase(currentPhase);
      this.debug(`Starting execution flow with message: "${message.substring(0, 100)}..."`);

      // Multi-agent execution loop
      while (currentPhase !== "complete" && transitionCount < this.maxAgentTransitions) {
        // Check for cancellation before each phase
        if (this.context.llmClient && this.context.llmClient.isOperationCancelled()) {
          this.debug('🛑 Multi-agent execution cancelled by user');
          throw new Error('Operation cancelled by user');
        }

        transitionCount++;
        this.debug(`Transition ${transitionCount}: Entering ${currentPhase} phase`);

        try {
          const phaseResult = await this.executePhase(currentPhase, message);
          const nextPhase = this.determineNextPhase(currentPhase, phaseResult);

          this.debug(`Phase ${currentPhase} completed, next phase: ${nextPhase}`);

          // Stream agent decision about next phase
          if (this.context.callbacks?.onAgentDecision) {
            this.context.callbacks.onAgentDecision({
              process: "coordination",
              stage: "phase_decision",
              agent: "CoordinatorAgent",
              decision: `${currentPhase} phase complete, transitioning to ${nextPhase}`,
              reasoning: this.getPhaseTransitionReasoning(currentPhase, nextPhase, phaseResult),
              context: {
                currentPhase,
                nextPhase,
                transitionNumber: transitionCount,
              },
            });
          }

          if (nextPhase === "complete") {
            finalResult = phaseResult;
            break;
          } else if (nextPhase === "clarification") {
            // Special case: need user clarification
            finalResult = this.createClarificationResult(phaseResult);
            break;
          }

          // Stream agent transition before switching phases
          if (this.context.callbacks?.onAgentTransition) {
            this.context.callbacks.onAgentTransition({
              process: "coordination",
              stage: "agent_transition",
              fromAgent: this.getAgentForPhase(currentPhase),
              toAgent: this.getAgentForPhase(nextPhase),
              reason: `Completed ${currentPhase}, moving to ${nextPhase}`,
              transitionNumber: transitionCount,
            });
          }

          currentPhase = nextPhase;
          this.context.setExecutionPhase(currentPhase);
        } catch (phaseError) {
          this.debug(`Phase ${currentPhase} failed:`, phaseError.message);

          // Try to recover or fail gracefully
          const recoveryResult = await this.handlePhaseError(currentPhase, phaseError, message);
          if (recoveryResult) {
            finalResult = recoveryResult;
            break;
          } else {
            throw phaseError;
          }
        }
      }

      // Check for max transitions reached
      if (transitionCount >= this.maxAgentTransitions && !finalResult) {
        this.debug(
          `Max transitions reached (${this.maxAgentTransitions}), creating fallback result`
        );
        finalResult = await this.createFallbackResult(message);
      }

      // Ensure we have a final result
      if (!finalResult) {
        throw new Error("No final result generated from multi-agent execution");
      }

      // Create comprehensive execution result
      const executionResult = this.createExecutionResult(finalResult, transitionCount);

      this.endPerformanceTracking(stageId, {
        transitions_completed: transitionCount,
        final_phase: currentPhase,
        success: true,
        response_length: executionResult.response?.length || 0,
      });

      this.debug(`Multi-agent coordination completed in ${transitionCount} transitions`);
      return executionResult;
    } catch (error) {
      this.endPerformanceTracking(stageId, {
        error: error.message,
        transitions_completed: transitionCount,
      });
      this.debug("Multi-agent coordination failed:", error.message);
      throw error;
    }
  }

  /**
   * Execute a specific phase with the appropriate agent
   * Optimized to support parallel execution where possible
   */
  async executePhase(phase, message) {
    this.context.callbacks?.onStatusChange?.(`🤖 Executing ${phase} phase`);

    switch (phase) {
      case "planning":
        return await this.executePlanningPhase(message);

      case "execution":
        return await this.executeExecutionPhase();

      case "data_onboarding":
        return await this.executeDataOnboardingPhase(message);

      case "analysis":
        return await this.executeAnalysisPhase();
        
      case "parallel_execution":
        // New phase for parallel tool execution
        return await this.executeParallelPhase();

      default:
        throw new Error(`Unknown execution phase: ${phase}`);
    }
  }
  
  /**
   * Execute multiple independent tasks in parallel
   * Significantly reduces latency for multi-tool operations
   */
  async executeParallelPhase() {
    const plan = this.context.getSharedData("initialPlan");
    if (!plan || !plan.tasks) {
      return await this.executeExecutionPhase(); // Fallback to sequential
    }

    // Group tasks by dependencies
    const taskGroups = this.groupTasksByDependencies(plan.tasks);
    const executionResults = {
      completedTasks: [],
      failedTasks: [],
      toolCallsExecuted: [],
      toolResultsCollected: [],
      factsGathered: [],
    };

    // Execute each dependency group in sequence, but tasks within groups in parallel
    for (const group of taskGroups) {
      this.debug(`Executing ${group.length} tasks in parallel`);
      
      const groupPromises = group.map(async (task) => {
        try {
          const executorAgent = this.agents.get("executor");
          if (!executorAgent) return null;
          
          // Execute task independently
          const result = await executorAgent.executeTask(task);
          return { task, result, success: true };
        } catch (error) {
          this.debug(`Task ${task.id} failed: ${error.message}`);
          return { task, error, success: false };
        }
      });

      // Wait for all tasks in group to complete
      const groupResults = await Promise.all(groupPromises);
      
      // Aggregate results
      groupResults.forEach(({ task, result, success }) => {
        if (success && result) {
          executionResults.completedTasks.push({ task, result });
          if (result.toolCalls) executionResults.toolCallsExecuted.push(...result.toolCalls);
          if (result.toolResults) executionResults.toolResultsCollected.push(...result.toolResults);
          if (result.facts) executionResults.factsGathered.push(...result.facts);
        } else {
          executionResults.failedTasks.push(task);
        }
      });
    }

    this.context.setSharedData("executionResults", executionResults);
    
    // Log final file creation summary after parallel task execution
    if (this.context) {
      const cachedFiles = this.context.getAllCachedFiles();
      const projectSummary = this.context.getProjectStructureSummary();
      
      this.debug(`📊 Final Project Summary after parallel execution:`);
      this.debug(`  - Files tracked: ${projectSummary.fileCount}`);
      this.debug(`  - Files cached with content: ${cachedFiles.size}`);
      this.debug(`  - Directories: ${projectSummary.directoryCount}`);
      
      if (cachedFiles.size > 0) {
        this.debug(`📚 All cached file contents:`);
        for (const [path, content] of cachedFiles) {
          this.debug(`  📄 ${path}: ${content ? content.length : 0} chars`);
        }
      }
      
      // Check for import issues
      const importIssues = this.context.verifyImports();
      if (importIssues.length > 0) {
        this.debug(`⚠️ Import verification found ${importIssues.length} issues:`);
        importIssues.forEach(issue => {
          this.debug(`  - ${issue.file}: ${issue.issue}`);
        });
      } else {
        this.debug(`✅ All imports verified successfully`);
      }
    }
    
    return executionResults;
  }

  /**
   * Group tasks by dependency levels for parallel execution
   */
  groupTasksByDependencies(tasks) {
    const groups = [];
    const executed = new Set();
    
    while (executed.size < tasks.length) {
      const currentGroup = tasks.filter(task => {
        if (executed.has(task.id)) return false;
        
        // Check if all dependencies are executed
        const deps = task.dependencies || [];
        return deps.every(dep => executed.has(dep));
      });
      
      if (currentGroup.length === 0) {
        // Circular dependency or error - execute remaining sequentially
        const remaining = tasks.filter(t => !executed.has(t.id));
        if (remaining.length > 0) {
          groups.push(remaining.slice(0, 1));
          executed.add(remaining[0].id);
        }
      } else {
        groups.push(currentGroup);
        currentGroup.forEach(task => executed.add(task.id));
      }
    }
    
    return groups;
  }

  /**
   * Get the agent name responsible for a given phase
   */
  getAgentForPhase(phase) {
    switch (phase) {
      case "planning":
        return "PlannerAgent";
      case "execution":
      case "parallel_execution":
        return "ExecutorAgent";
      case "data_onboarding":
        return "DataOnboardingAgent";
      case "analysis":
        return "AnalyzerAgent";
      case "complete":
        return "CoordinatorAgent";
      case "clarification":
        return "CoordinatorAgent";
      default:
        return "UnknownAgent";
    }
  }

  /**
   * Get reasoning for phase transitions
   */
  getPhaseTransitionReasoning(currentPhase, nextPhase, phaseResult) {
    if (nextPhase === "complete") {
      return "All phases completed successfully, final response ready";
    }

    if (nextPhase === "clarification") {
      return "User clarification needed before proceeding";
    }

    switch (`${currentPhase}->${nextPhase}`) {
      case "planning->execution":
        return "Plan generated successfully, proceeding to task execution";
      case "planning->data_onboarding":
        return "Data onboarding tasks detected in plan";
      case "execution->analysis":
        return "Task execution completed, analyzing results";
      case "data_onboarding->analysis":
        return "Data onboarding completed, analyzing results";
      default:
        return `Phase transition from ${currentPhase} to ${nextPhase}`;
    }
  }

  /**
   * Check if we should replan after execution based on results
   */
  shouldReplanAfterExecution(executionResult) {
    if (!executionResult) return false;

    const completedTasks = executionResult.completedTasks?.length || 0;
    const failedTasks = executionResult.failedTasks?.length || 0;
    const totalTasks = completedTasks + failedTasks;

    if (totalTasks === 0) return false;

    // If more than 60% of tasks failed, we should replan
    const failureRate = failedTasks / totalTasks;
    if (failureRate > 0.6) {
      this.debug(
        `High failure rate detected: ${(failureRate * 100).toFixed(1)}% - replanning needed`
      );
      return true;
    }

    // Check if we have any meaningful data gathered
    const toolResults = executionResult.toolResultsCollected || [];
    const meaningfulResults = toolResults.filter(result => {
      if (result.is_error) return false;
      if (result.tool_name === "db_query" && this.isEmptyDatabaseResult(result)) return false;
      return true;
    });

    if (meaningfulResults.length === 0 && toolResults.length > 0) {
      this.debug("No meaningful data gathered from any tool calls - replanning needed");
      return true;
    }

    return false;
  }

  /**
   * Check if a database result is empty (updated for clean JSON format)
   */
  isEmptyDatabaseResult(result) {
    if (result.tool_name !== "db_query") return false;

    const content = result.content;
    if (!content) return true;

    // Extract text from MCP result format: [{"type":"text","text":"..."}]
    let actualText = "";
    if (Array.isArray(content) && content.length > 0 && content[0].type === "text") {
      actualText = content[0].text;
    } else if (typeof content === "string") {
      actualText = content;
    } else {
      actualText = JSON.stringify(content);
    }

    const trimmed = actualText.trim();
    if (trimmed === "" || trimmed === "[]" || trimmed === "{}" || trimmed === "null") return true;

    // Try to parse as clean JSON (new format)
    try {
      const parsed = JSON.parse(trimmed);

      // Check for new clean format with isEmpty and recordCount
      if (typeof parsed === "object" && parsed !== null) {
        if (parsed.hasOwnProperty("isEmpty") && parsed.hasOwnProperty("recordCount")) {
          return parsed.isEmpty === true || parsed.recordCount === 0;
        }
      }
    } catch (parseError) {
      // Fall back to text-based detection
    }

    // FALLBACK: Text-based detection for backward compatibility
    if (trimmed.includes("Record Count: 0") || trimmed.includes("Is Empty: true")) {
      return true;
    }

    // Check for NULL results in SQL queries
    if (
      trimmed.includes("sum: NULL") ||
      trimmed.includes("count: 0") ||
      trimmed.includes("Found 0 record")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Execute planning phase
   */
  async executePlanningPhase(message) {
    const plannerAgent = this.agents.get("planner");
    if (!plannerAgent) {
      throw new Error("PlannerAgent not available");
    }

    this.context.setCurrentAgent(plannerAgent);

    // Check if this is a replanning attempt due to execution failure
    const executionFailureReason = this.context.getSharedData("executionFailureReason");
    const previousExecutionResults = this.context.getSharedData("executionResults");

    const planningInput = {
      message: message,
      context: null,
      schemaContext: this.context.getSchemaContext(),
      isReplanning: !!executionFailureReason,
      failureReason: executionFailureReason,
      previousResults: previousExecutionResults,
    };

    const planningResult = await plannerAgent.execute(planningInput);

    this.debug(`Planning phase completed: ${planningResult.tasks?.length || 0} tasks generated`);
    return planningResult;
  }

  /**
   * Execute execution phase
   */
  async executeExecutionPhase() {
    const executorAgent = this.agents.get("executor");
    if (!executorAgent) {
      throw new Error("ExecutorAgent not available");
    }

    const plan = this.context.getSharedData("initialPlan");
    if (!plan) {
      throw new Error("No plan available for execution");
    }

    this.context.setCurrentAgent(executorAgent);

    const executionInput = {
      plan: plan,
      originalMessage: this.context.originalMessage,
      context: this.context,
    };

    const executionResult = await executorAgent.execute(executionInput);

    this.debug(
      `Execution phase completed: ${executionResult.completedTasks?.length || 0} tasks executed`
    );
    return executionResult;
  }

  /**
   * Execute data onboarding phase
   */
  async executeDataOnboardingPhase(message) {
    const dataOnboardingAgent = this.agents.get("data_onboarding");
    if (!dataOnboardingAgent) {
      throw new Error("DataOnboardingAgent not available");
    }

    this.context.setCurrentAgent(dataOnboardingAgent);

    // Simply pass the entire message to the onboarding agent
    // Let the agent handle the data extraction and processing
    const dataSource = this.context.originalMessage || message;
    console.log("📊 Data onboarding phase - passing data directly to agent");

    const onboardingResult = await dataOnboardingAgent.execute(dataSource);

    this.debug(
      `Data onboarding phase completed: ${
        Object.keys(onboardingResult.columnMappings || {}).length
      } file mappings created`
    );
    return onboardingResult;
  }

  /**
   * Execute analysis phase
   */
  async executeAnalysisPhase() {
    const analyzerAgent = this.agents.get("analyzer");
    if (!analyzerAgent) {
      throw new Error("AnalyzerAgent not available");
    }

    const executionResults = this.context.getSharedData("executionResults");
    const dataOnboardingResults = this.context.getSharedData("dataOnboardingResults");
    const originalPlan = this.context.getSharedData("initialPlan");

    // Check if we have either execution results or data onboarding results
    if (!executionResults && !dataOnboardingResults) {
      throw new Error("No execution or data onboarding results available for analysis");
    }

    this.context.setCurrentAgent(analyzerAgent);

    const analysisInput = {
      executionResults: executionResults,
      dataOnboardingResults: dataOnboardingResults,
      originalPlan: originalPlan,
      originalMessage: this.context.originalMessage,
    };

    const analysisResult = await analyzerAgent.execute(analysisInput);

    this.debug(
      `Analysis phase completed: response generated (${
        analysisResult.finalResponse?.length || 0
      } chars)`
    );
    return analysisResult;
  }

  /**
   * Determine the next phase based on current phase and results
   */
  determineNextPhase(currentPhase, phaseResult) {
    switch (currentPhase) {
      case "planning":
        if (phaseResult.needsClarification) {
          return "clarification";
        }

        // Check if this is a data onboarding request
        if (this.isDataOnboardingRequest(phaseResult)) {
          return "data_onboarding";
        }

        if (!phaseResult.tasks || phaseResult.tasks.length === 0) {
          return "analysis"; // Skip execution if no tasks
        }
        
        // Use parallel execution for multiple independent tasks
        if (phaseResult.tasks.length > 1 && this.hasIndependentTasks(phaseResult.tasks)) {
          return "parallel_execution";
        }
        return "execution";

      case "execution":
      case "parallel_execution":
        // Check if execution was successful or needs replanning
        if (this.shouldReplanAfterExecution(phaseResult)) {
          this.debug("Execution gathered insufficient data - triggering replanning");
          this.replanCount = (this.replanCount || 0) + 1;

          if (this.replanCount >= this.context.maxReplans) {
            this.debug("Max replanning attempts reached - proceeding to analysis");
            return "analysis";
          }

          // Update shared context with failure information for better replanning
          this.context.setSharedData(
            "executionFailureReason",
            "Most tasks failed to gather meaningful data"
          );
          return "planning"; // Go back to planning with failure context
        }
        return "analysis";

      case "data_onboarding":
        return "analysis"; // Always proceed to analysis after data onboarding

      case "analysis":
        return "complete";

      default:
        return "complete";
    }
  }

  /**
   * Handle phase execution errors
   */
  async handlePhaseError(phase, error, message) {
    this.debug(`Attempting error recovery for phase: ${phase}`);

    try {
      switch (phase) {
        case "planning":
          // Fallback to simple execution without detailed planning
          return await this.createSimpleFallbackPlan(message);

        case "execution":
          // Try to analyze whatever partial results we have
          const partialResults = this.context.getSharedData("executionResults") || {
            completedTasks: [],
            failedTasks: [],
            toolCallsExecuted: [],
            toolResultsCollected: [],
            factsGathered: [],
          };
          this.context.setSharedData("executionResults", partialResults);
          return null; // Continue to analysis phase

        case "analysis":
          // Create a basic response acknowledging the error
          return await this.createErrorRecoveryResponse(error, message);

        default:
          return null;
      }
    } catch (recoveryError) {
      this.debug(`Error recovery failed: ${recoveryError.message}`);
      return null;
    }
  }

  /**
   * Create a clarification result when user input is needed
   */
  createClarificationResult(planningResult) {
    return {
      type: "clarification",
      response: this.formatClarificationQuestions(planningResult.clarificationQuestions),
      needsClarification: true,
      clarificationQuestions: planningResult.clarificationQuestions,
      partialPlan: planningResult,
    };
  }

  /**
   * Create fallback result when max transitions reached
   */
  async createFallbackResult(message) {
    this.debug("Creating fallback result due to max transitions");

    // Try to use whatever results we have
    const executionResults = this.context.getSharedData("executionResults");
    const plan = this.context.getSharedData("initialPlan");

    if (executionResults && executionResults.toolResultsCollected?.length > 0) {
      // We have some execution results, try basic analysis
      const fallbackResponse = this.createBasicAnalysis(executionResults, message);
      return {
        type: "analysis",
        finalResponse: fallbackResponse,
        analysisMetadata: {
          fallback: true,
          reason: "max_transitions_reached",
        },
      };
    } else if (plan) {
      // We have a plan but no execution, return plan summary
      return {
        type: "planning",
        finalResponse: `I've analyzed your request and created a plan with ${
          plan.tasks?.length || 0
        } tasks, but wasn't able to complete execution within the allowed processing time. Would you like me to proceed with the execution?`,
        partialPlan: plan,
      };
    } else {
      // Minimal fallback
      return {
        type: "fallback",
        finalResponse: `I understand you're asking about: "${message}". However, I encountered processing limitations and wasn't able to complete the full analysis. Could you please rephrase your request or break it down into smaller parts?`,
      };
    }
  }

  /**
   * Create comprehensive execution result
   */
  createExecutionResult(finalResult, transitionCount) {
    const executionResults = this.context.getSharedData("executionResults") || {};
    const analysisResults = this.context.getSharedData("analysisResults") || {};
    const dataOnboardingResults = this.context.getSharedData("dataOnboardingResults") || null;

    return new ExecutionResult({
      response: finalResult.finalResponse || finalResult.response || "No response generated",
      rawPrompts: this.context.collectedRawPrompts,
      toolCalls: this.context.allToolCalls,
      toolResults: this.context.allToolResults,
      knowledgeGraph: {}, // Could be enhanced with knowledge graph data
      dataOnboardingResults: dataOnboardingResults, // Include data onboarding results
      metadata: {
        multiAgent: true,
        agentTransitions: transitionCount,
        agentChain: this.context.agentChain,
        executionPhase: this.context.executionPhase,
        finalResultType: finalResult.type,
        hasFormattedContent: analysisResults.hasFormattedContent || false,
        completedTasks: executionResults.completedTasks?.length || 0,
        totalToolCalls: this.context.allToolCalls.length,
        totalFacts: this.context.gatheredFacts.length,
        hasDataOnboardingResults: !!dataOnboardingResults,
      },
    });
  }

  /**
   * Format clarification questions for user
   */
  formatClarificationQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      return "I need some clarification to better assist you. Could you provide more specific details about what you're looking for?";
    }

    let response = "I need some clarification to provide the best assistance:\n\n";
    questions.forEach((question, index) => {
      response += `${index + 1}. ${question}\n`;
    });
    response +=
      "\nPlease help me understand these aspects so I can provide more targeted assistance.";

    return response;
  }

  /**
   * Create simple fallback plan when planning fails
   */
  async createSimpleFallbackPlan(message) {
    const fallbackPlan = {
      understanding: "Simple request processing",
      contextAnalysis: "Using fallback planning due to planning phase error",
      tasks: [
        {
          id: "fallback_task",
          description: "Process user request with available tools",
          toolsRequired: ["db_query"],
          priority: "high",
          dependencies: [],
          expectedOutcome: "Address user request as best as possible",
        },
      ],
      needsClarification: false,
      recommendedNextAgent: "executor",
    };

    this.context.setSharedData("initialPlan", fallbackPlan);
    return fallbackPlan;
  }

  /**
   * Create error recovery response
   */
  async createErrorRecoveryResponse(error, message) {
    const executionResults = this.context.getSharedData("executionResults");
    const hasPartialResults =
      executionResults &&
      (executionResults.completedTasks?.length > 0 ||
        executionResults.toolResultsCollected?.length > 0);

    let response = `I encountered an issue while processing your request: "${message}"\n\n`;

    if (hasPartialResults) {
      response += `However, I was able to gather some information:\n`;

      if (executionResults.completedTasks?.length > 0) {
        response += `- Completed ${executionResults.completedTasks.length} tasks successfully\n`;
      }

      if (executionResults.factsGathered?.length > 0) {
        response += `- Gathered ${executionResults.factsGathered.length} pieces of information\n`;
        response += `\nKey findings:\n`;
        executionResults.factsGathered.slice(0, 3).forEach(fact => {
          response += `• ${fact}\n`;
        });
      }

      response += `\nWould you like me to try a different approach or focus on a specific aspect?`;
    } else {
      response += `I wasn't able to gather sufficient information to provide a complete answer. This could be due to:\n`;
      response += `• Temporary connectivity issues\n`;
      response += `• Insufficient permissions for required data sources\n`;
      response += `• The request requiring clarification\n\n`;
      response += `Please try rephrasing your question or breaking it into smaller parts.`;
    }

    return {
      type: "error_recovery",
      finalResponse: response,
      error: error.message,
      hasPartialResults,
    };
  }

  /**
   * Create basic analysis from available results
   */
  createBasicAnalysis(executionResults, message) {
    let response = `Based on your request: "${message}"\n\n`;

    if (executionResults.completedTasks?.length > 0) {
      response += `**Completed Analysis:**\n`;
      response += `I successfully executed ${executionResults.completedTasks.length} analysis tasks.\n\n`;
    }

    if (executionResults.factsGathered?.length > 0) {
      response += `**Key Findings:**\n`;
      executionResults.factsGathered.slice(0, 5).forEach(fact => {
        response += `• ${fact}\n`;
      });
      response += `\n`;
    }

    if (executionResults.toolResultsCollected?.length > 0) {
      const successfulResults = executionResults.toolResultsCollected.filter(r => !r.is_error);
      response += `**Data Sources Accessed:** ${successfulResults.length} successful queries\n\n`;
    }

    response += `This analysis was generated from available data sources. For more detailed insights, please let me know if you'd like to explore any specific aspect further.`;

    return response;
  }

  /**
   * Check if the request is for data onboarding
   */
  isDataOnboardingRequest(planningResult) {
    // Check if the planning result indicates data onboarding tasks
    if (planningResult.taskType === "data_onboarding") {
      return true;
    }

    // Check if the original message is a structured onboarding object
    const originalMessage = this.context.originalMessage;
    if (typeof originalMessage === "object" && originalMessage !== null) {
      // Check for file onboarding structure
      if (originalMessage.file && originalMessage.parsing && originalMessage.analysis) {
        console.log("📂 Detected structured data onboarding request");
        return true;
      }
    }

    // Check for data onboarding keywords in the original message
    const message =
      typeof originalMessage === "string"
        ? originalMessage.toLowerCase()
        : JSON.stringify(originalMessage).toLowerCase();

    const onboardingKeywords = ["##onboard this file##"];

    return onboardingKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Check if tasks have any that can be executed in parallel
   */
  hasIndependentTasks(tasks) {
    if (!tasks || tasks.length <= 1) return false;
    
    // Check if there are tasks without dependencies
    const independentTasks = tasks.filter(task => 
      !task.dependencies || task.dependencies.length === 0
    );
    
    // Also check if we have multiple dependency levels (parallel groups)
    const dependencyGroups = this.groupTasksByDependencies(tasks);
    const hasMultipleGroups = dependencyGroups.length > 1;
    const hasParallelTasksInGroups = dependencyGroups.some(group => group.length > 1);
    
    // We can parallelize if we have:
    // 1. Multiple independent tasks, OR
    // 2. Groups with multiple tasks each, OR  
    // 3. Multiple dependency levels with opportunities for parallelization
    const canParallelize = independentTasks.length > 1 || hasParallelTasksInGroups || hasMultipleGroups;
    
    if (canParallelize) {
      this.debug(`Parallel execution enabled: ${independentTasks.length} independent tasks, ${dependencyGroups.length} dependency groups`);
    }
    
    return canParallelize;
  }

  /**
   * Validate coordination input
   */
  validateInput(input) {
    return input && typeof input === "object" && (input.message || this.context?.originalMessage);
  }
}
