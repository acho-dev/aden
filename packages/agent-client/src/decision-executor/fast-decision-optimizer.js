import { LLMFactory } from "../llm/llm-factory.js";
import { performance } from "perf_hooks";
import { getPerformanceLogger } from "../performance-logger.js";

/**
 * Fast Decision Optimizer - Uses Groq for quick classification tasks
 * Optimizes shouldReplan, performGapAnalysis, and other simple decisions
 * Now with circuit breaker pattern for better fault tolerance
 */
export class FastDecisionOptimizer {
  constructor(options = {}) {
    this.groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY;
    this.fallbackToMainLLM = options.fallbackToMainLLM !== false; // Default true
    this.fastLLM = null;
    this.enabled = !!this.groqApiKey;
    this.sessionId = options.sessionId;

    // Circuit breaker configuration
    this.circuitBreaker = {
      state: 'closed', // closed, open, half-open
      failureCount: 0,
      successCount: 0,
      failureThreshold: 3, // Open circuit after 3 consecutive failures
      successThreshold: 2, // Close circuit after 2 consecutive successes in half-open
      timeout: 30000, // 30 seconds before trying half-open
      lastFailureTime: null,
      nextRetryTime: null,
    };

    // Performance tracking
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      fallbackCalls: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
      operationCounts: {
        shouldReplan: 0,
        gapAnalysis: 0,
        factExtraction: 0,
        taskCompletion: 0,
        questionQuality: 0,
      },
    };

    if (!this.enabled) {
      console.warn("⚡ FastDecisionOptimizer disabled - no GROQ_API_KEY provided");
    }
  }

  async initialize() {
    if (!this.enabled) {
      console.warn("⚡ FastDecisionOptimizer: GROQ_API_KEY not found, staying disabled");
      return;
    }

    console.log(
      `⚡ FastDecisionOptimizer: Attempting to initialize with API key: ${this.groqApiKey.substring(
        0,
        8
      )}...`
    );

    try {
      this.fastLLM = await LLMFactory.create(
        "groq",
        {
          model: "llama-3.3-70b-versatile", // Use updated fast model
          temperature: 0.1,
          maxTokens: 1500,
        },
        {
          apiKey: this.groqApiKey,
        }
      );

      console.log("⚡ FastDecisionOptimizer initialized successfully with Groq");

      // Test the connection
      const testResult = await this.fastLLM.binaryDecision("Is this a test?", "", {
        timeout: 3000,
      });
      console.log(`⚡ FastDecisionOptimizer test result: ${testResult}`);
    } catch (error) {
      console.error(`⚡ FastDecisionOptimizer initialization failed: ${error.message}`);
      console.error(`⚡ Stack trace:`, error.stack);
      this.enabled = false;
    }
  }

  /**
   * Check if circuit breaker allows request
   */
  canMakeRequest() {
    const cb = this.circuitBreaker;
    
    if (cb.state === 'closed') {
      return true;
    }
    
    if (cb.state === 'open') {
      // Check if we should try half-open
      if (Date.now() >= cb.nextRetryTime) {
        cb.state = 'half-open';
        cb.successCount = 0;
        console.log('⚡ Circuit breaker transitioning to half-open');
        return true;
      }
      console.log(`⚡ Circuit breaker OPEN - skipping request (retry in ${Math.round((cb.nextRetryTime - Date.now()) / 1000)}s)`);
      return false;
    }
    
    if (cb.state === 'half-open') {
      return true;
    }
    
    return false;
  }
  
  /**
   * Record successful request
   */
  recordSuccess() {
    const cb = this.circuitBreaker;
    cb.failureCount = 0;
    
    if (cb.state === 'half-open') {
      cb.successCount++;
      if (cb.successCount >= cb.successThreshold) {
        cb.state = 'closed';
        console.log('⚡ Circuit breaker CLOSED - service recovered');
      }
    }
  }
  
  /**
   * Record failed request
   */
  recordFailure() {
    const cb = this.circuitBreaker;
    cb.successCount = 0;
    cb.failureCount++;
    cb.lastFailureTime = Date.now();
    
    if (cb.state === 'half-open') {
      // Immediately open on failure in half-open state
      cb.state = 'open';
      cb.nextRetryTime = Date.now() + cb.timeout;
      console.log('⚡ Circuit breaker OPEN - half-open test failed');
    } else if (cb.failureCount >= cb.failureThreshold) {
      cb.state = 'open';
      cb.nextRetryTime = Date.now() + cb.timeout;
      console.log(`⚡ Circuit breaker OPEN - ${cb.failureCount} consecutive failures`);
    }
  }

  /**
   * Fast shouldReplan decision - replaces slow LLM call with binary decision
   */
  async shouldReplan(
    executedTask,
    taskExecution,
    gatheredFacts,
    taskQueue,
    replanCount,
    maxReplans
  ) {
    console.log(
      `⚡ FastDecisionOptimizer.shouldReplan called - enabled: ${this.enabled}, fastLLM: ${!!this
        .fastLLM}, circuit: ${this.circuitBreaker.state}`
    );

    if (!this.enabled) {
      console.log(`⚡ FastDecisionOptimizer disabled, returning null`);
      return null; // Fallback to main LLM
    }

    if (!this.fastLLM) {
      console.log(`⚡ FastDecisionOptimizer: fastLLM not initialized, returning null`);
      return null;
    }
    
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      console.log(`⚡ Circuit breaker preventing request - falling back to main LLM`);
      this.trackOperation("shouldReplan", performance.now(), false);
      return null;
    }

    const prompt = `Task executed: "${executedTask.description}"

Results:
- Tool calls made: ${taskExecution.toolCalls?.length || 0}
- Facts gathered: ${taskExecution.facts?.length || 0}
- Task completed: ${taskExecution.taskCompleted}

Current situation:
- Remaining tasks: ${taskQueue.length}
- Replan count: ${replanCount}/${maxReplans}
- Total facts gathered: ${gatheredFacts.length}

Should we replan the remaining tasks based on what we learned from executing this task?

Consider replanning if:
- Task execution revealed unexpected information that changes the approach
- Current task queue is no longer optimal given new facts
- Task failed or produced unexpected results

Do NOT replan if:
- Task executed successfully as expected  
- No significant new information was discovered
- Remaining tasks are still appropriate
- Already replanned too many times

Should replan?`;

    // Single attempt with circuit breaker (no retries)
    const startTime = performance.now();

    try {
      const needsReplan = await this.fastLLM.binaryDecision(prompt, "", {
        timeout: 2000, // Reduced timeout for fast fail
      });

      console.log(`⚡ Fast shouldReplan decision: ${needsReplan} (Groq)`);
      this.trackOperation("shouldReplan", startTime, true);
      this.recordSuccess();
      return { needsReplan, source: "groq-fast" };
    } catch (error) {
      console.warn(`⚡ Fast shouldReplan failed: ${error.message}`);
      this.recordFailure();
      this.trackOperation("shouldReplan", startTime, false);
      return null; // Fallback to main LLM
    }
  }

  /**
   * Fast gap analysis - classifies into ASK_CLARIFICATION, EXECUTE_TASKS, or GENERATE_ANSWER
   */
  async performGapAnalysis(
    message,
    currentTask,
    taskQueue,
    gatheredFacts,
    conversationHistory,
    tools,
    schemaContext,
    memoryContext
  ) {
    if (!this.enabled) return null; // Fallback to main LLM

    // Skip first task to avoid complexity
    if (!currentTask || gatheredFacts.length === 0) {
      return {
        action: "EXECUTE_TASKS",
        confidence: 1.0,
        reasoning: "First task - executing directly",
        source: "groq-fast",
      };
    }

    const categories = ["ASK_CLARIFICATION", "EXECUTE_TASKS", "GENERATE_ANSWER"];

    const prompt = `User request: "${message}"

Current situation:
- Current task: ${currentTask?.description || "None"}
- Remaining tasks: ${taskQueue.length}
- Facts gathered: ${gatheredFacts.length}
- Tools available: ${tools.length}
- Has schema context: ${schemaContext ? "Yes" : "No"}
- Has memory context: ${memoryContext ? "Yes" : "No"}

Recent facts:
${gatheredFacts
  .slice(-3)
  .map((fact, i) => `${i + 1}. ${fact.substring(0, 100)}...`)
  .join("\n")}

Determine the next action:

ASK_CLARIFICATION - if the user request is unclear or ambiguous and we need more information
EXECUTE_TASKS - if we should continue executing tasks to gather more information  
GENERATE_ANSWER - if we have sufficient information to provide a final answer

What action should we take?`;

    const startTime = performance.now();
    
    try {
      const action = await this.fastLLM.classify(prompt, categories, "", { timeout: 5000 });

      const confidence =
        action === "GENERATE_ANSWER" ? 0.8 : action === "EXECUTE_TASKS" ? 0.7 : 0.6;

      const result = {
        action,
        confidence,
        reasoning: `Fast classification via Groq: ${action}`,
        source: "groq-fast",
      };

      console.log(`⚡ Fast gap analysis: ${action} (Groq)`);
      this.trackOperation("gapAnalysis", startTime, true);
      return result;
    } catch (error) {
      console.warn(`⚡ Fast gap analysis failed: ${error.message}`);
      this.trackOperation("gapAnalysis", startTime, false);
      return null; // Fallback to main LLM
    }
  }

  /**
   * Fast task completion check - determines if a task was completed successfully
   */
  async isTaskCompleted(task, toolResults, facts) {
    if (!this.enabled) return null;

    const prompt = `Task: "${task.description}"

Execution results:
- Tool results: ${toolResults.length}
- Facts gathered: ${facts.length}
- Any errors: ${toolResults.some(r => r.is_error) ? "Yes" : "No"}

Tool results summary:
${toolResults
  .slice(0, 3)
  .map(
    (result, i) =>
      `${i + 1}. ${result.tool_name}: ${
        result.is_error ? "ERROR" : "SUCCESS"
      } - ${result.content.substring(0, 100)}...`
  )
  .join("\n")}

Was this task completed successfully?`;

    const startTime = performance.now();
    
    try {
      const completed = await this.fastLLM.binaryDecision(prompt, "", { timeout: 3000 });
      console.log(`⚡ Fast task completion check: ${completed} (Groq)`);
      this.trackOperation("taskCompletion", startTime, true);
      return { taskCompleted: completed, source: "groq-fast" };
    } catch (error) {
      console.warn(`⚡ Fast task completion check failed: ${error.message}`);
      this.trackOperation("taskCompletion", startTime, false);
      return null;
    }
  }

  /**
   * Fast fact extraction from tool results
   */
  async extractKeyFacts(toolResults, taskDescription, maxFacts = 3) {
    if (!this.enabled || toolResults.length === 0) return null;

    const schema = {
      facts: ["string", "string", "string"], // Array of key facts
    };

    const prompt = `Task: "${taskDescription}"

Tool results:
${toolResults
  .slice(0, 5)
  .map(
    (result, i) =>
      `${result.tool_name}: ${result.is_error ? "ERROR" : result.content.substring(0, 300)}...`
  )
  .join("\n\n")}

Extract the ${maxFacts} most important facts or insights learned from these tool results. Focus on:
- Key data discoveries
- Important patterns or relationships
- Business insights
- Technical findings
- Actionable information

Return as JSON with facts array.`;

    const startTime = performance.now();
    
    try {
      const result = await this.fastLLM.extractJSON(prompt, schema, "", { timeout: 8000 });

      if (result.facts && Array.isArray(result.facts)) {
        console.log(`⚡ Fast fact extraction: ${result.facts.length} facts (Groq)`);
        this.trackOperation("factExtraction", startTime, true);
        return {
          facts: result.facts.filter(f => f && f.length > 10), // Filter out short/empty facts
          source: "groq-fast",
        };
      }

      this.trackOperation("factExtraction", startTime, false);
      return null;
    } catch (error) {
      console.warn(`⚡ Fast fact extraction failed: ${error.message}`);
      this.trackOperation("factExtraction", startTime, false);
      return null;
    }
  }

  /**
   * Fast question quality assessment - determines if a user question is clear and actionable
   */
  async assessQuestionQuality(question, context = "") {
    if (!this.enabled) return null;

    const categories = ["CLEAR", "NEEDS_CLARIFICATION", "TOO_VAGUE"];

    const prompt = `User question: "${question}"

${context ? `Context: ${context}` : ""}

Assess the quality and clarity of this question:

CLEAR - question is specific, actionable, and can be answered directly
NEEDS_CLARIFICATION - question is somewhat unclear but potentially answerable with more info
TOO_VAGUE - question is too broad, ambiguous, or lacks necessary context

What is the quality assessment?`;

    const startTime = performance.now();
    
    try {
      const quality = await this.fastLLM.classify(prompt, categories, "", { timeout: 3000 });
      console.log(`⚡ Fast question quality: ${quality} (Groq)`);
      this.trackOperation("questionQuality", startTime, true);
      return { quality, source: "groq-fast" };
    } catch (error) {
      console.warn(`⚡ Fast question quality assessment failed: ${error.message}`);
      this.trackOperation("questionQuality", startTime, false);
      return null;
    }
  }

  /**
   * Track performance metrics for an operation
   */
  trackOperation(operationType, startTime, success) {
    const responseTime = performance.now() - startTime;

    this.stats.totalCalls++;
    this.stats.totalResponseTime += responseTime;
    this.stats.avgResponseTime = this.stats.totalResponseTime / this.stats.totalCalls;

    if (success) {
      this.stats.successfulCalls++;
      
      // Estimate time saved vs main LLM (typically 2-5 seconds)
      const estimatedMainLLMTime = operationType === 'shouldReplan' ? 3000 : 
                                   operationType === 'gapAnalysis' ? 4000 : 2500;
      const timeSaved = Math.max(0, estimatedMainLLMTime - responseTime);
      
      // Record in performance logger if available
      const performanceLogger = getPerformanceLogger(this.sessionId);
      if (performanceLogger) {
        performanceLogger.recordFastDecision(timeSaved);
      }
    } else {
      this.stats.fallbackCalls++;
    }

    if (this.stats.operationCounts[operationType] !== undefined) {
      this.stats.operationCounts[operationType]++;
    }
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    const successRate =
      this.stats.totalCalls > 0 ? (this.stats.successfulCalls / this.stats.totalCalls) * 100 : 0;

    const fallbackRate =
      this.stats.totalCalls > 0 ? (this.stats.fallbackCalls / this.stats.totalCalls) * 100 : 0;

    return {
      enabled: this.enabled,
      provider: "groq",
      model: this.fastLLM?.models?.binary || "llama-3.3-70b-versatile",
      features: [
        "shouldReplan",
        "gapAnalysis",
        "taskCompletion",
        "factExtraction",
        "questionQuality",
      ],
      performance: {
        totalCalls: this.stats.totalCalls,
        successRate: successRate.toFixed(1) + "%",
        fallbackRate: fallbackRate.toFixed(1) + "%",
        avgResponseTime: this.stats.avgResponseTime.toFixed(2) + "ms",
        operationBreakdown: this.stats.operationCounts,
      },
    };
  }
}

/**
 * Create a singleton instance for easy access
 */
let instance = null;

export function createFastDecisionOptimizer(options = {}) {
  if (!instance) {
    instance = new FastDecisionOptimizer(options);
  } else if (options.sessionId) {
    // Update session ID for new sessions
    instance.sessionId = options.sessionId;
  }
  return instance;
}

export function getFastDecisionOptimizer() {
  return instance;
}
