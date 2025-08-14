import { BaseAgent } from "./base-agent.js";
import { GoalAwareTaskGenerator } from "./goal-aware-task-generator.js";

/**
 * ExecutorAgent - Specialized agent for tool execution and data gathering
 * Focuses on executing tasks, calling tools, and collecting information
 */
export class ExecutorAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);
    this.agentType = "ExecutorAgent";
    this.maxRetries = 3;
    this.currentTaskIndex = 0;
    this.goalAwareTaskGenerator = null; // Will be initialized with context
  }

  /**
   * Initialize the executor agent with context
   */
  initialize(context) {
    super.initialize(context);
    // Initialize the goal-aware task generator with context
    this.goalAwareTaskGenerator = new GoalAwareTaskGenerator(context);
    this.debug("Goal-aware task generator initialized");
  }

  /**
   * Get system prompt specific to execution tasks
   */
  getSystemPrompt() {
    const schemaContext = this.context?.getSchemaContext();
    const ragContext = this.context?.getRagContext();
    
    console.log(`🧠 ExecutorAgent schema context: ${schemaContext ? `${schemaContext.length} chars` : 'none'}`);
    console.log(`📚 ExecutorAgent RAG context: ${ragContext ? `${ragContext.length} chars` : 'none'}`);
    
    const schemaSection = schemaContext
      ? `\n\nDATA SCHEMA CONTEXT:\nDatabase schema is available for queries:\n${schemaContext}\n`
      : "";

    const ragSection = ragContext
      ? `\n\nRAG KNOWLEDGE CONTEXT:\nRelevant information from knowledge base:\n${ragContext}\n`
      : "";

    return `You are the ExecutorAgent, specialized in executing tasks and gathering data through tool calls.

CRITICAL: You MUST use tools to complete tasks. Do not provide text-only responses.

Your role is to:
1. Execute tasks systematically according to the provided plan
2. Make intelligent tool calls to gather required information
3. Handle errors and implement retry logic when needed
4. Collect and organize results for further analysis
5. Generate intelligent follow-up queries based on initial results

TOOL USAGE REQUIREMENTS:
- ALWAYS use tools to complete tasks - never provide text-only responses
- For ANY business data request (revenue, sales, customers, deals, etc.), IMMEDIATELY use db_query
- NEVER say "cannot find data" without first attempting db_query with schema context
- For creating charts/graphs, use vega_lite_diagram tool
- For creating process diagrams, use mermaid_diagram tool  
- For formatting data tables, use markdown_table tool
- For creating action items, use markdown_action_item tool
- For file operations, use read_file, write_file, list_directory, execute_command tools
- When asked to create code/scripts/files, ALWAYS use write_file to actually write the content
- When asked to read existing code, use read_file to examine the actual files
- When asked to run code/tests/commands, use execute_command to actually execute them
- Make multiple tool calls if needed to complete the task fully

FILE OPERATION REQUIREMENTS - EXECUTABLE CODE FOCUS:
- NEVER just describe what code should be written - ALWAYS use write_file to create actual files
- CRITICAL: Do NOT use shell brace expansion like {css,js,images} in file paths - create each file separately!
- WRONG: "public/{css,js,images}/file.ext" - this creates a directory literally named "{css,js,images}"
- RIGHT: Create "public/css/file.css", "public/js/file.js", "public/images/file.png" as separate write_file calls
- Create proper directory structure by writing files with their full paths (directories are auto-created)
- EVERY file creation MUST be immediately followed by verification (syntax check, compilation test)
- After writing code files, ALWAYS use execute_command to verify they work:
  * Syntax check: "node -c filename.js" or "tsc --noEmit filename.ts" 
  * Dependency check: verify imports work and dependencies are installed
  * Runtime test: execute the code with sample inputs to ensure it runs
- When implementing features, follow this pattern: write → verify → test → fix if needed
- Use read_file to examine existing code and understand patterns before creating new files
- Use list_directory to explore project structure and find the right location for new files
- Use execute_command for: dependency installation, running tests, builds, linting, and execution verification
- If any verification fails, immediately read the error output and fix the code

CRITICAL DB_QUERY USAGE:
- Database schema is preloaded - use it to write specific SQL queries
- Business queries should ALWAYS result in db_query tool calls
- Use actual table names from schema context (like _aden_deals, _aden_companies)
- If one query fails, try alternative approaches using different tables/joins

EXECUTION EXPERTISE:
- Systematic task execution following dependencies
- Intelligent tool selection and parameter optimization
- Error handling and recovery strategies
- Data gathering and fact extraction
- Progressive information building

EXECUTION PRINCIPLES:
- Follow task dependencies and execution order strictly
- Use appropriate tools for each data gathering requirement
- Implement robust error handling and retries
- Extract meaningful facts from tool results
- Generate intelligent follow-up queries when needed
- Maintain execution state and progress tracking

CONTEXT AVAILABLE:
- Database schema is preloaded and available for SQL queries
- Memory context from previous conversations is preloaded
- Previous execution results are available for context

AVAILABLE EXECUTION TOOLS:
- rag_query: Query indexed documents and knowledge base for relevant information
- db_query: Execute SQL queries using preloaded schema context
- think_sequentially: Structured analysis for complex scenarios
- mermaid_diagram: Create process and structural diagrams
- vega_lite_diagram: Create data visualization charts
- markdown_table: Format data in organized tables
- markdown_action_item: Create structured task lists
- remember: Store important findings and decisions

${schemaSection}${ragSection}

Focus on thorough execution, intelligent tool usage, and comprehensive data gathering.`;
  }

  /**
   * Tools available specifically to the executor agent
   * Includes parameter schemas to help LLM generate proper tool calls
   */
  getAvailableTools() {
    return [
      { 
        name: "rag_query", 
        description: "Query indexed documents and knowledge base",
        parameters: {
          query: { type: "string", description: "Search query for documents" }
        }
      },
      { 
        name: "db_query", 
        description: "Execute database queries using preloaded schema",
        parameters: {
          query: { type: "string", description: "SQL query to execute using actual table names from schema" },
          params: { type: "array", description: "Query parameters (optional)" },
          limit: { type: "number", description: "Result limit (optional)" }
        }
      },
      { 
        name: "think_sequentially", 
        description: "Structured analysis",
        parameters: {
          problem: { type: "string", description: "Problem or scenario to analyze" }
        }
      },
      { 
        name: "mermaid_diagram", 
        description: "Create structural diagrams",
        parameters: {
          definition: { type: "string", description: "Mermaid diagram definition" },
          title: { type: "string", description: "Diagram title (optional)" }
        }
      },
      { 
        name: "vega_lite_diagram", 
        description: "Create data charts",
        parameters: {
          specification: { type: "string", description: "Vega-Lite specification JSON" },
          title: { type: "string", description: "Chart title (optional)" }
        }
      },
      { 
        name: "markdown_table", 
        description: "Format data tables",
        parameters: {
          headers: { type: "array", description: "Table headers" },
          rows: { type: "array", description: "Table rows" },
          title: { type: "string", description: "Table title (optional)" }
        }
      },
      { 
        name: "markdown_action_item", 
        description: "Create task lists",
        parameters: {
          items: { type: "array", description: "List of action items" },
          title: { type: "string", description: "List title (optional)" }
        }
      },
      { 
        name: "remember", 
        description: "Store important information",
        parameters: {
          content: { type: "string", description: "Information to remember" },
          category: { type: "string", description: "Category of information" }
        }
      },
      { 
        name: "read_file", 
        description: "Read contents of files from the filesystem",
        parameters: {
          path: { type: "string", description: "The file path to read" }
        }
      },
      { 
        name: "write_file", 
        description: "Write content to files on the filesystem",
        parameters: {
          path: { type: "string", description: "The file path to write to" },
          content: { type: "string", description: "The content to write to the file" }
        }
      },
      { 
        name: "execute_command", 
        description: "Execute safe development commands",
        parameters: {
          command: { type: "string", description: "The shell command to execute" },
          workingDirectory: { type: "string", description: "Working directory for the command (optional)" }
        }
      },
      { 
        name: "list_directory", 
        description: "List contents of directories",
        parameters: {
          path: { type: "string", description: "The directory path to list" }
        }
      },
    ];
  }

  /**
   * Execute tasks according to the plan
   * @param {Object} input - Execution input containing tasks and context
   * @returns {Object} Execution results
   */
  async execute(input) {
    const stageId = this.startPerformanceTracking("execution", {
      tasks_count: input.tasks?.length || 0,
      has_plan: !!input.plan,
    });

    try {
      this.debug("Starting task execution");
      
      // 🦆 Let the ducky see the initial state before execution
      if (this.context && this.context.seeTheWorld) {
        this.debug('🦆 Little ducky checking initial workspace state...');
        try {
          const initialState = await this.context.seeTheWorld('.');
          if (initialState) {
            this.debug(`🦆 Starting with: ${initialState.files.length} files, ${initialState.directories.length} directories`);
            
            // Set the workspace if we can determine it
            if (this.context.sessionId && !this.context.sessionWorkspace) {
              const projectRoot = '/home/timothy/aden/aden-mcp';
              const workspace = `${projectRoot}/sessions/${this.context.sessionId}`;
              this.context.setSessionWorkspace(workspace);
              this.debug(`🦆 Set workspace to: ${workspace}`);
            }
          }
        } catch (error) {
          this.debug(`🦆 Little ducky couldn't check initial state: ${error.message}`);
        }
      } else {
        this.debug('⚠️ No ducky context available for seeing the world');
      }

      // Check for cancellation at the start
      if (this.context.llmClient && this.context.llmClient.isOperationCancelled()) {
        this.debug('🛑 Task execution cancelled before starting');
        throw new Error('Operation cancelled by user');
      }

      if (!this.validateInput(input)) {
        throw new Error("Invalid input for execution");
      }

      const plan = input.plan || this.context.getSharedData("initialPlan");
      if (!plan || !plan.tasks || plan.tasks.length === 0) {
        throw new Error("No tasks available for execution");
      }

      // Initialize execution state
      this.currentTaskIndex = 0;
      const executionResults = {
        completedTasks: [],
        failedTasks: [],
        toolCallsExecuted: [],
        toolResultsCollected: [],
        factsGathered: [],
        executionSummary: {},
      };

      // Execute tasks in dependency order
      const orderedTasks = this.orderTasksByDependencies(plan.tasks);
      this.debug(`Executing ${orderedTasks.length} tasks in dependency order`);

      for (const task of orderedTasks) {
        // Check for cancellation before each task
        if (this.context.llmClient && this.context.llmClient.isOperationCancelled()) {
          this.debug('🛑 Task execution cancelled between tasks');
          throw new Error('Operation cancelled by user');
        }

        if (!this.context.shouldContinueExecution()) {
          this.debug("Execution stopped - max iterations reached");
          break;
        }

        try {
          this.context.callbacks?.onStatusChange?.(`🔄 Executing: ${task.description}`);
          
          // Stream detailed task execution start
          if (this.context.callbacks?.onTaskExecutionStart) {
            this.context.callbacks.onTaskExecutionStart({
              process: "execution",
              stage: "task_execution",
              taskId: task.id,
              description: task.description,
              toolsRequired: task.toolsRequired || [],
              priority: task.priority,
              taskNumber: index + 1,
              totalTasks: sortedTasks.length
            });
          }
          
          const taskResult = await this.executeTask(task);

          // Let the little ducky see what was actually created in its own workspace!
          if (this.context && this.context.seeTheWorld && taskResult.toolCalls?.some(tc => tc.name === 'write_file')) {
            this.debug('🦆 Little ducky checking what was actually created in session workspace...');
            try {
              const currentState = await this.context.seeTheWorld('.');
              if (currentState) {
                this.debug(`🦆 Workspace now has: ${currentState.files.length} files, ${currentState.directories.length} directories`);
                
                // Track any new files that were created
                for (const file of currentState.files) {
                  if (!this.context.projectStructure.files.includes(file)) {
                    this.debug(`🦆 New file discovered: ${file}`);
                  }
                }
              }
            } catch (error) {
              this.debug(`🦆 Ducky vision error: ${error.message}`);
            }
          }

          // Check if the task actually gathered meaningful data
          const hasGatheredData = this.taskHasGatheredMeaningfulData(taskResult);
          
          // Log file creation paths for debugging
          const fileInfo = this.validateFileCreationPaths(taskResult);
          if (fileInfo.length > 0) {
            this.debug(`📁 Files created in task ${task.id}:`);
            fileInfo.forEach(info => this.debug(`   - ${info}`));
          }

          if (hasGatheredData) {
            executionResults.completedTasks.push({
              task,
              result: taskResult,
              timestamp: new Date().toISOString(),
            });
            
            // Update shared context with completed tasks for goal-aware generation
            const allCompletedTasks = this.context?.getSharedData('completedTasks') || [];
            allCompletedTasks.push({ task, result: taskResult });
            this.context?.setSharedData('completedTasks', allCompletedTasks);
            
            // DYNAMIC TASK GENERATION: Check if task results indicate missing dependencies
            const dynamicTasks = await this.generateDynamicTasks(task, taskResult, orderedTasks);
            if (dynamicTasks.length > 0) {
              this.debug(`🔄 Generated ${dynamicTasks.length} dynamic tasks from ${task.id}:`);
              dynamicTasks.forEach(dt => this.debug(`   - ${dt.description}`));
              
              // Add new tasks to the execution queue 
              orderedTasks.push(...dynamicTasks);
              
              // Update execution tracking
              if (this.context.callbacks?.onDynamicTasksGenerated) {
                this.context.callbacks.onDynamicTasksGenerated({
                  parentTask: task.id,
                  newTasks: dynamicTasks,
                  totalTasks: orderedTasks.length
                });
              }
            }
            
            // Stream task completion with results
            if (this.context.callbacks?.onTaskExecutionComplete) {
              this.context.callbacks.onTaskExecutionComplete({
                process: "execution",
                stage: "task_completion",
                taskId: task.id,
                success: true,
                hasData: true,
                toolCallsCount: taskResult.toolCalls?.length || 0,
                factsGathered: taskResult.factsGathered?.length || 0,
                summary: taskResult.summary || "Task completed successfully"
              });
            }
          } else {
            // Task executed but gathered no meaningful data - treat as failure
            this.debug(
              `❌ Task ${task.id} executed but gathered no meaningful data - marking as failed`
            );
            this.debug(`   Tool calls made: ${taskResult.toolCalls?.length || 0}`);
            this.debug(`   Tool results: ${taskResult.toolResults?.length || 0}`);
            this.debug(
              `   Empty results: ${
                taskResult.toolResults?.filter(
                  r => r.tool_name === "db_query" && this.isEmptyDatabaseResult(r.content)
                ).length || 0
              }`
            );

            executionResults.failedTasks.push({
              task,
              error: "No meaningful data gathered",
              result: taskResult,
              timestamp: new Date().toISOString(),
            });
          }

          // Collect results
          if (taskResult.toolCalls) {
            executionResults.toolCallsExecuted.push(...taskResult.toolCalls);
            this.context.addToolCalls(taskResult.toolCalls);
          }

          if (taskResult.toolResults) {
            executionResults.toolResultsCollected.push(...taskResult.toolResults);
            this.context.addToolResults(taskResult.toolResults);
          }

          if (taskResult.facts) {
            executionResults.factsGathered.push(...taskResult.facts);
            this.context.addFacts(taskResult.facts);
          }

          this.debug(`Task completed: ${task.id}`);
        } catch (taskError) {
          this.debug(`Task failed: ${task.id} - ${taskError.message}`);
          executionResults.failedTasks.push({
            task,
            error: taskError.message,
            timestamp: new Date().toISOString(),
          });
        }

        this.currentTaskIndex++;
      }

      // Generate intelligent follow-up queries for each task that needs them
      const followUpResults = await this.generateIntelligentFollowUpPerTask(
        input.originalMessage || this.context.originalMessage,
        executionResults
      );

      if (followUpResults.toolCalls.length > 0) {
        executionResults.toolCallsExecuted.push(...followUpResults.toolCalls);
        executionResults.toolResultsCollected.push(...followUpResults.toolResults);
        executionResults.factsGathered.push(...followUpResults.facts);

        this.context.addToolCalls(followUpResults.toolCalls);
        this.context.addToolResults(followUpResults.toolResults);
        this.context.addFacts(followUpResults.facts);
      }

      // Create execution summary
      executionResults.executionSummary = {
        totalTasks: orderedTasks.length,
        completedTasks: executionResults.completedTasks.length,
        failedTasks: executionResults.failedTasks.length,
        totalToolCalls: executionResults.toolCallsExecuted.length,
        totalFacts: executionResults.factsGathered.length,
        executionTime: Date.now() - (stageId ? Date.now() : 0),
      };

      // Store results in shared context
      this.context.setSharedData("executionResults", executionResults);

      this.endPerformanceTracking(stageId, {
        tasks_completed: executionResults.completedTasks.length,
        tasks_failed: executionResults.failedTasks.length,
        tool_calls_made: executionResults.toolCallsExecuted.length,
        facts_gathered: executionResults.factsGathered.length,
      });

      this.debug(
        `Execution completed: ${executionResults.completedTasks.length}/${orderedTasks.length} tasks successful`
      );
      
      // Final verification - let the ducky see the complete picture
      if (this.context) {
        this.debug('🦆 Final verification of project structure...');
        const verification = await this.context.verifyProjectStructure();
        
        if (verification) {
          if (verification.missing.length > 0) {
            this.debug(`⚠️ Missing files that were supposed to be created: ${verification.missing.join(', ')}`);
          }
          
          if (verification.discovered.length > 0) {
            this.debug(`🦆 Discovered additional files: ${verification.discovered.join(', ')}`);
          }
          
          // Check for import issues
          const importIssues = this.context.verifyImports();
          if (importIssues.length > 0) {
            this.debug('⚠️ Import issues detected:');
            importIssues.forEach(issue => {
              this.debug(`   - ${issue.file}: ${issue.issue}`);
            });
          }
        }
      }
      
      // Clean execution results to prevent internal context leakage
      const cleanedResults = this.cleanExecutionResults(executionResults);
      return cleanedResults;
    } catch (error) {
      this.endPerformanceTracking(stageId, { error: error.message });
      this.debug("Execution failed:", error.message);
      throw error;
    }
  }

  /**
   * Execute a single task with comprehensive timeout handling
   */
  async executeTask(task) {
    const taskStageId = this.startPerformanceTracking("single_task", {
      task_id: task.id,
      tools_required: task.toolsRequired?.length || 0,
    });

    const TASK_TIMEOUT = 180000; // 3 minutes total timeout for a single task
    const taskStartTime = Date.now();

    try {
      // Wrap entire task execution in a timeout
      const taskPromise = this.executeTaskInternal(task);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Task execution timeout after ${TASK_TIMEOUT}ms`)), TASK_TIMEOUT);
      });

      const result = await Promise.race([taskPromise, timeoutPromise]);
      
      const executionTime = Date.now() - taskStartTime;
      this.debug(`Task ${task.id} completed in ${executionTime}ms`);
      
      this.endPerformanceTracking(taskStageId, {
        task_completed: true,
        tool_calls_executed: result.toolCalls?.length || 0,
        tool_results_received: result.toolResults?.length || 0,
        facts_extracted: result.facts?.length || 0,
        execution_time: executionTime,
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - taskStartTime;
      this.debug(`Task ${task.id} failed after ${executionTime}ms: ${error.message}`);
      
      this.endPerformanceTracking(taskStageId, {
        task_completed: false,
        error: error.message,
        execution_time: executionTime,
        timeout: error.message.includes('timeout'),
      });

      // Return partial result even on failure
      return {
        taskId: task.id,
        taskCompleted: false,
        toolCalls: [],
        toolResults: [],
        facts: [`Task execution failed: ${error.message}`],
        error: error.message,
        timeout: error.message.includes('timeout'),
      };
    }
  }

  /**
   * Internal task execution logic (separated for timeout handling)
   */
  async executeTaskInternal(task) {
    // DYNAMIC ADAPTATION: Initialize task context if needed
    if (!task.executionContext) {
      task.executionContext = {
        workingDirectory: null,
        filesCreated: [],
        lastToolResults: [],
        adaptable: true,
        rewriteCount: 0
      };
    }
    
    // 🦆 Let the ducky see the workspace state before executing this specific task
    if (this.context && this.context.seeTheWorld) {
      try {
        const preTaskState = await this.context.seeTheWorld('.');
        if (preTaskState) {
          this.debug(`🦆 Before task ${task.id}: ${preTaskState.files.length} files, ${preTaskState.directories.length} directories`);
        }
      } catch (error) {
        this.debug(`🦆 Couldn't check pre-task state: ${error.message}`);
      }
    }

    // Build context from previous results
    const previousResults = this.buildPreviousResultsContext();

    // Generate task execution prompt
    const executionPrompt = this.generateTaskExecutionPrompt(task, previousResults);

    // Get available tools for this task
    const availableTools = this.filterToolsForTask(task);

    // Execute with LLM (reduced timeout since we have overall task timeout)
    const response = await this.callLLM(
      [{ role: "user", content: executionPrompt }],
      availableTools,
      { timeout: 45000 } // 45 seconds for LLM response
    );

    // Extract tool calls from response
    let toolCalls = this.context.llmClient.extractToolCalls(response);
    toolCalls = this.validateAndLimitToolCalls(toolCalls, 20);

    let toolResults = [];
    let facts = [];

    // Execute tool calls if any
    if (toolCalls.length > 0) {
      this.debug(`Executing ${toolCalls.length} tool calls for task: ${task.id}`);

      // Notify callbacks about tool calls
      toolCalls.forEach(toolCall => {
        this.context.callbacks?.onToolCall?.({...toolCall, process: "execution", stage: "tool_call"});
      });

      // Execute tools with error handling and retries
      const toolExecutionResult = await this.executeToolCallsWithRetry(toolCalls);
      toolResults = toolExecutionResult.results;

      // DYNAMIC ADAPTATION: Update task context after each tool execution
      toolResults.forEach((result, index) => {
        this.updateTaskContext(task, result);
        
        // Notify callbacks about results
        if (toolCalls[index]) {
          this.context.callbacks?.onToolResult?.(toolCalls[index], {...result, process: "execution", stage: "tool_result"});
        }
      });

      // DYNAMIC ADAPTATION: Check if task needs adaptation based on results
      const adaptedTask = await this.adaptTaskDuringExecution(task, toolResults);
      if (adaptedTask !== task) {
        this.debug(`🔄 Task ${task.id} was adapted during execution`);
        task = adaptedTask; // Use the adapted task for remaining processing
      }

      // Extract facts from tool results
      facts = this.extractFactsFromResults(toolResults, task);
    }

    const taskResult = {
      taskId: task.id,
      taskCompleted: true,
      toolCalls,
      toolResults,
      facts,
      executionTime: Date.now(),
      // Store execution context internally but don't expose it
      _internalContext: task.executionContext
    };
    
    // 🦆 Let the ducky see what was created after this specific task
    if (this.context && this.context.seeTheWorld && toolCalls?.some(tc => tc.name === 'write_file')) {
      try {
        const postTaskState = await this.context.seeTheWorld('.');
        if (postTaskState) {
          this.debug(`🦆 After task ${task.id}: ${postTaskState.files.length} files, ${postTaskState.directories.length} directories`);
          
          // Track any new files that were created
          for (const file of postTaskState.files) {
            if (!this.context.projectStructure.files.includes(file)) {
              this.debug(`🦆 New file discovered: ${file}`);
            }
          }
          
          // Log what's in the file cache
          const cachedFiles = this.context.getAllCachedFiles();
          this.debug(`📚 Files cached in context: ${cachedFiles.size} files`);
          for (const [path, content] of cachedFiles) {
            const preview = content ? content.substring(0, 50).replace(/\n/g, '\\n') : '(empty)';
            this.debug(`  📄 ${path}: ${content ? content.length : 0} chars - "${preview}..."`);
          }
        }
      } catch (error) {
        this.debug(`🦆 Couldn't check post-task state: ${error.message}`);
      }
    }

    return taskResult;
  }

  /**
   * Execute tool calls with retry logic and timeouts
   */
  async executeToolCallsWithRetry(toolCalls) {
    const results = [];
    const maxRetries = this.maxRetries;
    const TOOL_TIMEOUT = 30000; // 30 seconds per tool call
    const MAX_TOTAL_TIME = 120000; // 2 minutes for all tools
    
    const startTime = Date.now();

    // Execute tools in parallel batches to improve performance
    const BATCH_SIZE = 3; // Execute up to 3 tools in parallel
    
    for (let i = 0; i < toolCalls.length; i += BATCH_SIZE) {
      // Check for cancellation before each batch
      if (this.context.llmClient && this.context.llmClient.isOperationCancelled()) {
        this.debug('🛑 Tool execution cancelled between batches');
        throw new Error('Operation cancelled by user');
      }

      // Check if we've exceeded total time limit
      if (Date.now() - startTime > MAX_TOTAL_TIME) {
        this.debug(`Total execution time exceeded ${MAX_TOTAL_TIME}ms - stopping tool execution`);
        
        // Add timeout results for remaining tools
        for (let j = i; j < toolCalls.length; j++) {
          results.push({
            tool_use_id: toolCalls[j].id,
            tool_name: toolCalls[j].name,
            content: "Tool execution skipped due to timeout",
            is_error: true,
          });
        }
        break;
      }

      const batch = toolCalls.slice(i, Math.min(i + BATCH_SIZE, toolCalls.length));
      const batchPromises = batch.map(toolCall => this.executeToolCallWithTimeout(toolCall, TOOL_TIMEOUT, maxRetries));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        this.debug(`Batch execution error: ${error.message}`);
        // Continue with next batch even if this one had errors
      }
    }

    return { results };
  }

  /**
   * Execute a single tool call with timeout and retry logic
   */
  async executeToolCallWithTimeout(toolCall, timeout, maxRetries) {
    let retryCount = 0;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        this.debug(`Executing tool call: ${toolCall.name} (attempt ${retryCount + 1})`);

        // Inject sessionId for file operation tools
        let enrichedInput = { ...toolCall.input };
        const fileOperationTools = ['read_file', 'write_file', 'execute_command', 'list_directory'];
        if (fileOperationTools.includes(toolCall.name)) {
          if (!enrichedInput.sessionId && this.context.sessionId) {
            enrichedInput.sessionId = this.context.sessionId;
            this.debug(`Injected sessionId ${this.context.sessionId} for ${toolCall.name}`);
          }
        }

        // Create timeout wrapper
        const toolPromise = this.context.mcpClient.callTool(toolCall.name, enrichedInput);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Tool call timeout after ${timeout}ms`)), timeout);
        });

        const result = await Promise.race([toolPromise, timeoutPromise]);

        // Additional validation and tracking for file operations
        if (toolCall.name === 'write_file' && result.content) {
          const contentText = Array.isArray(result.content) ? 
            result.content.map(c => c.text || c).join('') : result.content;
          
          // Check if file creation actually succeeded
          if (contentText.includes('error') || contentText.includes('failed') || contentText.includes('Error')) {
            this.debug(`⚠️ write_file may have failed: ${contentText.substring(0, 200)}...`);
          } else {
            this.debug(`✅ write_file appears successful: ${toolCall.input.path}`);
            
            // Track the file creation in AgentContext
            if (this.context && toolCall.input.path && toolCall.input.content) {
              this.context.trackFileCreation(toolCall.input.path, toolCall.input.content);
            }
          }
        }
        
        // Track directory listings to understand project structure
        if (toolCall.name === 'list_directory' && result.content && this.context) {
          const contentText = Array.isArray(result.content) ? 
            result.content.map(c => c.text || c).join('') : result.content;
          
          // Parse directory listing to update structure awareness
          if (!contentText.includes('error')) {
            this.debug(`📁 Directory listing captured for structure tracking`);
            // Could parse and add to context.projectStructure.directories
          }
        }

        this.debug(`Tool call successful: ${toolCall.name}`);
        return {
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: result.content || "",
          is_error: result.isError || false,
        };

      } catch (error) {
        retryCount++;
        lastError = error;
        this.debug(`Tool call failed (attempt ${retryCount}): ${toolCall.name} - ${error.message}`);

        if (retryCount < maxRetries) {
          // Shorter retry delay: 500ms * retry count (max 1.5s)
          await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
        }
      }
    }

    // All retries failed
    return {
      tool_use_id: toolCall.id,
      tool_name: toolCall.name,
      content: `Tool execution failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      is_error: true,
    };
  }

  /**
   * Generate intelligent follow-up queries for each task individually
   */
  async generateIntelligentFollowUpPerTask(originalMessage, executionResults) {
    console.log("🔍 generateIntelligentFollowUpPerTask triggered");
    console.log(`  - originalMessage: "${originalMessage?.substring(0, 100)}..."`);
    console.log(`  - completedTasks: ${executionResults?.completedTasks?.length || 0}`);
    console.log(`  - failedTasks: ${executionResults?.failedTasks?.length || 0}`);
    
    if (!originalMessage) {
      console.log("🔍 Skipping follow-up: No original message");
      return { toolCalls: [], toolResults: [], facts: [] };
    }

    // Check prerequisites
    const isBusinessQuery = this.isBusinessDataQuery(originalMessage);
    const hasSchemaAccess = !!this.context.getSchemaContext();
    
    console.log(`🔍 Prerequisites: isBusinessQuery=${isBusinessQuery}, hasSchemaAccess=${hasSchemaAccess}`);
    
    if (!isBusinessQuery || !hasSchemaAccess) {
      console.log("🔍 Skipping follow-up: Not a business query or no schema access");
      return { toolCalls: [], toolResults: [], facts: [] };
    }

    const allFollowUpToolCalls = [];
    const allFollowUpResults = [];
    const allFollowUpFacts = [];

    // Analyze each completed task individually
    for (const taskData of executionResults.completedTasks) {
      const { task, result } = taskData;
      console.log(`\n🔍 Analyzing task: ${task.id} - ${task.description}`);
      
      // Check if this specific task needs follow-up
      const taskNeedsFollowUp = this.analyzeTaskDataCompleteness(task, result);
      
      if (taskNeedsFollowUp) {
        console.log(`  📋 Task ${task.id} needs follow-up queries`);
        
        try {
          // Generate follow-up for this specific task
          const taskFollowUp = await this.generateTaskSpecificFollowUp(
            originalMessage,
            task,
            result
          );
          
          if (taskFollowUp.toolCalls.length > 0) {
            console.log(`  ✅ Generated ${taskFollowUp.toolCalls.length} follow-up queries for task ${task.id}`);
            allFollowUpToolCalls.push(...taskFollowUp.toolCalls);
            allFollowUpResults.push(...taskFollowUp.toolResults);
            allFollowUpFacts.push(...taskFollowUp.facts);
          }
        } catch (error) {
          console.log(`  ❌ Failed to generate follow-up for task ${task.id}: ${error.message}`);
        }
      } else {
        console.log(`  ✅ Task ${task.id} has complete data, no follow-up needed`);
      }
    }

    // Also check failed tasks that might need retry with different queries
    for (const failedTask of executionResults.failedTasks) {
      const { task, error } = failedTask;
      if (error === "No meaningful data gathered") {
        console.log(`\n🔍 Failed task needs follow-up: ${task.id} - ${task.description}`);
        
        try {
          const taskFollowUp = await this.generateTaskSpecificFollowUp(
            originalMessage,
            task,
            failedTask.result || { toolResults: [] }
          );
          
          if (taskFollowUp.toolCalls.length > 0) {
            console.log(`  ✅ Generated ${taskFollowUp.toolCalls.length} recovery queries for failed task ${task.id}`);
            allFollowUpToolCalls.push(...taskFollowUp.toolCalls);
            allFollowUpResults.push(...taskFollowUp.toolResults);
            allFollowUpFacts.push(...taskFollowUp.facts);
          }
        } catch (error) {
          console.log(`  ❌ Failed to generate recovery queries for task ${task.id}: ${error.message}`);
        }
      }
    }

    console.log(`\n🔍 Total follow-up queries generated: ${allFollowUpToolCalls.length}`);
    
    return {
      toolCalls: allFollowUpToolCalls,
      toolResults: allFollowUpResults,
      facts: allFollowUpFacts
    };
  }

  /**
   * Analyze if a specific task has sufficient data
   */
  analyzeTaskDataCompleteness(task, taskResult) {
    console.log(`  🔍 analyzeTaskDataCompleteness for task: ${task.id}`);
    
    if (!taskResult || !taskResult.toolResults || taskResult.toolResults.length === 0) {
      console.log(`    ❌ No tool results for task ${task.id} - needs follow-up`);
      return true; // Needs follow-up
    }

    const toolResults = taskResult.toolResults;
    console.log(`    📊 Task ${task.id} has ${toolResults.length} tool results`);

    // Analyze each tool result for this task
    let errorCount = 0;
    let emptyCount = 0;
    let successCount = 0;

    toolResults.forEach((result, index) => {
      if (result.is_error) {
        errorCount++;
        console.log(`      ❌ Result ${index + 1}: Error`);
      } else if (result.tool_name === "db_query" && this.isEmptyDatabaseResult(result.content)) {
        emptyCount++;
        console.log(`      ⚠️ Result ${index + 1}: Empty database result`);
      } else {
        successCount++;
        console.log(`      ✅ Result ${index + 1}: Has data`);
      }
    });

    const successRate = successCount / toolResults.length;
    console.log(`    📈 Task ${task.id} success rate: ${successCount}/${toolResults.length} = ${(successRate * 100).toFixed(1)}%`);
    console.log(`    📊 Breakdown: ${successCount} success, ${emptyCount} empty, ${errorCount} errors`);

    // Decision logic for this specific task
    if (successRate < 0.5) {
      console.log(`    🔄 Task ${task.id} NEEDS FOLLOW-UP (success rate < 50%)`);
      return true;
    }
    
    if (emptyCount > 0 && task.description.toLowerCase().includes("data")) {
      console.log(`    🔄 Task ${task.id} NEEDS FOLLOW-UP (has empty results for data task)`);
      return true;
    }

    console.log(`    ✅ Task ${task.id} DATA IS COMPLETE`);
    return false;
  }

  /**
   * Generate follow-up queries for a specific task
   */
  async generateTaskSpecificFollowUp(originalMessage, task, taskResult) {
    console.log(`  🎯 Generating follow-up for task: ${task.id}`);
    
    const schemaContext = this.context.getSchemaContext();
    if (!schemaContext) {
      return { toolCalls: [], toolResults: [], facts: [] };
    }

    // Build task-specific follow-up prompt
    const followUpPrompt = `
Original user request: "${originalMessage}"

Task that needs follow-up: "${task.description}"

This task has failed or returned incomplete data. The tool results were:
${taskResult.toolResults?.map(r => {
  if (r.is_error) return `- Error: ${r.content}`;
  if (r.tool_name === "db_query" && this.isEmptyDatabaseResult(r.content)) {
    return `- Empty result from query`;
  }
  return `- Partial data retrieved`;
}).join('\n')}

Database Schema:
${schemaContext}

Generate alternative SQL queries to complete this specific task. Consider:
1. The task might need different tables or joins
2. The filtering conditions might be too restrictive
3. The data might be in different columns than expected
4. Consider using broader search criteria or different date ranges

Provide SQL queries that will help complete the task "${task.description}".
`;

    try {
      const response = await this.callLLM(
        [
          {
            role: "system",
            content: "You are an intelligent database query generator. Generate alternative SQL queries to get the data needed for the specific task. Use the db_query tool to execute the queries."
          },
          { role: "user", content: followUpPrompt }
        ],
        [{
          name: "db_query",
          description: "Execute SQL queries",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "SQL query to execute" },
              limit: { type: "number", description: "Maximum number of results" }
            },
            required: ["query"]
          }
        }],
        {
          timeout: 30000,
          process: 'execution',
          stage: 'task_follow_up',
          temperature: 0.3
        }
      );

      // Extract tool calls from response
      let followUpQueries = [];
      if (response.toolCalls && response.toolCalls.length > 0) {
        console.log(`    📋 LLM generated ${response.toolCalls.length} follow-up queries for task ${task.id}`);
        followUpQueries = response.toolCalls;
      }

      // Execute the follow-up queries
      if (followUpQueries.length > 0) {
        console.log(`    🔄 Executing follow-up queries for task ${task.id}`);
        const followUpResults = await this.executeToolCallsWithRetry(followUpQueries);
        const facts = this.extractFactsFromResults(followUpResults.results, task);
        
        return {
          toolCalls: followUpQueries,
          toolResults: followUpResults.results,
          facts
        };
      }
    } catch (error) {
      console.log(`    ❌ Follow-up generation failed for task ${task.id}: ${error.message}`);
    }

    return { toolCalls: [], toolResults: [], facts: [] };
  }

  /**
   * Original method kept for backward compatibility
   */
  async generateIntelligentFollowUp(originalMessage, executionResults) {
    console.log("🔍 ExecutorAgent.generateIntelligentFollowUp triggered");
    console.log(`  - originalMessage: "${originalMessage?.substring(0, 100)}..."`);
    console.log(`  - toolResultsCollected: ${executionResults?.toolResultsCollected?.length || 0} results`);
    
    if (!originalMessage || !executionResults.toolResultsCollected.length) {
      console.log("🔍 Skipping follow-up: No message or no tool results");
      return { toolCalls: [], toolResults: [], facts: [] };
    }

    try {
      this.context.callbacks?.onStatusChange?.("🧠 Generating intelligent follow-up queries");

      // Check if this is a business query that might benefit from additional database queries
      const isBusinessQuery = this.isBusinessDataQuery(originalMessage);
      const hasSchemaAccess = !!this.context.getSchemaContext();
      
      console.log(`🔍 Follow-up check: isBusinessQuery=${isBusinessQuery}, hasSchemaAccess=${hasSchemaAccess}`);

      if (!isBusinessQuery || !hasSchemaAccess) {
        this.debug("No intelligent follow-up needed");
        console.log("🔍 Skipping follow-up: Not a business query or no schema access");
        return { toolCalls: [], toolResults: [], facts: [] };
      }

      // Analyze results to determine if we need more data
      const needsMoreData = this.analyzeDataCompleteness(executionResults);
      console.log(`🔍 Data completeness check: needsMoreData=${needsMoreData}`);

      if (!needsMoreData) {
        this.debug("Data completeness is sufficient");
        console.log("🔍 Skipping follow-up: Data is already complete");
        return { toolCalls: [], toolResults: [], facts: [] };
      }

      // Generate follow-up queries
      console.log("🔍 Generating follow-up queries...");
      const followUpQueries = await this.generateFollowUpQueries(originalMessage, executionResults);

      if (followUpQueries.length === 0) {
        console.log("🔍 No follow-up queries generated");
        return { toolCalls: [], toolResults: [], facts: [] };
      }

      console.log(`🔍 Generated ${followUpQueries.length} follow-up queries`);
      this.debug(`Executing ${followUpQueries.length} follow-up queries`);

      // Execute follow-up queries
      const followUpResults = await this.executeToolCallsWithRetry(followUpQueries);
      const facts = this.extractFactsFromResults(followUpResults.results, {
        id: "followup",
        description: "Intelligent follow-up queries",
      });

      console.log(`🔍 Follow-up execution complete: ${followUpResults.results.length} results`);
      
      return {
        toolCalls: followUpQueries,
        toolResults: followUpResults.results,
        facts,
      };
    } catch (error) {
      console.log(`🔍 Intelligent follow-up failed: ${error.message}`);
      this.debug("Intelligent follow-up failed:", error.message);
      return { toolCalls: [], toolResults: [], facts: [] };
    }
  }

  /**
   * Order tasks by their dependencies
   */
  orderTasksByDependencies(tasks) {
    if (!Array.isArray(tasks)) return [];

    const ordered = [];
    const processed = new Set();
    const processing = new Set();

    const processTask = task => {
      if (processed.has(task.id)) return;
      if (processing.has(task.id)) {
        // Circular dependency - skip dependencies
        this.debug(`Circular dependency detected for task: ${task.id}`);
        ordered.push(task);
        processed.add(task.id);
        return;
      }

      processing.add(task.id);

      // Process dependencies first
      if (task.dependencies && Array.isArray(task.dependencies)) {
        for (const depId of task.dependencies) {
          const depTask = tasks.find(t => t.id === depId);
          if (depTask && !processed.has(depId)) {
            processTask(depTask);
          }
        }
      }

      ordered.push(task);
      processed.add(task.id);
      processing.delete(task.id);
    };

    // Process all tasks
    tasks.forEach(processTask);

    return ordered;
  }

  /**
   * Generate task execution prompt
   */
  generateTaskExecutionPrompt(task, previousResults) {
    const memorySection = "";
    
    // Add conversation history using the context helper
    const conversationSection = this.context?.getExecutorContext() || '';

    const previousSection = previousResults
      ? `\nPREVIOUS EXECUTION RESULTS:\n${previousResults}\n`
      : "";

    // DYNAMIC ADAPTATION: Add execution context section
    let executionContextSection = "";
    
    // Add project structure awareness from AgentContext
    if (this.context && this.context.projectStructure.files.length > 0) {
      const structure = this.context.getProjectStructureSummary();
      executionContextSection = `\nCURRENT PROJECT STRUCTURE:`;
      executionContextSection += `\n- Workspace: ${this.context.sessionWorkspace || 'session root'}`;
      executionContextSection += `\n- Files Created (${structure.fileCount}): ${structure.files.slice(0, 10).join(', ')}${structure.fileCount > 10 ? '...' : ''}`;
      executionContextSection += `\n- Directories: ${structure.directories.join(', ') || 'root only'}`;
      
      // Add import issues if any
      if (structure.importIssues.length > 0) {
        executionContextSection += `\n- IMPORT ISSUES DETECTED:`;
        structure.importIssues.forEach(issue => {
          executionContextSection += `\n  * ${issue.file}: ${issue.issue}`;
        });
        executionContextSection += `\n- IMPORTANT: Fix these import issues or the code won't run`;
      }
    }
    
    // Add task-specific context if available
    if (task.executionContext) {
      const context = task.executionContext;
      
      if (context.workingDirectory) {
        executionContextSection += `\n- Working Directory: ${context.workingDirectory}`;
        executionContextSection += `\n- IMPORTANT: Use this working directory for all file operations`;
      }
      
      if (context.filesCreated && context.filesCreated.length > 0) {
        executionContextSection += `\n- Task Files Created: ${context.filesCreated.join(', ')}`;
        executionContextSection += `\n- IMPORTANT: Reference these existing files in your code/operations`;
      }
      
      if (context.lastToolResults && context.lastToolResults.length > 0) {
        const recentErrors = context.lastToolResults.filter(r => !r.success);
        if (recentErrors.length > 0) {
          executionContextSection += `\n- Recent Errors: ${recentErrors.map(e => e.summary).join('; ')}`;
          executionContextSection += `\n- IMPORTANT: Avoid repeating these errors`;
        }
      }
      
      if (context.rewriteCount > 0) {
        executionContextSection += `\n- Task Adaptations: ${context.rewriteCount} (task was modified during execution)`;
      }
      
      executionContextSection += `\n`;
    }

    return `Execute this specific task using the appropriate tools:

TASK TO EXECUTE:
- ID: ${task.id}
- Description: ${task.description}
- Required Tools: ${task.toolsRequired?.join(", ") || "any appropriate tools"}
- Expected Outcome: ${task.expectedOutcome || "Complete the task successfully"}
- Data Sources Needed: ${task.dataSourcesNeeded?.join(", ") || "determine as needed"}

${conversationSection}${memorySection}${previousSection}${executionContextSection}

EXECUTION INSTRUCTIONS:
1. Use the most appropriate tools for this specific task
2. Follow the task description and expected outcome precisely
3. If database queries are needed, use the preloaded schema context
4. Extract meaningful information and insights from tool results
5. Handle any errors gracefully and provide informative results

CRITICAL FOR DATABASE TASKS:
- For business data queries, generate MULTIPLE strategic SQL queries
- Don't just run one query - think about different angles:
  * Main aggregation query (e.g., revenue by category)
  * Supporting detail queries (e.g., top items in each category)
  * Validation queries (e.g., total counts, date ranges)
- Use multiple db_query tool calls in a single response to gather comprehensive data
- Each query should add valuable information to answer the user's request fully

Execute the task now using the available tools. You can use multiple tool calls.`;
  }

  /**
   * Filter tools available for a specific task
   */
  filterToolsForTask(task) {
    const allTools = this.context.tools || [];
    
    // Debug: Check if tools have proper schemas
    const dbQueryTool = allTools.find(t => t.name === 'db_query');
    if (dbQueryTool) {
      this.debug(`db_query tool schema:`, JSON.stringify(dbQueryTool, null, 2));
    } else {
      this.debug(`db_query tool not found in context.tools. Available tools:`, allTools.map(t => t.name));
    }

    // If task specifies required tools, prefer those
    if (task.toolsRequired && Array.isArray(task.toolsRequired)) {
      const requiredTools = allTools.filter(tool => task.toolsRequired.includes(tool.name));
      if (requiredTools.length > 0) {
        this.debug(`Using ${requiredTools.length} task-required tools: ${requiredTools.map(t => t.name).join(', ')}`);
        return requiredTools;
      }
    }
    
    // Return all allowed tools for this agent
    return this.filterToolsForAgent(allTools);
  }

  /**
   * Validate and limit tool calls
   */
  validateAndLimitToolCalls(toolCalls, maxCalls = 20) {
    if (!Array.isArray(toolCalls)) {
      this.debug(`Tool calls is not an array: ${typeof toolCalls}`);
      return [];
    }

    // Validate each tool call
    const validCalls = toolCalls.filter(call => {
      // Basic structure validation
      if (!call || typeof call !== 'object') {
        this.debug(`Tool call is not an object:`, call);
        return false;
      }
      
      if (!call.name || !call.id) {
        this.debug(`Tool call missing name or id:`, JSON.stringify(call));
        return false;
      }

      // PARAMETER NORMALIZATION: Fix common parameter name mismatches
      if (call.input) {
        // Fix filename -> path mapping for write_file and read_file
        if ((call.name === 'write_file' || call.name === 'read_file') && call.input.filename && !call.input.path) {
          this.debug(`🔧 Fixing parameter mapping: filename -> path for ${call.name}`);
          call.input.path = call.input.filename;
          delete call.input.filename;
        }
        
        // Fix content serialization for write_file with object content
        if (call.name === 'write_file' && call.input.content && typeof call.input.content === 'object') {
          this.debug(`🔧 Serializing object content to JSON string for write_file`);
          call.input.content = JSON.stringify(call.input.content, null, 2);
        }
        
        // DETECT AND REJECT BRACE EXPANSION SYNTAX
        if ((call.name === 'write_file' || call.name === 'read_file' || call.name === 'list_directory') && call.input.path) {
          const originalPath = call.input.path;
          
          // Check for brace expansion patterns
          if (originalPath.includes('{') || originalPath.includes('}')) {
            this.debug(`⚠️ INVALID PATH with brace expansion detected: "${originalPath}"`);
            this.debug(`❌ Brace expansion like {css,js,images} is NOT supported in file paths!`);
            this.debug(`📝 Agent must create each file/directory separately`);
            
            // For write_file, we'll reject paths with braces entirely
            if (call.name === 'write_file') {
              // Extract the base path and filename
              const parts = originalPath.split('/');
              const fileName = parts[parts.length - 1];
              
              // If the filename itself doesn't have braces, try to extract a valid path
              if (!fileName.includes('{') && !fileName.includes('}')) {
                // Find the first part with braces and truncate there
                const validParts = [];
                for (const part of parts) {
                  if (part.includes('{') || part.includes('}')) {
                    break;
                  }
                  validParts.push(part);
                }
                
                if (validParts.length > 0 && fileName && !fileName.includes('{')) {
                  // Reconstruct path without the brace expansion parts
                  validParts.push(fileName);
                  const cleanPath = validParts.join('/');
                  this.debug(`🔧 Attempting to salvage path: "${originalPath}" → "${cleanPath}"`);
                  call.input.path = cleanPath;
                } else {
                  this.debug(`❌ Cannot salvage path with brace expansion, rejecting tool call`);
                  return false;
                }
              } else {
                this.debug(`❌ Filename contains braces, rejecting tool call`);
                return false;
              }
            }
          }
          
          // Additional path normalization (remove double slashes, etc)
          const normalizedPath = call.input.path
            .replace(/\/+/g, '/')       // Collapse multiple slashes
            .replace(/^\/+|\/+$/g, ''); // Trim leading/trailing slashes
          
          if (normalizedPath !== call.input.path) {
            this.debug(`🔧 Normalized path: "${call.input.path}" → "${normalizedPath}"`);
            call.input.path = normalizedPath;
          }
        }
        
        // LOG PATH DECISIONS: Log where files are being created but don't auto-correct
        if (call.name === 'write_file' && call.input.path) {
          const fileName = call.input.path.split('/').pop();
          const hasSubdir = call.input.path.includes('/');
          
          if (!hasSubdir) {
            this.debug(`📝 Creating file at root: ${fileName}`);
          } else {
            this.debug(`📝 Creating file in subdirectory: ${call.input.path}`);
          }
        }
      }

      // Specific validation for db_query
      if (call.name === "db_query") {
        const input = call.input || {};
        if (!input.query || typeof input.query !== "string" || input.query.trim().length === 0) {
          this.debug(`Invalid db_query call filtered out: ${call.id} - input:`, JSON.stringify(input));
          this.debug(`Full call structure:`, JSON.stringify(call, null, 2));
          return false;
        }
        // Additional validation for db_query
        if (input.query.trim().toLowerCase().startsWith('select')) {
          // Looks like valid SQL
          this.debug(`Valid db_query call: ${call.id}`);
        }
      }

      // Specific validation for file operations
      if (call.name === "read_file" || call.name === "list_directory") {
        const input = call.input || {};
        if (!input.path || typeof input.path !== "string" || input.path.trim().length === 0) {
          this.debug(`Invalid ${call.name} call filtered out: ${call.id} - input:`, JSON.stringify(input));
          this.debug(`Full call structure:`, JSON.stringify(call, null, 2));
          return false;
        }
      }

      if (call.name === "write_file") {
        const input = call.input || {};
        if (!input.path || typeof input.path !== "string" || input.path.trim().length === 0) {
          this.debug(`Invalid write_file call filtered out: ${call.id} - missing path`);
          return false;
        }
        if (input.content === undefined || input.content === null) {
          this.debug(`Invalid write_file call filtered out: ${call.id} - missing content`);
          return false;
        }
      }

      if (call.name === "execute_command") {
        const input = call.input || {};
        if (!input.command || typeof input.command !== "string" || input.command.trim().length === 0) {
          this.debug(`Invalid execute_command call filtered out: ${call.id} - input:`, JSON.stringify(input));
          return false;
        }
      }

      return true;
    });

    // Limit number of calls
    if (validCalls.length > maxCalls) {
      this.debug(`Tool calls limited from ${validCalls.length} to ${maxCalls}`);
      return validCalls.slice(0, maxCalls);
    }

    return validCalls;
  }

  /**
   * Extract facts from tool results
   */
  extractFactsFromResults(toolResults, task) {
    const facts = [];

    toolResults.forEach(result => {
      if (result.content && !result.is_error) {
        // Safely convert content to string
        let content;
        if (typeof result.content === "string") {
          content = result.content;
        } else if (typeof result.content === "object") {
          content = JSON.stringify(result.content);
        } else {
          content = String(result.content);
        }

        switch (result.tool_name) {
          case "db_query":
            facts.push(`Database query result: ${content.substring(0, 200)}...`);
            break;
          case "remember":
            facts.push(`Information stored in memory: ${content.substring(0, 200)}...`);
            break;
          case "think_sequentially":
            facts.push(`Sequential analysis completed: ${content.substring(0, 200)}...`);
            break;
          case "mermaid_diagram":
            facts.push(`Mermaid diagram created for ${task.description}`);
            break;
          case "vega_lite_diagram":
            facts.push(`Vega-Lite visualization created for ${task.description}`);
            break;
          case "markdown_table":
            facts.push(`Data table formatted for ${task.description}`);
            break;
          case "markdown_action_item":
            facts.push(`Action items created for ${task.description}`);
            break;
          default:
            facts.push(`${result.tool_name} result: ${content.substring(0, 200)}...`);
        }
      } else if (result.is_error) {
        // Safely convert error content to string
        let errorContent;
        if (typeof result.content === "string") {
          errorContent = result.content;
        } else if (typeof result.content === "object") {
          errorContent = JSON.stringify(result.content);
        } else {
          errorContent = String(result.content);
        }
        facts.push(`Tool error in ${task.description}: ${errorContent}`);
      }
    });

    if (facts.length === 0) {
      facts.push(`Task executed: ${task.description}`);
    }

    return facts;
  }

  /**
   * Build context from previous results
   */
  buildPreviousResultsContext() {
    const allResults = this.context.allToolResults;
    if (!allResults || allResults.length === 0) {
      return "No previous execution results available.";
    }

    const contextSections = [];
    const resultsByTool = {};

    // Group results by tool
    allResults.forEach(result => {
      const toolName = result.tool_name || "unknown";
      if (!resultsByTool[toolName]) {
        resultsByTool[toolName] = [];
      }
      resultsByTool[toolName].push(result);
    });

    // Create summary for each tool
    Object.entries(resultsByTool).forEach(([toolName, results]) => {
      const successfulResults = results.filter(r => !r.is_error);

      if (successfulResults.length > 0) {
        contextSections.push(`**${toolName}** (${successfulResults.length} results):`);

        successfulResults.slice(0, 3).forEach((result, index) => {
          // Safely convert content to string
          let content;
          if (typeof result.content === "string") {
            content = result.content.substring(0, 500);
          } else if (typeof result.content === "object") {
            content = JSON.stringify(result.content).substring(0, 500);
          } else {
            content = String(result.content).substring(0, 500);
          }

          const fullLength =
            typeof result.content === "string"
              ? result.content.length
              : JSON.stringify(result.content).length;
          contextSections.push(`  ${index + 1}. ${content}${fullLength > 500 ? "..." : ""}`);
        });
      }
    });

    if (contextSections.length === 0) {
      return "Previous executions completed but no successful results to reference.";
    }

    return contextSections.join("\n");
  }

  /**
   * Check if this is a business data query
   */
  isBusinessDataQuery(message) {
    const businessKeywords = [
      "customers?",
      "deals?",
      "sales?",
      "revenue",
      "accounts?",
      "contacts?",
      "projects?",
      "tasks?",
      "engagements?",
      "contracts?",
      "invoices?",
      "our",
      "my",
      "team",
      "company",
      "business",
      "data",
      "report",
    ];

    const lowerMessage = message.toLowerCase();
    return businessKeywords.some(keyword =>
      new RegExp(`\\b${keyword.replace("?", "")}s?\\b`).test(lowerMessage)
    );
  }

  /**
   * Analyze if we have sufficient data or need follow-up queries
   */
  analyzeDataCompleteness(executionResults) {
    console.log("🔍 analyzeDataCompleteness: Starting analysis");
    const toolResults = executionResults.toolResultsCollected;
    console.log(`🔍 analyzeDataCompleteness: Total tool results = ${toolResults.length}`);

    // Check for empty or error results
    const successfulResults = toolResults.filter((r, index) => {
      console.log(`🔍 analyzeDataCompleteness: Checking result ${index + 1}/${toolResults.length}`);
      
      if (r.is_error) {
        console.log(`  ❌ Result ${index + 1}: is_error = true, filtering out`);
        return false;
      }
      
      if (!r.content) {
        console.log(`  ❌ Result ${index + 1}: content is null/undefined, filtering out`);
        return false;
      }

      // Extract actual text from MCP format
      let actualText = "";
      if (Array.isArray(r.content) && r.content.length > 0 && r.content[0].type === "text") {
        actualText = r.content[0].text;
        console.log(`  📄 Result ${index + 1}: Extracted text from MCP format (length=${actualText.length})`);
      } else if (typeof r.content === "string") {
        actualText = r.content;
        console.log(`  📄 Result ${index + 1}: Content is string (length=${actualText.length})`);
      } else {
        actualText = JSON.stringify(r.content);
        console.log(`  📄 Result ${index + 1}: Stringified object content (length=${actualText.length})`);
      }

      const hasContent = actualText.trim().length > 0;
      console.log(`  ${hasContent ? '✅' : '❌'} Result ${index + 1}: Has content = ${hasContent}`);
      
      return hasContent;
    });
    
    const totalResults = toolResults.length;
    const successCount = successfulResults.length;
    const successRate = totalResults > 0 ? (successCount / totalResults) : 0;
    
    console.log(`🔍 analyzeDataCompleteness: Success rate = ${successCount}/${totalResults} = ${(successRate * 100).toFixed(1)}%`);

    // Decision logic
    if (totalResults === 0) {
      console.log("🔍 analyzeDataCompleteness: NEEDS MORE DATA (no results at all)");
      return true; // Need data
    }
    
    if (successRate < 0.5) {
      console.log(`🔍 analyzeDataCompleteness: NEEDS MORE DATA (success rate ${(successRate * 100).toFixed(1)}% < 50%)`);
      return true; // Too many failures
    }

    console.log(`🔍 analyzeDataCompleteness: DATA IS COMPLETE (success rate ${(successRate * 100).toFixed(1)}% >= 50%)`);
    return false; // Seems complete
  }

  /**
   * Generate follow-up database queries using intelligent analysis
   * Ported from base-llm.js intelligent follow-up logic
   */
  async generateFollowUpQueries(originalMessage, executionResults) {
    try {
      const toolResults = executionResults.toolResultsCollected || [];
      const toolCalls = executionResults.toolCallsExecuted || [];

      // Check if we have schema context for intelligent queries
      const schemaContext = this.context.getSchemaContext();
      if (!schemaContext) {
        this.debug("No schema context available for intelligent follow-ups");
        return [];
      }

      // Check for failed database queries that need follow-ups
      // IMPORTANT: Empty results are also considered failures
      const failedDbQueries = [];

      toolResults.forEach((result, index) => {
        const toolCall = toolCalls[index];
        if (toolCall?.name === "db_query") {
          if (result.is_error) {
            this.debug(`🚨 DB query FAILED with error: ${result.content}`);
            failedDbQueries.push({ toolCall, result, failureType: "error" });
          } else if (this.isEmptyDatabaseResult(result.content)) {
            this.debug(`🚨 DB query returned EMPTY result - needs follow-up`);
            failedDbQueries.push({ toolCall, result, failureType: "empty" });
          } else {
            this.debug(`✅ DB query returned meaningful data`);
          }
        }
      });

      if (failedDbQueries.length === 0) {
        this.debug("No failed or empty database queries found");
        return [];
      }

      this.debug(
        `Found ${failedDbQueries.length} failed/empty database queries requiring follow-ups`
      );

      // Generate intelligent follow-up queries using LLM
      const followUpPrompt = this.buildFollowUpQueryPrompt(
        originalMessage,
        failedDbQueries,
        schemaContext
      );

      const response = await this.callLLM(
        [
          {
            role: "system",
            content:
              "You are an intelligent database query generator. Generate follow-up SQL queries to get the data the user needs. Use the db_query tool to execute the queries.",
          },
          { role: "user", content: followUpPrompt },
        ],
        [{ 
          name: "db_query", 
          description: "Execute SQL queries",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "SQL query to execute" },
              limit: { type: "number", description: "Maximum number of results" }
            },
            required: ["query"]
          }
        }],
        {
          timeout: 30000,
          process: 'execution',
          stage: 'follow_up_generation',
          temperature: 0.3,
        }
      );

      // Extract tool calls directly from response (LLM should use tools, not return text)
      let followUpQueries = [];
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.debug(`LLM generated ${response.toolCalls.length} follow-up tool calls`);
        followUpQueries = response.toolCalls;
      } else if (response.text) {
        // Fallback: try to parse text response if no tool calls
        this.debug("No tool calls in response, trying to parse text response");
        const responseText = response.text || "";
        followUpQueries = this.parseFollowUpQueries(responseText);
      } else {
        this.debug("No follow-up queries generated by LLM");
      }

      this.debug(`Generated ${followUpQueries.length} intelligent follow-up queries`);
      return followUpQueries;
    } catch (error) {
      this.debug(`Intelligent follow-up generation failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Build prompt for generating follow-up queries
   */
  buildFollowUpQueryPrompt(originalMessage, failedQueries, schemaContext) {
    let prompt = `Original user request: "${originalMessage}"\n\n`;

    if (failedQueries.length > 0) {
      prompt += `FAILED/EMPTY DATABASE QUERIES TO FIX:\n`;
      failedQueries.forEach((item, i) => {
        prompt += `${i + 1}. Query: ${item.toolCall.input?.query || "Unknown"}\n`;
        if (item.failureType === "error") {
          prompt += `   Error: ${item.result.content}\n`;
        } else if (item.failureType === "empty") {
          prompt += `   Issue: Query returned no data - need alternative approach\n`;
        }
        prompt += `\n`;
      });
    }

    prompt += `AVAILABLE SCHEMA:\n${schemaContext.substring(0, 5000)}...\n\n`;

    prompt += `TASK: Generate 1-3 follow-up db_query tool calls that will successfully get the data the user needs.\n`;
    prompt += `For SQL errors: Fix the syntax/table names using the correct schema above.\n`;
    prompt += `For empty results: Try different table joins, date ranges, filters, or alternative data sources.\n`;
    prompt += `CRITICAL: Only generate queries if you can see relevant tables in the schema. If no relevant data exists, generate NO queries.\n\n`;
    prompt += `Response format (JSON array only):\n`;
    prompt += `[{"id": "followup_1", "name": "db_query", "input": {"query": "SELECT ...", "limit": null}}]\n`;

    return prompt;
  }

  /**
   * Parse follow-up queries from LLM response
   */
  parseFollowUpQueries(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.debug("No JSON array found in follow-up response");
        return [];
      }

      const queries = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(queries)) {
        this.debug("Follow-up response is not an array");
        return [];
      }

      // Validate and clean up queries
      return queries
        .filter(q => q.name === "db_query" && q.input?.query)
        .map((q, i) => ({
          id: q.id || `followup_${i + 1}`,
          name: "db_query",
          input: {
            query: q.input.query,
            limit: q.input.limit || null,
          },
        }));
    } catch (error) {
      this.debug(`Failed to parse follow-up queries: ${error.message}`);
      return [];
    }
  }

  /**
   * Validate that files were created in correct directories
   * Note: This now just logs information, doesn't enforce directory structure
   */
  validateFileCreationPaths(taskResult) {
    if (!taskResult?.toolCalls) return [];
    
    const fileInfo = [];
    const writeFileCalls = taskResult.toolCalls.filter(tc => tc.name === 'write_file');
    
    for (const call of writeFileCalls) {
      const path = call.input?.path || call.input?.filename;
      if (path) {
        const fileName = path.split('/').pop();
        const hasSubdir = path.includes('/');
        
        if (!hasSubdir) {
          fileInfo.push(`File "${fileName}" created at root level`);
        } else {
          fileInfo.push(`File "${fileName}" created in ${path.substring(0, path.lastIndexOf('/'))}/`);
        }
      }
    }
    
    return fileInfo;
  }

  /**
   * Check if a task has gathered meaningful data
   */
  taskHasGatheredMeaningfulData(taskResult) {
    if (!taskResult || !taskResult.toolResults || taskResult.toolResults.length === 0) {
      return false;
    }

    // Check if all tool results are either errors or empty
    const meaningfulResults = taskResult.toolResults.filter(result => {
      if (result.is_error) return false;

      // For db_query results, check if they're empty
      if (result.tool_name === "db_query") {
        const isEmpty = this.isEmptyDatabaseResult(result.content);
        if (isEmpty) {
          this.debug(
            `🚫 DB query result detected as EMPTY: ${JSON.stringify(result.content).substring(
              0,
              100
            )}...`
          );
        } else {
          this.debug(`✅ DB query result has meaningful data`);
        }
        return !isEmpty;
      }

      // For other tools, any non-error result is considered meaningful
      return true;
    });

    return meaningfulResults.length > 0;
  }

  /**
   * Check if a database result is considered empty (failure)
   */
  isEmptyDatabaseResult(content) {
    if (!content) return true;

    // Log the raw content to understand its structure
    this.debug(`🔍 Checking if DB result is empty. Raw content type: ${typeof content}`);
    this.debug(`🔍 Raw content: ${JSON.stringify(content).substring(0, 500)}...`);

    // Extract text from MCP result format: [{"type":"text","text":"..."}]
    let actualText = "";
    if (Array.isArray(content) && content.length > 0 && content[0].type === "text") {
      actualText = content[0].text;
      this.debug(`🔍 Extracted text from MCP format: ${actualText.substring(0, 200)}...`);
    } else if (typeof content === "string") {
      actualText = content;
    } else if (typeof content === "object") {
      actualText = JSON.stringify(content);
    } else {
      actualText = String(content);
    }

    const trimmed = actualText.trim();
    if (trimmed === "") return true;
    if (trimmed === "[]") return true;
    if (trimmed === "{}") return true;
    if (trimmed === "null") return true;

    // Try to parse as clean JSON (new format)
    try {
      const parsed = JSON.parse(trimmed);

      // Check for new clean format with isEmpty and recordCount
      if (typeof parsed === "object" && parsed !== null) {
        if (parsed.hasOwnProperty("isEmpty") && parsed.hasOwnProperty("recordCount")) {
          const isEmpty = parsed.isEmpty === true || parsed.recordCount === 0;
          this.debug(
            `🔍 Using clean JSON format: isEmpty=${isEmpty}, recordCount=${parsed.recordCount}`
          );

          if (isEmpty) {
            this.debug("🚫 Empty result detected via clean JSON format");
            return true;
          } else {
            this.debug("✅ Result has data via clean JSON format");
            return false;
          }
        }
      }

      // FALLBACK: Check for old array format
      if (Array.isArray(parsed) && parsed.length === 0) {
        this.debug("🚫 Empty result detected: JSON array with 0 elements");
        return true;
      }

      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length === 0) {
        this.debug("🚫 Empty result detected: Empty JSON object");
        return true;
      }
    } catch (e) {
      // FALLBACK: Text-based detection for backward compatibility
      if (
        trimmed.includes("0 rows") ||
        trimmed.includes("no results") ||
        trimmed.includes("empty")
      ) {
        this.debug(
          `🚫 Empty result detected: Text pattern match - "${trimmed.substring(0, 50)}..."`
        );
        return true;
      }

      // Check for NULL values in database results
      if (
        trimmed.includes("sum: NULL") ||
        trimmed.includes("count: NULL") ||
        trimmed.includes("total: NULL")
      ) {
        this.debug(
          `🚫 Empty result detected: NULL aggregation - "${trimmed.substring(0, 100)}..."`
        );
        return true;
      }

      // Check for zero counts
      if (trimmed.includes("count: 0") || trimmed.includes("Found 0 record")) {
        this.debug(`🚫 Empty result detected: Zero count - "${trimmed.substring(0, 100)}..."`);
        return true;
      }

      // Check for "Found X record(s)" where X is 0
      const recordMatch = trimmed.match(/Found (\d+) record/);
      if (recordMatch && parseInt(recordMatch[1]) === 0) {
        this.debug(`🚫 Empty result detected: Found 0 records pattern`);
        return true;
      }

      // Check if the result indicates no data was found
      const lowerTrimmed = trimmed.toLowerCase();
      if (
        lowerTrimmed.includes("no data") ||
        lowerTrimmed.includes("not found") ||
        lowerTrimmed.includes("no records")
      ) {
        this.debug(`🚫 Empty result detected: No data pattern - "${trimmed.substring(0, 100)}..."`);
        return true;
      }
    }

    // If we get here, the result has some content
    this.debug(`✅ Result has content: ${trimmed.substring(0, 200)}...`);
    this.debug(`🔍 Final decision: NOT EMPTY`);
    return false;
  }

  /**
   * Validate execution input
   */
  validateInput(input) {
    return input && typeof input === "object";
  }

  /**
   * DYNAMIC TASK ADAPTATION METHODS
   * Allow executor to modify tasks during execution based on context
   */

  /**
   * Update task context during execution - uses LLM to intelligently extract context
   */
  async updateTaskContext(task, toolResult, workingDir = null) {
    if (!task.executionContext) {
      task.executionContext = {
        workingDirectory: null,
        filesCreated: [],
        lastToolResults: [],
        adaptable: true,
        rewriteCount: 0
      };
    }

    // Manual working directory override
    if (workingDir) {
      task.executionContext.workingDirectory = workingDir;
    }

    // Extract tool result content safely
    const contentText = this.extractToolResultText(toolResult);
    
    // Store recent tool results for context with enhanced validation
    const isSuccess = !toolResult?.is_error && 
      !(contentText.includes('error') || contentText.includes('failed') || contentText.includes('Error'));
    
    task.executionContext.lastToolResults.push({
      tool: toolResult?.tool_name,
      success: isSuccess,
      summary: contentText.substring(0, 200) || 'Tool executed',
      filePath: toolResult?.tool_name === 'write_file' ? this.getFilePathFromResult(toolResult, contentText) : null
    });

    // Track failed file operations separately
    if (toolResult?.tool_name === 'write_file' && !isSuccess) {
      this.debug(`❌ File creation failed: ${this.getFilePathFromResult(toolResult, contentText) || 'unknown path'}`);
    }

    // Keep only last 5 results
    if (task.executionContext.lastToolResults.length > 5) {
      task.executionContext.lastToolResults = task.executionContext.lastToolResults.slice(-5);
    }

    // Use LLM to intelligently extract context for file operations
    if (toolResult?.tool_name && ['write_file', 'execute_command', 'list_directory'].includes(toolResult.tool_name) && contentText) {
      await this.extractContextWithLLM(task, toolResult, contentText);
    }

    this.debug(`📝 Updated task context for ${task.id}: workdir=${task.executionContext.workingDirectory}, files=${task.executionContext.filesCreated.length}`);
  }

  /**
   * Extract file path from tool result for tracking
   */
  getFilePathFromResult(toolResult, contentText) {
    // Try to extract from tool input first (most reliable)
    if (toolResult?.input?.path) {
      return toolResult.input.path;
    }
    
    // Try to extract from content text
    const pathMatch = contentText.match(/(?:wrote|written|created|saved).*?(?:to|at|in)\s+([^\s\n]+)/i);
    return pathMatch ? pathMatch[1] : null;
  }

  /**
   * Extract text content from tool result (handles different content formats)
   */
  extractToolResultText(toolResult) {
    if (!toolResult?.content) return '';
    
    const content = toolResult.content;
    
    if (typeof content === 'string') {
      return content;
    } else if (Array.isArray(content)) {
      // Handle MCP content format: [{"type":"text","text":"..."}]
      return content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    } else if (content && typeof content === 'object' && content.text) {
      return content.text;
    }
    
    return '';
  }

  /**
   * Use LLM to intelligently extract context information from tool results
   */
  async extractContextWithLLM(task, toolResult, contentText) {
    const extractionPrompt = `Extract context information from this tool execution result:

TOOL: ${toolResult.tool_name}
RESULT: ${contentText}

Please extract the following information (respond with JSON only):
{
  "workingDirectory": "path if a working directory can be determined, null otherwise",
  "filesCreated": ["list of file paths that were created"],
  "filesModified": ["list of file paths that were modified"],
  "errors": ["list of any error messages"]
}

Rules:
- For write_file: extract the file path that was written
- For execute_command: extract any directories created or files generated
- For list_directory: extract the directory that was listed
- Only include actual file/directory paths, not descriptions
- Return null for workingDirectory if none can be determined
- Return empty arrays if no files were created/modified`;

    try {
      const response = await this.callLLM([
        { role: 'user', content: extractionPrompt }
      ], [], { 
        timeout: 10000,
        process: 'context_extraction',
        stage: 'extract_context'
      });

      const responseText = this.context.llmClient.extractTextResponse(response).trim();
      
      // Extract JSON from response text (handle cases where LLM adds extra text)
      let jsonText = responseText;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      
      const extractedInfo = JSON.parse(jsonText);

      // Update task context with extracted information
      if (extractedInfo.workingDirectory && !task.executionContext.workingDirectory) {
        task.executionContext.workingDirectory = extractedInfo.workingDirectory;
      }

      if (extractedInfo.filesCreated?.length > 0) {
        extractedInfo.filesCreated.forEach(file => {
          if (!task.executionContext.filesCreated.includes(file)) {
            task.executionContext.filesCreated.push(file);
          }
        });
      }

    } catch (error) {
      this.debug(`⚠️ Context extraction failed: ${error.message}`);
      // Fall back to basic tracking without LLM
    }
  }

  /**
   * Adapt task during execution - rewrite task if context suggests a better approach
   */
  async adaptTaskDuringExecution(task, executionResults) {
    if (!task.executionContext?.adaptable || task.executionContext.rewriteCount >= 2) {
      return task; // Don't adapt if not allowed or already adapted twice
    }

    // Check if we need to adapt based on execution results
    const needsAdaptation = this.shouldAdaptTask(task, executionResults);
    
    if (!needsAdaptation) {
      return task;
    }

    this.debug(`🔄 Adapting task ${task.id} based on execution context`);

    // Generate adapted task description using LLM
    const adaptedTask = await this.generateAdaptedTask(task, executionResults);
    
    if (adaptedTask) {
      adaptedTask.executionContext.rewriteCount = (task.executionContext.rewriteCount || 0) + 1;
      this.debug(`✅ Task ${task.id} adapted (attempt ${adaptedTask.executionContext.rewriteCount})`);
      return adaptedTask;
    }

    return task;
  }

  /**
   * Check if task should be adapted based on execution context
   */
  shouldAdaptTask(task, executionResults) {
    // Adapt if file operations failed due to directory issues
    if (this.hasDirectoryErrors(executionResults)) {
      return true;
    }

    // Adapt if we discovered a working directory that differs from expectation
    if (task.executionContext?.workingDirectory && 
        task.description.includes('file') && 
        !task.description.includes(task.executionContext.workingDirectory)) {
      return true;
    }

    // Adapt if previous file creation succeeded and current task should build on it
    if (task.executionContext?.filesCreated?.length > 0 && 
        task.toolsRequired?.includes('write_file') &&
        !task.description.includes('relative to')) {
      return true;
    }

    return false;
  }

  /**
   * Check if execution results contain directory-related errors
   */
  hasDirectoryErrors(executionResults) {
    return executionResults.some(result => 
      result.is_error && (
        result.content?.includes('No such file or directory') ||
        result.content?.includes('directory not found') ||
        result.content?.includes('cannot create') ||
        result.content?.includes('permission denied')
      )
    );
  }

  /**
   * Generate an adapted version of the task using LLM
   */
  async generateAdaptedTask(originalTask, executionResults) {
    const contextInfo = {
      workingDirectory: originalTask.executionContext?.workingDirectory,
      filesCreated: originalTask.executionContext?.filesCreated || [],
      lastResults: originalTask.executionContext?.lastToolResults || [],
      errors: executionResults.filter(r => r.is_error).map(r => r.content)
    };

    const adaptationPrompt = `TASK ADAPTATION REQUEST

Original Task: ${originalTask.description}
Tools Required: ${originalTask.toolsRequired?.join(', ')}
Expected Outcome: ${originalTask.expectedOutcome}

EXECUTION CONTEXT:
- Working Directory: ${contextInfo.workingDirectory || 'Not determined'}
- Files Created: ${contextInfo.filesCreated.join(', ') || 'None'}
- Recent Errors: ${contextInfo.errors.join('; ') || 'None'}

ADAPTATION NEEDED:
The task execution context has changed or errors occurred. Please rewrite the task description to:
1. Use the correct working directory if one was discovered
2. Reference files that were already created
3. Fix any directory or path issues that caused errors
4. Maintain the same goal but adapt the approach

Provide ONLY the adapted task description (no explanation):`;

    try {
      const response = await this.callLLM([
        { role: 'user', content: adaptationPrompt }
      ], [], { 
        timeout: 15000,
        process: 'task_adaptation',
        stage: 'rewrite_task'
      });

      const adaptedDescription = this.context.llmClient.extractTextResponse(response).trim();
      
      if (adaptedDescription && adaptedDescription.length > 10) {
        return {
          ...originalTask,
          description: adaptedDescription,
          executionContext: {
            ...originalTask.executionContext,
            adaptable: true // Keep adaptable for future changes
          }
        };
      }
    } catch (error) {
      this.debug(`⚠️ Task adaptation failed: ${error.message}`);
    }

    return null;
  }

  /**
   * Clean execution results to remove internal context before sending to client
   */
  cleanExecutionResults(executionResults) {
    const cleaned = {
      ...executionResults,
      completedTasks: executionResults.completedTasks.map(taskData => ({
        task: {
          ...taskData.task,
          // Remove internal execution context from task
          executionContext: undefined
        },
        result: {
          ...taskData.result,
          // Remove internal context fields from result
          _internalContext: undefined,
          executionContext: undefined
        },
        timestamp: taskData.timestamp
      })),
      failedTasks: executionResults.failedTasks.map(taskData => ({
        task: {
          ...taskData.task,
          // Remove internal execution context from task
          executionContext: undefined
        },
        error: taskData.error,
        result: taskData.result ? {
          ...taskData.result,
          // Remove internal context fields from result
          _internalContext: undefined,
          executionContext: undefined
        } : undefined,
        timestamp: taskData.timestamp
      }))
    };
    
    return cleaned;
  }

  /**
   * DYNAMIC TASK GENERATION: Use goal-aware task generator or fallback to error-based generation
   * based on execution results and discovered gaps
   */
  async generateDynamicTasks(completedTask, taskResult, existingTasks) {
    try {
      // First, try goal-aware task generation if we have the original goal
      const originalGoal = this.context?.getSharedData('originalGoal') || 
                          this.context?.originalMessage;
      const completedTasks = this.context?.getSharedData('completedTasks') || [];
      
      if (this.goalAwareTaskGenerator && originalGoal && completedTasks.length > 0) {
        this.debug("🎯 Attempting goal-aware task generation...");
        
        // Build current state from context
        const currentState = {
          files: this.context?.projectStructure?.files || [],
          directories: this.context?.projectStructure?.directories || [],
          verified: this.context?.projectStructure?.verified || false,
          cachedFiles: this.context?.getAllCachedFiles ? 
            Array.from(this.context.getAllCachedFiles().keys()) : []
        };
        
        // Check if goal has already been achieved
        if (this.goalAwareTaskGenerator.isGoalAchieved(originalGoal, currentState, completedTasks)) {
          this.debug("🎉 Goal appears to be achieved - no new tasks needed");
          return [];
        }
        
        const existingPlan = this.context?.getSharedData('initialPlan');
        
        // Use goal-aware task generation
        const goalAwareTasks = await this.goalAwareTaskGenerator.generateTasksFromGapAnalysis({
          originalGoal,
          completedTasks: [...completedTasks, { 
            task: completedTask, 
            result: taskResult 
          }],
          currentState,
          existingPlan,
          maxNewTasks: 3  // Limit to avoid overwhelming the system
        });
        
        if (goalAwareTasks && goalAwareTasks.length > 0) {
          this.debug(`🎯 Goal-aware generator created ${goalAwareTasks.length} strategic tasks`);
          
          // Also check if we should add verification tasks
          const verificationTasks = this.goalAwareTaskGenerator.generateVerificationTasks(
            currentState
          );
          
          if (verificationTasks && verificationTasks.length > 0) {
            this.debug(`✅ Adding ${verificationTasks.length} verification tasks`);
            return [...goalAwareTasks, ...verificationTasks];
          }
          
          return goalAwareTasks;
        }
      }
      
      // Fallback to error-based task generation for immediate issues
      this.debug("🔧 Using error-based task generation for immediate issues...");
      
      const systemPrompt = `You are an intelligent task execution analyzer. Your role is to examine completed tasks and their results to identify missing dependencies, failed operations, or logical gaps that require additional tasks.

ANALYSIS APPROACH:
1. Review the completed task and its actual results
2. Identify specific failures, missing files, or incomplete operations
3. Detect referenced but missing dependencies (files, packages, configurations)
4. Generate precise, actionable follow-up tasks to address gaps
5. Avoid duplicating existing tasks

TASK GENERATION RULES:
- Only generate tasks for actual problems/gaps found in results
- Be specific about file paths, commands, and expected outcomes
- Set appropriate priorities (high for blocking issues, medium for enhancements)
- Include context about why each task is needed
- Return empty array if no additional tasks are needed

Response format: JSON array of task objects with:
{
  "id": "unique-task-id",
  "description": "specific task description", 
  "priority": "high|medium|low",
  "toolsRequired": ["tool1", "tool2"],
  "expectedOutcome": "what this task should accomplish",
  "context": {
    "reason": "why this task is needed",
    "parentTaskId": "parent-task-id"
  }
}`;

      const analysisPrompt = `TASK EXECUTION ANALYSIS

COMPLETED TASK:
- ID: ${completedTask.id}
- Description: ${completedTask.description}
- Tools Used: ${taskResult.toolCalls?.map(tc => tc.name).join(', ') || 'None'}

EXECUTION RESULTS:
${this.formatTaskResultsForLLM(taskResult)}

FILE CREATION SUMMARY:
${this.validateFileCreationPaths(taskResult).length > 0 ? 
  this.validateFileCreationPaths(taskResult).join('\n') : 
  'No files were created in this task'}

EXISTING TASKS (avoid duplicates):
${existingTasks.map(t => `- ${t.description}`).join('\n')}

ANALYSIS REQUIRED:
Examine the task results for:
1. Failed file operations or missing files referenced in results
2. Files created in wrong directories (e.g., index.html at root instead of /client/index.html)
3. Empty directories that should contain files
4. Database errors or SQL issues that need fixing
5. Missing dependencies (package.json, node_modules, config files)
6. Incomplete implementations or logical gaps
7. Error messages indicating missing components
8. Verify that files mentioned in descriptions were actually created in the correct locations

SPECIAL ATTENTION:
- Check if HTML files are in /client/ directory
- Check if server files are in /server/ directory
- Check if Python scripts are in /data-pipeline/ directory
- Check if CSS/JS files are in appropriate subdirectories

Generate follow-up tasks only for actual problems found. If everything looks complete, return an empty array.`;

      const response = await this.callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: analysisPrompt }
      ], [], {
        timeout: 20000,
        process: 'dynamic_task_generation',
        stage: 'llm_analysis'
      });

      const responseText = this.context.llmClient.extractTextResponse(response);
      
      // Parse JSON response
      let dynamicTasks = [];
      try {
        // Extract JSON from response (handle cases where LLM adds extra text)
        let jsonText = responseText.trim();
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        
        const parsedTasks = JSON.parse(jsonText);
        
        if (Array.isArray(parsedTasks)) {
          // Validate and enhance each task
          dynamicTasks = parsedTasks.map((task, index) => ({
            ...task,
            id: task.id || `dynamic-${Date.now()}-${index}`,
            dependencies: task.dependencies || [],
            dynamicallyGenerated: true,
            parentTaskId: completedTask.id,
            context: {
              ...task.context,
              parentTaskId: completedTask.id,
              generatedAt: new Date().toISOString()
            }
          }));
          
          this.debug(`🤖 LLM generated ${dynamicTasks.length} dynamic tasks for task ${completedTask.id}`);
        }
      } catch (parseError) {
        this.debug(`⚠️ Failed to parse LLM response for dynamic tasks: ${parseError.message}`);
        this.debug(`LLM Response: ${responseText.substring(0, 200)}...`);
      }

      return dynamicTasks;
      
    } catch (error) {
      this.debug(`⚠️ Dynamic task generation failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Build comprehensive context for LLM task analysis
   */
  buildTaskAnalysisContext(completedTask, taskResult, existingTasks) {
    return {
      task: {
        id: completedTask.id,
        description: completedTask.description,
        toolsRequired: completedTask.toolsRequired || [],
        expectedOutcome: completedTask.expectedOutcome || "Not specified"
      },
      results: {
        toolCalls: taskResult.toolCalls?.length || 0,
        toolResults: taskResult.toolResults?.length || 0,
        hasErrors: taskResult.toolResults?.some(r => r.is_error) || false,
        summary: taskResult.summary || "No summary provided"
      },
      existingTaskCount: existingTasks.length
    };
  }

  /**
   * Format task results for LLM analysis
   */
  formatTaskResultsForLLM(taskResult) {
    if (!taskResult) return "No results available";
    
    let formattedResults = [];
    
    // Add summary if available
    if (taskResult.summary) {
      formattedResults.push(`SUMMARY: ${taskResult.summary}`);
    }
    
    // Format tool calls and results
    if (taskResult.toolCalls && taskResult.toolResults) {
      const toolPairs = taskResult.toolCalls.map(call => {
        const result = taskResult.toolResults.find(r => r.tool_call_id === call.id);
        const resultText = result ? this.extractToolResultText(result) : 'No result';
        const status = result?.is_error ? 'ERROR' : 'SUCCESS';
        
        return `TOOL: ${call.name}
INPUT: ${JSON.stringify(call.input, null, 2)}
STATUS: ${status}
OUTPUT: ${resultText.substring(0, 500)}${resultText.length > 500 ? '...' : ''}`;
      });
      
      formattedResults.push(...toolPairs);
    }
    
    // Add any additional facts or context
    if (taskResult.facts && taskResult.facts.length > 0) {
      formattedResults.push(`FACTS GATHERED: ${taskResult.facts.join(', ')}`);
    }
    
    return formattedResults.join('\n\n') || "No detailed results available";
  }
}
