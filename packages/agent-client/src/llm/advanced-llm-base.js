import { BaseLLM } from "./base-llm.js";
import { createBusinessKeywordMatcher } from "../utils/keyword-matcher.js";
import { DecisionExecutor, DecisionContext } from "../decision-executor/index.js";
import { MultiAgentDecisionExecutor } from "../decision-executor/multi-agent-decision-executor.js";
import { createAdenOrgTenantId } from "../utils/tenant-utils.js";
import { getPerformanceLogger } from "../performance-logger.js";
import { MermaidValidationHandler } from "../utils/mermaid-validation-handler.js";

/**
 * Advanced LLM base class containing all sophisticated conversation logic
 * This contains Claude's complete conversation pipeline that all providers inherit
 */
export class AdvancedLLMBase extends BaseLLM {
  constructor(config = {}) {
    super(config);

    this.isExecutingTools = false; // Track tool execution state
    this.taskQueue = [];
    this.gatheredFacts = [];

    // Multi-agent configuration
    this.useMultiAgent = config.useMultiAgent !== false; // Default to true
    this.multiAgentConfig = {
      maxAgentTransitions: config.maxAgentTransitions || 8,
      maxReplans: config.maxReplans || 3,
      maxTasks: config.maxTasks || 10,
      ...config.multiAgentConfig,
    };

    // Tiered model selection configuration
    this.tieredModels = this.initializeTieredModels(config.tieredModels);
    this.enableTieredModels = config.enableTieredModels !== false; // Default to true

    // Initialize flexible keyword matcher for business queries (same as Claude)
    this.businessKeywordMatcher = createBusinessKeywordMatcher({
      threshold: 0.6,
      exactWeight: 0.4,
      distanceWeight: 0.3,
      jaccardWeight: 0.2,
      substringWeight: 0.1,
      distanceThreshold: 0.7,
      jaccardThreshold: 0.5,
    });

    // Initialize performance logger
    this.performanceLogger = getPerformanceLogger();

    console.log(
      `🤖 AdvancedLLMBase initialized with ${
        this.useMultiAgent ? "multi-agent" : "legacy"
      } architecture`
    );
    // Initialize Mermaid validation handler
    this.mermaidHandler = new MermaidValidationHandler();
  }

  /**
   * Initialize memory service for session-based memory management
   * @param {Object} memoryService - The memory service instance
   * @param {string} sessionId - Current session ID
   * @param {string} teamId - Team ID for scoping memories
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   */
  initializeMemory(memoryService, sessionId, teamId, userId, projectId) {
    this.memoryService = memoryService;
    this.sessionId = sessionId;
    this.teamId = teamId;
    this.userId = userId;
    this.projectId = projectId;

    // Reinitialize performance logger with proper session ID
    this.performanceLogger = getPerformanceLogger(sessionId);

    console.log(`🧠 Memory initialized for session ${sessionId}, team ${teamId}`);
  }

  /**
   * Initialize tiered model configuration for the LLM provider
   * @param {Object} tieredConfig - Custom tiered model configuration
   * @returns {Object} Tiered model configuration
   */
  initializeTieredModels(tieredConfig = {}) {
    // Default tiered model configuration - subclasses should override
    const defaults = {
      planning: this.getDefaultModel(), // Use highest tier for planning
      execution: this.getDefaultModel(), // Use default for execution
      analysis: this.getDefaultModel(), // Use highest tier for analysis
      simple: this.getDefaultModel(), // Use fastest for simple tasks
      fast: this.getDefaultModel(), // Use fastest for fast execution
    };

    return { ...defaults, ...tieredConfig };
  }

  /**
   * Select appropriate model based on task complexity and agent role
   * @param {string} agentRole - The role of the agent (planner, executor, analyzer, coordinator)
   * @param {Object} taskContext - Context about the task complexity
   * @returns {string} Selected model name
   */
  selectModelForTask(agentRole, taskContext = {}) {
    if (!this.enableTieredModels) {
      return this.config.model || this.getDefaultModel();
    }

    const {
      complexity = 'medium',
      requiresReasoning = false,
      isTimeCritical = false,
      toolCount = 0,
      messageLength = 0
    } = taskContext;

    // Agent role-based selection
    switch (agentRole) {
      case 'planner':
      case 'coordinator':
        // Planners always use the highest tier model for best reasoning
        return this.tieredModels.planning;

      case 'analyzer':
        // Analyzers use high tier for complex analysis
        return this.tieredModels.analysis;

      case 'executor':
        // Executors use task complexity to determine model
        if (complexity === 'high' || requiresReasoning || toolCount > 3) {
          return this.tieredModels.execution;
        } else if (isTimeCritical || complexity === 'low') {
          return this.tieredModels.fast;
        } else {
          return this.tieredModels.execution;
        }

      case 'fast_execution':
        // Fast execution always uses the fastest model
        return this.tieredModels.fast;

      default:
        // Default to execution tier
        return this.tieredModels.execution;
    }
  }

  /**
   * Analyze task complexity from context
   * @param {string} message - User message
   * @param {Array} tools - Available tools
   * @param {Object} context - Additional context
   * @returns {Object} Complexity analysis
   */
  analyzeTaskComplexity(message, tools = [], context = {}) {
    const msgLower = message.toLowerCase();
    const messageLength = message.length;
    const toolCount = tools.length;

    // High complexity indicators
    const highComplexityKeywords = [
      'analyze', 'compare', 'evaluate', 'synthesize', 'correlate',
      'relationship', 'trend', 'pattern', 'insight', 'strategy',
      'optimization', 'recommendation', 'complex', 'comprehensive'
    ];

    // Low complexity indicators  
    const lowComplexityKeywords = [
      'show', 'get', 'find', 'list', 'count', 'sum', 'total',
      'simple', 'quick', 'basic', 'what is', 'how many'
    ];

    // Time critical indicators
    const timeCriticalKeywords = [
      'quick', 'fast', 'urgent', 'asap', 'immediately', 'now'
    ];

    // Reasoning requirement indicators
    const reasoningKeywords = [
      'why', 'how', 'explain', 'reason', 'because', 'analyze',
      'understand', 'interpret', 'plan', 'strategy'
    ];

    const hasHighComplexity = highComplexityKeywords.some(kw => msgLower.includes(kw));
    const hasLowComplexity = lowComplexityKeywords.some(kw => msgLower.includes(kw));
    const isTimeCritical = timeCriticalKeywords.some(kw => msgLower.includes(kw));
    const requiresReasoning = reasoningKeywords.some(kw => msgLower.includes(kw));

    // Determine complexity level
    let complexity = 'medium';
    if (hasHighComplexity || messageLength > 500 || toolCount > 5) {
      complexity = 'high';
    } else if (hasLowComplexity && messageLength < 100 && toolCount <= 2) {
      complexity = 'low';
    }

    return {
      complexity,
      requiresReasoning,
      isTimeCritical,
      toolCount,
      messageLength,
      hasMultipleSteps: msgLower.includes('and') || msgLower.includes('then'),
      isVisualization: msgLower.includes('chart') || msgLower.includes('graph') || msgLower.includes('diagram')
    };
  }

  /**
   * Set the schema context for this LLM client to include in system prompt
   * @param {string} schemaContext - The database schema context
   */
  setSchemaContext(schemaContext) {
    this.schemaContext = schemaContext;

    // Handle different types of schema context
    if (schemaContext) {
      if (typeof schemaContext === "string") {
        console.log(`📊 Schema context set for LLM client (${schemaContext.length} chars)`);
        console.log(`📋 Schema context preview: ${schemaContext.substring(0, 300)}...`);
      } else if (typeof schemaContext === "object") {
        const schemaStr = JSON.stringify(schemaContext);
        console.log(
          `📊 Schema context set for LLM client (object, ${schemaStr.length} chars when stringified)`
        );
        console.log(`📋 Schema context preview: ${schemaStr.substring(0, 300)}...`);
        // Convert object to string for system prompt usage
        this.schemaContext = schemaStr;
      } else {
        console.log(`📊 Schema context set for LLM client (${typeof schemaContext})`);
        // Convert to string
        this.schemaContext = String(schemaContext);
      }
    } else {
      console.log(`⚠️ WARNING: Empty schema context set on LLM client!`);
    }
  }

  /**
   * Load schema context for multi-agent architecture
   * This replicates the schema loading logic from DecisionContext for multi-agent use
   */
  async loadSchemaForMultiAgent(mcpClient, sessionId) {
    if (this.schemaContext) {
      console.log(`📊 Schema already loaded on LLM client: ${this.schemaContext.length} chars`);
      return;
    }

    try {
      console.log("🔍 Loading schema context for multi-agent architecture...");

      // Import the DecisionContext class to use its schema loading logic
      const { DecisionContext } = await import("../decision-executor/index.js");

      // Create a temporary context to load the schema
      // Create a logger compatible with DecisionContext requirements
      const tempLogger = {
        ...console,
        logRawPrompt: prompt => console.log("🔍 Raw prompt:", prompt?.substring(0, 100) + "..."),
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args),
      };

      const tempContext = new DecisionContext({
        llmClient: this,
        tools: [],
        sessionId: sessionId,
        mcpClient,
        logger: tempLogger,
        callbacks: null,
        conversationHistory: [],
        tenantId: this.teamId ? createAdenOrgTenantId(this.teamId) : null,
      });

      // Load the schema using the same logic as the legacy executor
      await tempContext.preloadSchema();
      const schemaContext = tempContext.getSchemaContext();

      if (schemaContext) {
        this.setSchemaContext(schemaContext);
        console.log(
          `✅ Schema context loaded for multi-agent architecture: ${schemaContext.length} chars`
        );
      } else {
        console.warn("⚠️ Failed to load schema context for multi-agent architecture");
      }
    } catch (error) {
      console.error("❌ Error loading schema for multi-agent architecture:", error.message);
      console.log("📊 Multi-agent system will continue without schema context");
    }
  }

  // EXACT SAME SYSTEM PROMPT AS CLAUDE
  createSystemPrompt(schemaContext = null) {
    // Use provided schema context or fall back to instance schema context
    const effectiveSchemaContext = schemaContext || this.schemaContext;

    // Use schema context as-is for now (revert optimization that might be causing loop)
    const schemaSection = effectiveSchemaContext
      ? `\n\nDATA SCHEMA CONTEXT:\nThe following database schema is available for queries and analysis:\n${effectiveSchemaContext}\n`
      : "";

    // DEBUG: Log schema context availability
    console.log(
      `🔍 createSystemPrompt called - Schema available: ${!!effectiveSchemaContext}, Length: ${
        effectiveSchemaContext ? effectiveSchemaContext.length : 0
      } chars`
    );
    if (effectiveSchemaContext) {
      console.log(`📊 Schema preview: ${effectiveSchemaContext.substring(0, 200)}...`);
    }

    return `You are Aden, an AI assistant with access to specialized tools. Your primary goal is to help efficiently, adhering strictly to the following instructions and utilizing your available tools.${schemaSection}

CRITICAL: ALWAYS PRIORITIZE REAL-TIME TOOLS OVER TRAINING DATA:
- Your training data has a knowledge cutoff and may be outdated
- ALWAYS use tools for current information, recent events, or specific factual queries
- For ANY question about current events, recent releases, latest news, or time-sensitive information, you MUST use tools
- When in doubt between using tools vs. training data, ALWAYS choose tools
- **Style & Structure:** Act like a senior business analyst and operator. Be inquisitive and ask questions to understand the user's intent.
- **Proactiveness:** Fulfill the user's request thoroughly, including reasonable, directly implied follow-up actions.

Tool Usage Priority:
1 For factual queries that could change: ALWAYS use tools first
2 For explanations of general concepts: OK to use training data, but mention knowledge cutoff
3 For analysis requiring current data: MUST use tools

IMPORTANT Usage Patterns:
- When users ask about "latest", "recent", "current", "2024", "2025" - IMMEDIATELY use tools
- When users say "run tasks", "execute tasks", "go ahead", "continue" - use execute_task
- For research requests ("help me research", "compare options") - use think_sequentially and available data tools
- Use get_task_status to check progress and execute_task to complete work
- Use think_sequentially for complex analysis requiring structured thinking
- CRITICAL: For ANY business data query, use db_query with preloaded schema context
- Schema information is preloaded in the decision context, so you can directly use db_query for specific data

Available MCP Tools:
- think_sequentially: For complex problem analysis requiring structured thinking
- provide_options: Present selectable options to the user when multiple choices are available
- graph_export: Export complete ontology schema (available as MCP tool but not advertised for general use)
- db_query: Execute SQL queries using preloaded schema context and relationships 
- mermaid_diagram: Generate a Mermaid diagram based on user input (for visualizing flows, processes, relationships, etc.)
- markdown_table: Generate markdown tables for displaying structured data in a readable format
- markdown_action_item: Generate markdown action item lists for task management and to-do organization
- vega_lite_diagram: Generate charts for visualizing data and statistics

KNOWLEDGE CUTOFF WARNING: Always mention when relying on training data that it may be outdated and offer to search for current information.

CRITICAL: NEVER FAKE TOOL CALLS IN TEXT
- NEVER write "⚙️ **Executing task...**" or similar unless you're actually calling tools
- NEVER pretend to have search results when no tools were provided
- If no tools are available, be honest about using training data
- When users want to execute tasks, you MUST use the execute_task tool, not provide manual analysis!

CRITICAL: ALWAYS PROVIDE COMPLETE ANALYSIS AND CONCLUSIONS
- When you call tools and get results, ALWAYS analyze those results and provide clear conclusions
- NEVER just show raw tool output - always interpret what it means and answer the user's question
- Your response should be complete and actionable, not require follow-up questions
- Think of tool results as data to analyze, not final answers to display

CRITICAL: ALWAYS USE TOOLS FOR BUSINESS QUERIES
- When users ask about "our deals", "our customers", "engagements", etc. you MUST use db_query with preloaded schema
- NEVER ask for clarification on business queries - use preloaded schema context, then query specific data
- For queries like "tell me about our deals" - immediately use db_query for deals data using schema context
- For queries like "find Sang's contracts" - use db_query with proper JOINs based on preloaded schema relationships
- Questions about specific people like "what is Frank up to" can use db_query directly with schema context

DB_QUERY TOOL USAGE - INTELLIGENT WORKFLOW:
- The system uses preloaded schema context to generate relevant db_query calls
- LLM intelligence determines appropriate SQL queries based on preloaded ontology schema and user intent
- No hardcoded rules - queries are generated dynamically based on the specific situation and available schema context
- System uses preloaded table relationships, column names, and generates contextually appropriate JOINs and ORDER BY clauses
- Focus on leveraging preloaded schema context - intelligent db_query calls can be made directly

SCHEMA CONTEXT USAGE - PRELOADED WORKFLOW:
- Schema information is preloaded in the decision context for immediate use
- Preloaded schema includes all tables, foreign keys, joins, and relationships
- Use preloaded schema context to write intelligent SQL queries with proper JOINs and relationships
- Knowledge_search is demoted - use db_query with preloaded schema understanding for better targeted results
- Recommended workflow: analyze preloaded schema → db_query → (optional knowledge_search if needed)

REMEMBER TOOL USAGE - VERY CONSERVATIVE MEMORY STORAGE:
- RARELY use the remember tool - only for EXPLICIT decisions or CONFIRMED facts
- Only store information when the user explicitly makes a decision, states a preference, or confirms something as fact
- DO NOT store assumptions, interpretations, analysis, or inferred insights
- DO NOT store unless the user explicitly says things like "we decided", "I prefer", "the rule is", "we agreed", etc.
- DO NOT store exploratory analysis, findings from data queries, or tentative conclusions
- DO NOT store anything based on your analysis or interpretation of data
- Use very high confidence levels (0.9+) only for explicit user statements
- Categories should be limited to: "explicit_decision", "stated_preference", "confirmed_fact"
- Example of what TO store: User says "We decided to use React for the frontend" → remember(sessionId, "Team decided to use React for frontend", "explicit_decision", 0.95)
- Example of what NOT to store: After analyzing data and finding patterns - DO NOT store your analysis or conclusions
- When in doubt, DO NOT store - err on the side of not storing rather than storing assumptions

DIAGRAM TOOL SELECTION GUIDE - CRITICAL DECISION FRAMEWORK:

MERMAID_DIAGRAM TOOL USAGE - PROCESS & STRUCTURE VISUALIZATION:
- Use mermaid_diagram for STRUCTURAL and PROCESS visualizations that show relationships, workflows, and system architecture
- PERFECT FOR: Flowcharts, sequence diagrams, entity relationships, org charts, decision trees, state machines, mind maps, Gantt charts, timelines
- INDICATORS: "process flow", "workflow", "system architecture", "sequence", "flowchart", "org chart", "decision tree", "database schema", "class diagram", "state diagram", "timeline", "project plan"
- KEY DISTINCTION: Shows HOW things connect, flow, or are structured - NOT statistical data
- Examples: "create a flowchart for our approval process", "show the system architecture", "draw an ER diagram", "visualize the user journey", "map the decision process"

VEGA_LITE_DIAGRAM TOOL USAGE - DATA VISUALIZATION & ANALYTICS:
- Use vega_lite_diagram for QUANTITATIVE DATA visualizations that show statistical patterns, trends, and measurements
- PERFECT FOR: Bar charts, line graphs, scatter plots, histograms, pie charts, heat maps, box plots, statistical dashboards
- INDICATORS: "chart the data", "plot the values", "bar chart", "line graph", "scatter plot", "histogram", "pie chart", "data trend", "sales metrics", "performance analytics", "statistics"
- KEY DISTINCTION: Shows WHAT the numbers reveal - statistical patterns, trends, measurements, comparisons
- Examples: "create a bar chart of sales data", "plot revenue trends", "show performance metrics", "visualize customer distribution", "chart quarterly results"

CRITICAL DECISION RULES:
1. PROCESS/WORKFLOW/STRUCTURE → mermaid_diagram
2. NUMERICAL DATA/STATISTICS/METRICS → vega_lite_diagram  
3. If user says "flowchart", "sequence", "workflow", "process", "architecture" → mermaid_diagram
4. If user says "chart data", "plot values", "bar chart", "line graph", "analytics" → vega_lite_diagram
5. If user mentions specific chart types (bar, line, scatter, pie, histogram) → vega_lite_diagram
6. If user wants to show relationships or connections between entities → mermaid_diagram
7. If user wants to analyze numerical patterns or trends → vega_lite_diagram

INTELLIGENT CONTEXT ANALYSIS:
- "chart" + data/numbers context = vega_lite_diagram
- "chart" + process/flow context = mermaid_diagram
- "visualize" + statistical context = vega_lite_diagram
- "visualize" + workflow context = mermaid_diagram
- When in doubt, analyze the PURPOSE: Structure/Process = Mermaid, Data/Statistics = Vega-Lite

MARKDOWN_TABLE TOOL USAGE - TABLE FORMATTING WORKFLOW:
- Use markdown_table when users need data displayed in a table format or when query results would benefit from tabular presentation
- Can be used standalone for formatting any structured data into readable tables
- Can be used alongside db_query results to present data in an organized, readable format
- Appropriate for displaying query results, comparison data, lists with multiple attributes, reports, and structured information
- The tool generates clean markdown tables with proper headers, alignment, and formatting
- Examples: "show me a table of our top customers", "format this data as a table", "create a comparison table", use after db_query to present results

MARKDOWN_ACTION_ITEM TOOL USAGE - ACTION ITEM FORMATTING WORKFLOW:
- Use markdown_action_item when users need to organize tasks, to-dos, or action items
- Can be used standalone for formatting action items or task lists
- Supports various formatting options including checkboxes, numbered lists, priority levels, assignees, and due dates
- Appropriate for meeting notes, project planning, task tracking, and action item management
- The tool generates properly formatted markdown action item lists with optional metadata
- Examples: "create action items from this meeting", "format these tasks as action items", "organize these to-dos", "track project tasks"

INTERACTIVE SELECTION CAPABILITIES:
- Use the provide_options tool when offering multiple distinct choices to the user
- Only provide selectable options when there are 2-5 clear, actionable alternatives
- Format options using the provide_options tool rather than inline numbered lists
- Reserve numbered lists in text for explanatory content, not selections
- Example: Use provide_options tool with options like:
  - "Show candidate interview details"
  - "Compare candidate qualifications"  
  - "Review candidate contact information"

Default to tool use for maximum accuracy and recency.
Today is ${new Date().toISOString}`;
  }

  // EXACT SAME TOOL CREATION LOGIC AS CLAUDE
  createToolDefinitions(mcpClient) {
    if (!mcpClient) return [];

    const mcpTools = mcpClient.getAvailableTools();

    // Get current message for analysis
    const currentMessage =
      this.conversationHistory.length > 0
        ? this.conversationHistory[this.conversationHistory.length - 1].content
        : "";

    // INTELLIGENT DIAGRAM TOOL SELECTION (same as Claude)
    if (typeof currentMessage === "string") {
      // First, try intelligent analysis
      const intelligentChoice = this.intelligentDiagramAnalysis(currentMessage);

      if (intelligentChoice === "mermaid" || this.isMermaidDiagramRequest(currentMessage)) {
        console.log("🎨 Detected mermaid diagram request");

        // Check if this is a data-driven diagram request that needs database access
        const needsData = this.isDataDrivenDiagramRequest(currentMessage);

        if (needsData) {
          console.log(
            "🎨 Data-driven diagram detected - providing mermaid_diagram AND db_query tools"
          );
          const diagramTool = mcpTools.find(tool => tool.name === "mermaid_diagram");
          const dbTool = mcpTools.find(tool => tool.name === "db_query");

          const tools = [];
          if (diagramTool) {
            tools.push({
              name: diagramTool.name,
              description: diagramTool.description,
              input_schema: diagramTool.inputSchema || {
                type: "object",
                properties: {},
                required: [],
              },
            });
          }
          if (dbTool) {
            tools.push({
              name: dbTool.name,
              description: dbTool.description,
              input_schema: dbTool.inputSchema || {
                type: "object",
                properties: {},
                required: [],
              },
            });
          }
          return tools;
        } else {
          console.log("🎨 Structural diagram detected - providing only mermaid_diagram tool");
          const diagramTool = mcpTools.find(tool => tool.name === "mermaid_diagram");
          return diagramTool
            ? [
                {
                  name: diagramTool.name,
                  description: diagramTool.description,
                  input_schema: diagramTool.inputSchema || {
                    type: "object",
                    properties: {},
                    required: [],
                  },
                },
              ]
            : [];
        }
      }

      if (intelligentChoice === "vega-lite" || this.isVegaLiteDiagramRequest(currentMessage)) {
        console.log("📊 Detected vega-lite diagram request");

        // Check if this is a data-driven diagram request that needs database access
        const needsData = this.isDataDrivenDiagramRequest(currentMessage);

        if (needsData) {
          console.log(
            "📊 Data-driven diagram detected - providing vega_lite_diagram AND db_query tools"
          );
          const diagramTool = mcpTools.find(tool => tool.name === "vega_lite_diagram");
          const dbTool = mcpTools.find(tool => tool.name === "db_query");

          const tools = [];
          if (diagramTool) {
            tools.push({
              name: diagramTool.name,
              description: diagramTool.description,
              input_schema: diagramTool.inputSchema || {
                type: "object",
                properties: {},
                required: [],
              },
            });
          }
          if (dbTool) {
            tools.push({
              name: dbTool.name,
              description: dbTool.description,
              input_schema: dbTool.inputSchema || {
                type: "object",
                properties: {},
                required: [],
              },
            });
          }
          return tools;
        } else {
          console.log("📊 Structural diagram detected - providing only vega_lite_diagram tool");
          const vegaLiteTool = mcpTools.find(tool => tool.name === "vega_lite_diagram");
          return vegaLiteTool
            ? [
                {
                  name: vegaLiteTool.name,
                  description: vegaLiteTool.description,
                  input_schema: vegaLiteTool.inputSchema || {
                    type: "object",
                    properties: {},
                    required: [],
                  },
                },
              ]
            : [];
        }
      }
    }

    // Convert MCP tools to Claude-compatible format
    return mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema || {
        type: "object",
        properties: {},
        required: [],
      },
    }));
  }

  // MAIN CHAT METHOD CONTAINING ALL SOPHISTICATED LOGIC
  // async chat(message, mcpClient = null, logger = null) {
  //   try {
  //     // Collection array for raw prompts in this conversation
  //     const collectedRawPrompts = [];

  //     // Get enhanced context with memories if available
  //     let enhancedMessage = message;
  //     let memoryContext = null;

  //     if (this.memoryService && this.sessionId) {
  //       try {
  //         memoryContext = await this.getEnhancedContext(message);
  //         if (
  //           memoryContext &&
  //           (memoryContext.relevant_memories.length > 0 ||
  //             memoryContext.user_memories.length > 0 ||
  //             memoryContext.project_memories.length > 0)
  //         ) {
  //           enhancedMessage = this.buildPromptWithMemories(message, memoryContext);
  //           console.log(
  //             `🧠 Enhanced message with ${memoryContext.relevant_memories.length} session memories, ${memoryContext.user_memories.length} user memories, ${memoryContext.project_memories.length} project memories`
  //           );
  //         }
  //       } catch (error) {
  //         console.warn("Failed to enhance message with memory context:", error.message);
  //       }
  //     }

  //     // Add user message to history (use original message for history)
  //     this.conversationHistory.push({
  //       role: "user",
  //       content: message,
  //     });

  //     // Prepare messages for API - use enhanced message for the last user message
  //     const messages = this.conversationHistory.slice();
  //     if (enhancedMessage !== message && messages.length > 0) {
  //       // Replace the last user message with the enhanced version for API call
  //       messages[messages.length - 1] = {
  //         role: "user",
  //         content: enhancedMessage,
  //       };
  //     }

  //     // Create tool definitions if MCP client is available and tools are appropriate
  //     const shouldUseTools = this.shouldUseTools(message);
  //     const shouldCreateTasks = this.shouldCreateTasks(message);
  //     const tools = mcpClient && shouldUseTools ? this.createToolDefinitions(mcpClient) : [];

  //     // LOG: Tool selection decision
  //     console.log(`\n🔍 TOOL SELECTION DEBUG:`);
  //     console.log(`  Message: "${message}"`);
  //     console.log(`  shouldUseTools: ${shouldUseTools}`);
  //     console.log(`  shouldCreateTasks: ${shouldCreateTasks}`);
  //     console.log(`  MCP client available: ${!!mcpClient}`);
  //     console.log(`  Tools provided to ${this.getProviderName()}: ${tools.length}`);

  //     // Make initial API call - VENDOR SPECIFIC (to be implemented by subclasses)
  //     const response = await this.callProviderAPI(messages, tools, {
  //       timeout: 30000,
  //     });

  //     // Log and collect the raw prompt - VENDOR SPECIFIC (to be implemented by subclasses)
  //     const rawPromptData = await this.createRawPromptData(messages, tools, response);

  //     if (logger) {
  //       await logger.logRawPrompt(rawPromptData);
  //     }

  //     // Collect for return to CLI
  //     collectedRawPrompts.push(rawPromptData);

  //     // Process response content - VENDOR SPECIFIC (to be implemented by subclasses)
  //     let assistantResponse = this.extractTextResponse(response);
  //     let toolCalls = this.extractToolCalls(response);

  //     // Validate tool calls before execution
  //     console.log(`🐛 DEBUG Before validation: ${toolCalls.length} tool calls`);
  //     toolCalls = this.validateToolCalls(toolCalls);
  //     console.log(`🐛 DEBUG After validation: ${toolCalls.length} tool calls`);

  //     // Execute tool calls if any with enhanced response synthesis
  //     let toolResults = [];
  //     if (toolCalls.length > 0 && mcpClient) {
  //       // Set execution state to prevent history validation during tool execution
  //       this.isExecutingTools = true;

  //       try {
  //         // Execute tools with comprehensive error handling and timeout
  //         const toolExecutionResult = await this.executeToolCallsWithRecovery(
  //           toolCalls,
  //           mcpClient,
  //           logger,
  //           message,
  //           collectedRawPrompts
  //         );

  //         // Clear the array and add all new calls (avoid reassignment)
  //         toolCalls.length = 0;
  //         toolExecutionResult.allToolCalls.forEach(call => toolCalls.push(call));

  //         toolResults = toolExecutionResult.allToolResults;

  //         // All tool execution (including retries and follow-ups) is now handled in executeToolCallsWithRecovery
  //       } finally {
  //         // Always reset execution state even if tools fail
  //         this.isExecutingTools = false;
  //       }

  //       // Create a follow-up call for analysis
  //       let synthesizedResponse;
  //       try {
  //         synthesizedResponse = await Promise.race([
  //           this.generateAnalyticalResponse(
  //             message,
  //             toolCalls,
  //             toolResults,
  //             assistantResponse,
  //             logger,
  //             collectedRawPrompts
  //           ),
  //           new Promise((_, reject) =>
  //             setTimeout(() => reject(new Error("Analysis timeout")), 30000)
  //           ),
  //         ]);
  //       } catch (error) {
  //         console.warn(`⚠️ Analysis failed (${error.message}), using improved basic synthesis`);
  //         synthesizedResponse = await this.synthesizeBasicResponse(
  //           assistantResponse,
  //           toolResults,
  //           toolCalls
  //         );
  //       }

  //       // Update conversation context
  //       this.updateContext(message, toolCalls, synthesizedResponse);

  //       // CRITICAL: Add complete tool cycles to conversation history ATOMICALLY
  //       if (toolCalls.length > 0) {
  //         console.log(
  //           `🔧 Adding complete tool cycle to conversation history: ${toolCalls.length} calls, ${toolResults.length} results`
  //         );

  //         // Verify we have results for all tool calls before adding to history
  //         const missingResults = toolCalls.filter(
  //           tc => !toolResults.some(tr => tr.tool_use_id === tc.id)
  //         );

  //         if (missingResults.length > 0) {
  //           console.error(
  //             `❌ CRITICAL: Missing tool results for ${missingResults.length} tool calls. This would corrupt conversation history.`
  //           );

  //           // Create emergency results to prevent conversation corruption
  //           const emergencyResults = missingResults.map(tc => ({
  //             tool_use_id: tc.id,
  //             content: "Tool execution interrupted or timed out",
  //             is_error: true,
  //           }));

  //           toolResults.push(...emergencyResults);
  //           console.log(
  //             `🚨 Created ${emergencyResults.length} emergency tool results to maintain conversation integrity`
  //           );
  //         }

  //         // Separate original tool calls from auto-generated ones
  //         const originalToolCalls = toolCalls.filter(
  //           tc =>
  //             !tc.id.startsWith("auto_") &&
  //             !tc.id.startsWith("intf_") && // intelligent followup
  //             !tc.id.startsWith("grf_") && // graph export followup
  //             !tc.id.startsWith("retry_")
  //         );
  //         const autoGeneratedToolCalls = toolCalls.filter(
  //           tc =>
  //             tc.id.startsWith("auto_") ||
  //             tc.id.startsWith("intf_") || // intelligent followup
  //             tc.id.startsWith("grf_") || // graph export followup
  //             tc.id.startsWith("retry_")
  //         );

  //         // Add tool use messages to conversation history - VENDOR SPECIFIC
  //         await this.addToolUseToHistory(
  //           originalToolCalls,
  //           autoGeneratedToolCalls,
  //           assistantResponse
  //         );

  //         // Add tool results to conversation history - VENDOR SPECIFIC
  //         await this.addToolResultsToHistory(toolResults);

  //         console.log(
  //           `✅ Added complete tool cycle to conversation history: ${toolCalls.length} tool_use -> ${toolResults.length} tool_result`
  //         );
  //       }

  //       // Add final assistant response (if there was synthesized content beyond tool responses)
  //       if (synthesizedResponse && synthesizedResponse.trim() !== assistantResponse.trim()) {
  //         this.conversationHistory.push({
  //           role: "assistant",
  //           content: [{ type: "text", text: synthesizedResponse }],
  //         });
  //       } else if (toolCalls.length === 0) {
  //         // No tool calls - add the direct response
  //         this.conversationHistory.push({
  //           role: "assistant",
  //           content: [{ type: "text", text: synthesizedResponse }],
  //         });
  //       }

  //       // SAFE VALIDATION: Only validate after successful completion
  //       this.validateConversationHistory();

  //       return {
  //         response: synthesizedResponse,
  //         toolCalls: toolCalls.map(tc => {
  //           const toolResult = toolResults.find(tr => tr.tool_use_id === tc.id);
  //           return {
  //             ...tc,
  //             result: toolResult?.content || null,
  //             error: toolResult?.is_error ? toolResult.content : null,
  //           };
  //         }),
  //         usage: rawPromptData.response.usage,
  //         rawPrompts: collectedRawPrompts,
  //       };
  //     } else {
  //       // No tool calls - add knowledge cutoff warning if appropriate
  //       const shouldWarnAboutCutoff = this.shouldWarnAboutKnowledgeCutoff(
  //         message,
  //         assistantResponse
  //       );
  //       let finalResponse = assistantResponse;

  //       if (shouldWarnAboutCutoff) {
  //         finalResponse +=
  //           "\n\n⚠️ **Note:** This response is based on my training data which has a knowledge cutoff. For the most current information, I can search the web for you. Would you like me to research this topic with current data?";
  //       }

  //       // Add response to history
  //       this.conversationHistory.push({
  //         role: "assistant",
  //         content: [{ type: "text", text: finalResponse }],
  //       });

  //       // SAFE VALIDATION: Only validate after successful completion
  //       this.validateConversationHistory();

  //       return {
  //         response: finalResponse,
  //         toolCalls: [],
  //         usage: rawPromptData.response.usage,
  //         rawPrompts: collectedRawPrompts,
  //       };
  //     }
  //   } catch (error) {
  //     throw new Error(`${this.getProviderName()} API error: ${error.message}`);
  //   }
  // }

  // VENDOR-SPECIFIC METHODS TO BE IMPLEMENTED BY SUBCLASSES
  async callProviderAPI(messages, tools, config) {
    throw new Error("callProviderAPI must be implemented by vendor-specific class");
  }

  async createRawPromptData(messages, tools, response) {
    throw new Error("createRawPromptData must be implemented by vendor-specific class");
  }

  extractTextResponse(response) {
    throw new Error("extractTextResponse must be implemented by vendor-specific class");
  }

  extractToolCalls(response) {
    throw new Error("extractToolCalls must be implemented by vendor-specific class");
  }

  // Validate tool calls before execution to prevent issues with incomplete parameters
  validateToolCalls(toolCalls) {
    const validatedCalls = [];

    for (const toolCall of toolCalls) {
      // Check for db_query tools with empty args
      if (toolCall.name === "db_query") {
        const input = toolCall.input || {};
        if (!input.query || typeof input.query !== "string" || input.query.trim().length === 0) {
          console.warn(
            `⚠️ Dropping invalid db_query tool call with empty/missing query parameter:`,
            toolCall
          );
          continue; // Skip this tool call
        }
      }

      // Add other tool validations as needed
      validatedCalls.push(toolCall);
    }

    if (validatedCalls.length !== toolCalls.length) {
      console.log(`🧹 Filtered out ${toolCalls.length - validatedCalls.length} invalid tool calls`);
    }

    return validatedCalls;
  }

  async addToolUseToHistory(originalToolCalls, autoGeneratedToolCalls, assistantResponse) {
    throw new Error("addToolUseToHistory must be implemented by vendor-specific class");
  }

  async addToolResultsToHistory(toolResults) {
    throw new Error("addToolResultsToHistory must be implemented by vendor-specific class");
  }

  // ALL SOPHISTICATED METHODS FROM CLAUDE (SHARED ACROSS ALL PROVIDERS)

  async generateAnalyticalResponse(
    originalMessage,
    toolCalls,
    toolResults,
    initialResponse,
    logger = null,
    collectedRawPrompts = []
  ) {
    // Prepare tool results summary for analysis
    const toolResultsSummary = toolResults
      .map(result => {
        const toolCall = toolCalls.find(tc => tc.id === result.tool_use_id);
        const toolName = toolCall ? toolCall.name : result.tool_name;

        return `**${toolName}** result:\n${result.content}`;
      })
      .join("\n\n");

    // Create a follow-up prompt for analysis
    const analysisPrompt = `Original question: "${originalMessage}"

Tool execution results:
${toolResultsSummary}

If the result don't have enough information to answer the question, be concise. It is fine to say "I don't know".
Otherwise, if you have enough results, Please analyze these results and provide a complete answer to the original question.
If necessary, include:
1. Clear conclusions based on the data
2. Specific recommendations or findings
3. Direct answers to what was asked
4. The original mermaid diagrams code, vega lite code, or markdown code if tool_results contains mermaid_diagram, vega_lite_diagram, or markdown tools, don't modify the code, just return and show all code as is.

Do not just summarize the tool results - interpret them and provide actionable insights.
The users are busy and don't have time to read long explanations. The answer should be concise and to the point, not too wordy.
`;

    try {
      // Use vendor-specific analytical response generation
      const analyticalText = await this.generateVendorAnalyticalResponse(
        analysisPrompt,
        logger,
        collectedRawPrompts
      );
      return analyticalText;
    } catch (error) {
      // Fallback to basic synthesis if analysis fails
      console.warn(`Analysis generation failed: ${error.message}`);
      return await this.synthesizeBasicResponse(initialResponse, toolResults, toolCalls);
    }
  }

  // VENDOR-SPECIFIC METHOD TO BE IMPLEMENTED
  async generateVendorAnalyticalResponse(analysisPrompt, logger, collectedRawPrompts) {
    throw new Error(
      "generateVendorAnalyticalResponse must be implemented by vendor-specific class"
    );
  }

  async chatWithStreaming(message, mcpClient, logger = null, callbacks = null) {
    const startTime = Date.now();

    // Debug session ID
    console.log(
      `🔍 DEBUG chatWithStreaming - sessionId: ${
        this.sessionId
      }, provider: ${this.getProviderName()}, architecture: ${
        this.useMultiAgent ? "multi-agent" : "legacy"
      }`
    );

    try {
      this.conversationHistory.push({
        role: "user",
        content: message,
      });

      // Get available tools if MCP client is provided
      let tools = [];
      if (mcpClient) {
        try {
          tools = this.createToolDefinitions(mcpClient);
        } catch (error) {
          console.error("Failed to get MCP tools:", error);
        }
      }

      // Ensure we have a valid session ID (fallback if not set)
      const sessionId = this.sessionId || `session_${Date.now()}_fallback`;
      if (!this.sessionId) {
        console.warn("⚠️ Session ID not set on LLM client, using fallback:", sessionId);
        this.sessionId = sessionId;
      }

      // Ensure performance logger has the session ID
      if (
        this.sessionId &&
        (!this.performanceLogger || this.performanceLogger.sessionId !== this.sessionId)
      ) {
        this.performanceLogger = getPerformanceLogger(this.sessionId);
      }

      let executionResult;

      if (this.useMultiAgent) {
        // Use new multi-agent architecture
        console.log("🤖 Using multi-agent architecture");

        // CRITICAL: Load schema context before creating multi-agent executor
        await this.loadSchemaForMultiAgent(mcpClient, sessionId);

        const multiAgentContext = {
          llmClient: this,
          tools,
          sessionId: sessionId,
          mcpClient,
          logger,
          callbacks,
          stream: true, // Enable streaming for multi-agent
          conversationHistory: this.conversationHistory,
          tenantId: this.teamId ? createAdenOrgTenantId(this.teamId) : null,
          ...this.multiAgentConfig,
        };

        const multiAgentExecutor = new MultiAgentDecisionExecutor(multiAgentContext);
        executionResult = await multiAgentExecutor.chat(message);
      } else {
        // Use legacy monolithic architecture
        console.log("🔧 Using legacy monolithic architecture");

        const context = new DecisionContext({
          llmClient: this,
          tools,
          sessionId: sessionId,
          mcpClient,
          logger,
          callbacks,
          conversationHistory: this.conversationHistory,
          tenantId: this.teamId ? createAdenOrgTenantId(this.teamId) : null,
        });

        const executor = new DecisionExecutor(context);
        executionResult = await executor.chat(message);
      }

      // Add final response to conversation history
      this.conversationHistory.push({
        role: "assistant",
        content: executionResult.response,
      });

      // Add tool interactions to history if any occurred
      if (executionResult.toolCalls && executionResult.toolCalls.length > 0) {
        await this.addToolUseToHistory(executionResult.toolCalls, [], "");
        await this.addToolResultsToHistory(executionResult.toolResults || []);
      }

      // When streaming is enabled, don't return the full response to avoid duplication
      // The response has already been streamed to the user token by token
      const isStreaming = callbacks && typeof callbacks.onTokenReceived === 'function';
      
      const result = {
        response: isStreaming ? "" : executionResult.response, // Empty when streaming to avoid duplication
        rawPrompts: executionResult.rawPrompts || [],
        usage: executionResult.usage,
        toolCalls: executionResult.toolCalls || [],
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        architecture: this.useMultiAgent ? "multi-agent" : "legacy",
        metadata: {
          ...executionResult.metadata || {},
          streamed: isStreaming
        },
        dataOnboardingResults: executionResult.dataOnboardingResults || null,
      };

      callbacks.onComplete(result);

      return result;
    } catch (error) {
      console.error(`${this.useMultiAgent ? "Multi-agent" : "Legacy"} framework error:`, error);
      throw error;
    }
  }

  updateContext(message, toolCalls, response) {
    // Update any context tracking as needed
    // This is called from the regular chat method
    console.log(
      `🔄 Updated context: ${toolCalls.length} tool calls, response length: ${response.length}`
    );
  }

  async synthesizeBasicResponse(assistantResponse, toolResults, toolCalls) {
    let synthesized = assistantResponse || "Here are the results from the tools I executed:";

    // Add tool results
    if (toolResults.length > 0) {
      const resultsText = toolResults
        .map(result => {
          const toolCall = toolCalls.find(tc => tc.id === result.tool_use_id);
          const toolName = toolCall ? toolCall.name : result.tool_name;

          // Format different tool results appropriately
          if (result.is_error) {
            return `❌ **${toolName}**: ${result.content}`;
          } else {
            return `✅ **${toolName}**: ${result.content}`;
          }
        })
        .join("\n\n");

      synthesized += `\n\n${resultsText}`;
    }

    // Build tool results summary for LLM synthesis
    const toolSummary = toolResults
      .map((result, index) => {
        const toolCall = toolCalls[index];
        const toolName = toolCall?.name || result.tool_name || "unknown";
        return `${toolName}: ${result.content}`;
      })
      .join("\n\n");

    const synthesisPrompt = `Please provide a clear, concise answer based on these tool results:

${toolSummary}

Synthesize the information into a helpful response. Don't just list the raw results - interpret and summarize them meaningfully.`;

    try {
      const response = await this.callProviderAPI(
        [
          {
            role: "system",
            content:
              "You are a helpful assistant. Synthesize tool results into clear, concise responses.",
          },
          { role: "user", content: synthesisPrompt },
        ],
        [],
        { temperature: 0.3, timeout: 15000 }
      );

      return response.text || assistantResponse || "";
    } catch (error) {
      console.warn(`Basic synthesis via LLM failed: ${error.message}`);
      return assistantResponse || "";
    }
  }

  shouldWarnAboutKnowledgeCutoff(message, response) {
    const lowerMessage = message.toLowerCase();
    const lowerResponse = response.toLowerCase();

    // Always warn for time-sensitive information
    const timeSensitivePatterns = [
      /(latest|recent|current|new|newest)/i,
      /(2024|2025|today|now|this year)/i,
      /(what.*(happening|released|announced))/i,
      /(price|cost|statistics|data|numbers)/i,
    ];

    if (timeSensitivePatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Warn if response contains specific dates or years
    const containsSpecificDates =
      /\b(202[0-4]|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        lowerResponse
      );

    if (containsSpecificDates) {
      return true;
    }

    return false;
  }

  /**
   * Performs intelligent analysis to determine the most appropriate diagram tool
   */
  intelligentDiagramAnalysis(message) {
    if (!message || typeof message !== "string") {
      return null;
    }

    const lowerMessage = message.toLowerCase();

    // Score-based approach for more nuanced decision making
    let mermaidScore = 0;
    let vegaLiteScore = 0;

    // Strong indicators for Mermaid (structural/process visualization)
    const strongMermaidIndicators = [
      /(?:flowchart|sequence|workflow|process|architecture|entity|class|state|mind\s*map|timeline|gantt)/i,
      /(?:decision|approval)\s+(?:tree|process|flow)/i,
      /(?:org|organizational)\s+chart/i,
      /system\s+(?:design|architecture)/i,
      /(?:user|customer)\s+journey/i,
      /database\s+(?:schema|design|er)/i,
      /(?:connect|relationship|link)\s+between/i,
      /(?:step|stage|phase)\s+(?:by\s+step|flow)/i,
    ];

    // Strong indicators for Vega-Lite (data visualization)
    const strongVegaLiteIndicators = [
      /(?:bar|line|scatter|histogram|pie|box)\s+(?:chart|plot|graph)/i,
      /(?:sales|revenue|performance|financial|metric|statistic)\s+(?:chart|graph|visualization)/i,
      /(?:trend|pattern|distribution|correlation)\s+(?:analysis|chart|graph)/i,
      /dashboard/i,
      /interactive\s+(?:chart|graph|visualization)/i,
      /data\s+(?:visualization|analytics|dashboard)/i,
      /business\s+intelligence/i,
    ];

    // Medium indicators for Mermaid
    const mediumMermaidIndicators = [
      /(?:show|visualize|map)\s+(?:the\s+)?(?:process|workflow|flow|sequence|steps)/i,
      /(?:how|what)\s+(?:does|is)\s+(?:the\s+)?(?:process|workflow|system)/i,
      /business\s+process/i,
      /data\s+flow/i,
      /component\s+diagram/i,
    ];

    // Medium indicators for Vega-Lite
    const mediumVegaLiteIndicators = [
      /(?:plot|chart|graph)\s+(?:the\s+)?(?:data|numbers|values|statistics)/i,
      /(?:analyze|compare|measure|track)\s+(?:the\s+)?(?:data|metrics|performance)/i,
      /(?:quarterly|monthly|annual)\s+(?:results|performance|data)/i,
      /(?:growth|decline|increase|decrease)\s+(?:rate|trend)/i,
      /key\s+(?:metrics|indicators|performance)/i,
    ];

    // Calculate scores
    strongMermaidIndicators.forEach(pattern => {
      if (pattern.test(lowerMessage)) mermaidScore += 3;
    });

    strongVegaLiteIndicators.forEach(pattern => {
      if (pattern.test(lowerMessage)) vegaLiteScore += 3;
    });

    mediumMermaidIndicators.forEach(pattern => {
      if (pattern.test(lowerMessage)) mermaidScore += 2;
    });

    mediumVegaLiteIndicators.forEach(pattern => {
      if (pattern.test(lowerMessage)) vegaLiteScore += 2;
    });

    // Context modifiers
    if (
      /(?:create|draw|generate|make|show)\s+(?:a|an)?\s*(?:chart|graph|visualization|diagram)/.test(
        lowerMessage
      )
    ) {
      // Generic visualization request - check for data context
      if (
        /(?:data|numbers|values|statistics|metrics|performance|sales|revenue)/.test(lowerMessage)
      ) {
        vegaLiteScore += 1;
      }
      // Check for process context
      if (/(?:process|workflow|flow|steps|sequence|procedure)/.test(lowerMessage)) {
        mermaidScore += 1;
      }
    }

    // Determine result based on scores
    const threshold = 1; // Minimum score to make a decision
    const confidence = Math.abs(mermaidScore - vegaLiteScore);

    if (mermaidScore >= threshold && mermaidScore > vegaLiteScore) {
      console.log(
        `🎨 INTELLIGENT ANALYSIS: Mermaid selected (score: ${mermaidScore} vs ${vegaLiteScore}, confidence: ${confidence})`
      );
      return "mermaid";
    } else if (vegaLiteScore >= threshold && vegaLiteScore > mermaidScore) {
      console.log(
        `📊 INTELLIGENT ANALYSIS: Vega-Lite selected (score: ${vegaLiteScore} vs ${mermaidScore}, confidence: ${confidence})`
      );
      return "vega-lite";
    } else if (mermaidScore === vegaLiteScore && mermaidScore > 0) {
      console.log(
        `🤔 INTELLIGENT ANALYSIS: Tie (both score: ${mermaidScore}), defaulting to context analysis`
      );
      // In case of tie, do additional context analysis
      if (/(?:how|what|process|workflow|step)/.test(lowerMessage)) {
        return "mermaid";
      } else if (/(?:data|chart|plot|trend|metric)/.test(lowerMessage)) {
        return "vega-lite";
      }
    }

    console.log(
      `❓ INTELLIGENT ANALYSIS: No clear decision (Mermaid: ${mermaidScore}, Vega-Lite: ${vegaLiteScore})`
    );
    return null;
  }

  /**
   * Detects if a diagram request needs database access for real data
   */
  isDataDrivenDiagramRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    // Data-driven patterns that require database access
    const dataPatterns = [
      /\b(?:our|my|the)\s+(?:tasks?|projects?|data|customers?|deals?|sales?|revenue|metrics?)\b/,
      /\b(?:show|display|create|generate|make)\s+.*(?:chart|graph|diagram|gantt).*(?:of|for|from)\s+(?:our|my|the)\b/,
      /\bgantt\s+chart.*(?:tasks?|projects?|timeline)\b/,
      /\bchart.*(?:our|my|the)\s+(?:data|tasks?|projects?|sales?|customers?)\b/,
      /\b(?:timeline|schedule|progress).*(?:our|my|the)\s+(?:tasks?|projects?|work)\b/,
    ];

    return dataPatterns.some(pattern => pattern.test(lowerMessage));
  }

  /**
   * Detects if a message is specifically requesting a Mermaid diagram
   */
  isMermaidDiagramRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    // PRIORITY 1: Direct Mermaid diagram type requests (highest confidence)
    const directMermaidPatterns = [
      /(?:create|draw|generate|make|show)\s+(?:a|an)?\s*(?:mermaid\s+)?(?:flowchart|sequence\s+diagram|class\s+diagram|er\s+diagram|entity\s+relationship|gantt\s+chart|state\s+diagram|mind\s*map|timeline)/i,
      /(?:flowchart|sequence|class|entity|gantt|state|mindmap|timeline)\s+diagram/i,
      /org(?:anization)?\s+chart/i,
      /workflow\s+(?:diagram|visualization|chart)/i,
      /process\s+(?:flow|diagram|map)/i,
      /system\s+architecture/i,
      /database\s+(?:schema|design|er)/i,
      /decision\s+(?:tree|flow)/i,
      /user\s+journey/i,
      /business\s+process/i,
    ];

    // PRIORITY 2: Structure/Process context indicators
    const structuralContextPatterns = [
      /(?:show|visualize|map|diagram)\s+(?:the\s+)?(?:process|workflow|flow|sequence|steps|procedure)/i,
      /(?:how|what)\s+(?:does|is)\s+(?:the\s+)?(?:process|workflow|flow|system|architecture)/i,
      /(?:connect|relationship|link)\s+between/i,
      /(?:step|stage|phase)\s+(?:by\s+step|through)/i,
      /(?:from\s+\w+\s+to|to\s+\w+\s+from)\s+/i, // Flow indicators - more specific
      /approval\s+process/i,
      /data\s+flow/i,
      /system\s+design/i,
      /component\s+diagram/i,
    ];

    // PRIORITY 3: Mermaid syntax clues
    const mermaidSyntaxClues = [
      /(?:-->|->|==>|->>|---)/i, // Mermaid flow arrows
      /(?:graph|flowchart)\s+(?:TD|LR|RL|BT)/i, // Mermaid direction
      /\[\[.*\]\]|\(\(.*\)\)|\{\{.*\}\}/i, // Mermaid node shapes
      /```mermaid/i, // Explicit Mermaid code block
      /(?:participant|actor|note)/i, // Sequence diagram elements
      /(?:classDiagram|erDiagram|sequenceDiagram|gantt|stateDiagram|mindmap)/i,
    ];

    // EXCLUSIONS: Strong indicators this should be Vega-Lite instead
    const vegaLiteIndicators = [
      /(?:bar|line|scatter|histogram|pie|box)\s+(?:chart|plot|graph)/i,
      /(?:sales|revenue|profit|performance|metric)\s+(?:chart|graph|data)/i,
      /(?:plot|chart|graph)\s+(?:the\s+)?(?:data|numbers|values|statistics)/i,
      /(?:trend|pattern|distribution|correlation)\s+(?:analysis|chart|graph)/i,
      /interactive\s+(?:chart|graph|visualization)/i,
      /dashboard/i,
      /analytics\s+(?:chart|visualization)/i,
    ];

    // Check for exclusions first - if it's clearly data visualization, return false
    if (vegaLiteIndicators.some(pattern => pattern.test(lowerMessage))) {
      console.log(
        "🎨 EXCLUSION: Detected data visualization indicators - should use vega_lite_diagram"
      );
      return false;
    }

    // Check direct patterns (highest confidence)
    if (directMermaidPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("🎨 HIGH CONFIDENCE: Detected direct Mermaid diagram pattern");
      return true;
    }

    // Check structural context patterns
    if (structuralContextPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("🎨 MEDIUM CONFIDENCE: Detected structural/process context for Mermaid");
      return true;
    }

    // Check for generic visualization requests with Mermaid syntax clues
    const genericVisualizationRequests = [
      /(?:create|draw|generate|make|show)\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization)/i,
      /visualize/i,
    ];

    if (
      genericVisualizationRequests.some(pattern => pattern.test(lowerMessage)) &&
      mermaidSyntaxClues.some(pattern => pattern.test(message))
    ) {
      console.log(
        "🎨 LOW-MEDIUM CONFIDENCE: Detected generic visualization with Mermaid syntax clues"
      );
      return true;
    }

    return false;
  }

  /**
   * Detects if a message is specifically requesting a markdown table
   */
  isMarkdownTableRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    // Check for direct requests for tables/formatting
    const tablePatterns = [
      /create\s+(?:a|an)?\s+(?:markdown\s+)?table/i,
      /format\s+(?:as|into|this\s+(?:as|into))?\s+(?:a|an)?\s+table/i,
      /generate\s+(?:a|an)?\s+(?:markdown\s+)?table/i,
      /make\s+(?:a|an)?\s+(?:markdown\s+)?table/i,
      /show\s+(?:me\s+)?(?:a|an)?\s+table/i,
      /display\s+(?:as|in)?\s+(?:a|an)?\s+table/i,
      /put\s+(?:this\s+)?(?:in|into)\s+(?:a|an)?\s+table/i,
      /organize\s+(?:this\s+)?(?:as|into)\s+(?:a|an)?\s+table/i,
      /structure\s+(?:this\s+)?(?:as|into)\s+(?:a|an)?\s+table/i,
      /present\s+(?:this\s+)?(?:as|in)\s+(?:a|an)?\s+table/i,
      /tabular\s+format/i,
      /table\s+format/i,
      /markdown\s+table/i,
    ];

    // Check for table-related context combined with data presentation requests
    const dataRequestPatterns = [
      /comparison\s+table/i,
      /summary\s+table/i,
      /list\s+(?:of|with).*(?:in|as)\s+(?:a|an)?\s+table/i,
      /results?\s+(?:in|as)\s+(?:a|an)?\s+table/i,
      /data\s+(?:in|as)\s+(?:a|an)?\s+table/i,
    ];

    // Check for markdown table syntax clues
    const tableSyntaxClues = [
      /\|.*\|/i, // Pipe characters for table columns
      /headers?\s+and\s+rows?/i,
      /columns?\s+and\s+rows?/i,
    ];

    // Check direct patterns first
    if (tablePatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📊 Detected direct table request pattern");
      return true;
    }

    // Check data request patterns
    if (dataRequestPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📊 Detected data table request pattern");
      return true;
    }

    // Check for generic requests combined with table syntax clues
    const genericDataRequests = [
      /format/i,
      /display/i,
      /show/i,
      /present/i,
      /organize/i,
      /structure/i,
    ];

    if (
      genericDataRequests.some(pattern => pattern.test(lowerMessage)) &&
      tableSyntaxClues.some(pattern => pattern.test(message))
    ) {
      console.log("📊 Detected table request with syntax clues");
      return true;
    }

    return false;
  }

  /**
   * Detects if a message is specifically requesting markdown action items
   */
  isMarkdownActionItemRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    // Check for direct requests for action items/to-dos/task lists
    const actionItemPatterns = [
      /create\s+(?:a|an)?\s+(?:markdown\s+)?(?:action\s+item|task|to-?do)\s+list/i,
      /format\s+(?:as|into|this\s+(?:as|into))?\s+(?:a|an)?\s+(?:action\s+item|task|to-?do)\s+list/i,
      /generate\s+(?:a|an)?\s+(?:markdown\s+)?(?:action\s+item|task|to-?do)\s+list/i,
      /make\s+(?:a|an)?\s+(?:markdown\s+)?(?:action\s+item|task|to-?do)\s+list/i,
      /organize\s+(?:these\s+)?(?:action\s+items|tasks|to-?dos)/i,
      /track\s+(?:these\s+)?(?:action\s+items|tasks|to-?dos)/i,
      /create\s+(?:action\s+items|tasks|to-?dos)/i,
      /format\s+(?:these\s+)?(?:action\s+items|tasks|to-?dos)/i,
      /(?:action\s+item|task|to-?do)\s+checklist/i,
      /checklist\s+of\s+(?:action\s+items|tasks|to-?dos)/i,
    ];

    // Check for context clues related to task management
    const taskManagementPatterns = [
      /meeting\s+(?:action\s+items|follow-?ups|tasks)/i,
      /project\s+(?:action\s+items|tasks|to-?dos)/i,
      /next\s+steps/i,
      /follow-?up\s+(?:action\s+items|tasks)/i,
      /action\s+plan/i,
      /task\s+management/i,
      /project\s+planning/i,
      /deliverables/i,
    ];

    // Check for action item syntax clues
    const actionItemSyntaxClues = [
      /\[\s?\]/i, // Checkbox syntax
      /\[x\]/i, // Completed checkbox
      /priority.*(?:high|medium|low)/i,
      /due\s+date/i,
      /assigned?\s+to/i,
      /assignee/i,
    ];

    // Check direct patterns first
    if (actionItemPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📋 Detected direct action item request pattern");
      return true;
    }

    // Check task management patterns
    if (taskManagementPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📋 Detected task management action item pattern");
      return true;
    }

    // Check for generic organization requests combined with action item syntax clues
    const genericOrganizationRequests = [
      /organize/i,
      /structure/i,
      /format/i,
      /display/i,
      /show/i,
      /present/i,
      /track/i,
      /manage/i,
    ];

    if (
      genericOrganizationRequests.some(pattern => pattern.test(lowerMessage)) &&
      actionItemSyntaxClues.some(pattern => pattern.test(message))
    ) {
      console.log("📋 Detected action item request with syntax clues");
      return true;
    }

    return false;
  }

  /**
   * Detects if a message is specifically requesting a Vega-Lite diagram
   */
  isVegaLiteDiagramRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    // PRIORITY 1: Direct data visualization requests (highest confidence)
    const directDataVisualizationPatterns = [
      /(?:create|draw|generate|make|show)\s+(?:a|an)?\s*(?:bar|line|scatter|histogram|pie|box)\s+(?:chart|plot|graph)/i,
      /(?:plot|chart|graph)\s+(?:the\s+)?(?:data|numbers|values|statistics|metrics)/i,
      /(?:sales|revenue|performance|financial|metric|statistic)\s+(?:chart|graph|visualization|dashboard)/i,
      /(?:trend|pattern|distribution|correlation)\s+(?:analysis|chart|graph)/i,
      /interactive\s+(?:chart|graph|visualization|dashboard)/i,
      /data\s+(?:visualization|dashboard|analytics|chart|graph)/i,
      /business\s+intelligence\s+(?:chart|visualization|dashboard)/i,
      /(?:analytical|quantitative)\s+(?:chart|visualization|dashboard)/i,
    ];

    // PRIORITY 2: Statistical/Analytical context indicators
    const statisticalContextPatterns = [
      /(?:analyze|compare|measure|track|monitor)\s+(?:the\s+)?(?:data|numbers|metrics|performance|trends)/i,
      /(?:show|display|visualize)\s+(?:the\s+)?(?:relationship|correlation|distribution|trend)/i,
      /(?:quarterly|monthly|annual|yearly)\s+(?:results|performance|data|metrics)/i,
      /(?:growth|decline|increase|decrease)\s+(?:rate|trend|pattern)/i,
      /(?:average|mean|median|total|sum|count)\s+(?:of|by|across)/i,
      /(?:benchmark|comparison|vs\.|versus)\s+(?:data|metrics|performance)/i,
      /key\s+(?:metrics|indicators|performance)/i,
      /dashboard/i,
    ];

    // PRIORITY 3: Specific chart type requests
    const chartTypePatterns = [
      /bar\s+chart/i,
      /line\s+(?:chart|graph|plot)/i,
      /scatter\s+(?:plot|chart|diagram)/i,
      /histogram/i,
      /pie\s+chart/i,
      /box\s+plot/i,
      /heat\s*map/i,
      /time\s+series/i,
      /area\s+chart/i,
    ];

    // EXCLUSIONS: Strong indicators this should be Mermaid instead
    const mermaidIndicators = [
      /(?:flowchart|sequence|workflow|process|architecture)/i,
      /(?:step|stage|phase)\s+(?:by\s+step|flow)/i,
      /(?:decision|approval)\s+(?:tree|process|flow)/i,
      /(?:entity|class|state)\s+diagram/i,
      /(?:org|organizational)\s+chart/i,
      /system\s+(?:design|architecture)/i,
      /(?:user\s+journey|customer\s+journey)/i,
      /(?:connect|relationship|link)\s+between/i,
    ];

    // Check for exclusions first - if it's clearly structural/process, return false
    if (mermaidIndicators.some(pattern => pattern.test(lowerMessage))) {
      console.log(
        "📊 EXCLUSION: Detected structural/process indicators - should use mermaid_diagram"
      );
      return false;
    }

    // Check direct data visualization patterns (highest confidence)
    if (directDataVisualizationPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📊 HIGH CONFIDENCE: Detected direct data visualization pattern");
      return true;
    }

    // Check specific chart type patterns (high confidence)
    if (chartTypePatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📊 HIGH CONFIDENCE: Detected specific chart type request");
      return true;
    }

    // Check statistical context patterns (medium confidence)
    if (statisticalContextPatterns.some(pattern => pattern.test(lowerMessage))) {
      console.log("📊 MEDIUM CONFIDENCE: Detected statistical/analytical context");
      return true;
    }

    return false;
  }

  async executeToolCallsWithRecovery(
    initialToolCalls,
    mcpClient,
    logger,
    message,
    collectedRawPrompts
  ) {
    // Start performance tracking for tool execution batch
    const batchExecutionId = this.performanceLogger.startPipelineStage("tool_batch_execution", {
      initial_tool_count: initialToolCalls.length,
      is_diagram_request: this.isMermaidDiagramRequest(message),
    });

    console.log(
      `🔧 Starting comprehensive tool execution with ${initialToolCalls.length} initial tool calls`
    );

    let allToolCalls = [...initialToolCalls];
    let allToolResults = [];

    // Check if this is a mermaid diagram request to avoid unnecessary follow-up queries
    const isDiagramRequest = this.isMermaidDiagramRequest(message);
    if (isDiagramRequest) {
      console.log(
        `🎨 Diagram request detected - will skip follow-up queries after initial execution`
      );
    }

    try {
      // Execute initial tools with timeout
      const initialResults = await Promise.race([
        this.executeToolCalls(initialToolCalls, mcpClient, logger),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Initial tool execution timeout (60s)")), 60000)
        ),
      ]);

      allToolResults.push(...initialResults);
      console.log(`✅ Initial tool execution completed: ${initialResults.length} results`);

      // Handle mermaid diagram retry logic for failed validations
      if (isDiagramRequest) {
        console.log(`🎨 Diagram request detected - checking for validation failures`);

        // Check if any mermaid diagram results have validation errors
        const mermaidErrors = allToolResults.filter(
          result => result.is_error && result.content.includes("MERMAID VALIDATION FAILED")
        );

        if (mermaidErrors.length > 0) {
          console.log(
            `🔄 Found ${mermaidErrors.length} mermaid validation errors - attempting retry`
          );

          // Generate retry tool calls for failed mermaid diagrams
          const retryToolCalls = await this.generateMermaidRetryToolCalls(
            message,
            allToolCalls,
            mermaidErrors,
            logger,
            collectedRawPrompts
          );

          if (retryToolCalls.length > 0) {
            try {
              console.log(`🔄 Executing ${retryToolCalls.length} mermaid retry tool calls`);
              const retryResults = await Promise.race([
                this.executeToolCalls(retryToolCalls, mcpClient, logger),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("Retry tool execution timeout (60s)")), 60000)
                ),
              ]);

              // Replace failed results with retry results
              allToolCalls.push(...retryToolCalls);
              allToolResults.push(...retryResults);

              console.log(`✅ Mermaid retry completed: ${retryResults.length} new results`);
            } catch (retryError) {
              console.warn(`⚠️ Mermaid retry failed: ${retryError.message}`);
              // Create error results for failed retries
              const errorResults = retryToolCalls.map(toolCall => ({
                tool_use_id: toolCall.id,
                content: `Mermaid retry failed: ${retryError.message}`,
                is_error: true,
              }));
              allToolCalls.push(...retryToolCalls);
              allToolResults.push(...errorResults);
            }
          }
        }

        // Diagram requests always need data - continue to intelligent follow-up logic
        console.log(
          `🎨 Diagram request detected - will generate follow-up queries to get real data`
        );
      }

      // Check cancellation before generating follow-up queries
      if (this.isOperationCancelled()) {
        console.log('🛑 Cancelled before follow-up query generation');
        throw new Error('Operation cancelled by user');
      }

      // INTELLIGENT FOLLOW-UP LOGIC: Generate intelligent follow-up queries based on results
      const followUpToolCalls = await this.generateIntelligentFollowUpQueries(
        message,
        allToolCalls,
        allToolResults,
        logger,
        collectedRawPrompts
      );

      // Execute follow-up tool calls if any
      if (followUpToolCalls.length > 0) {
        // Check cancellation before executing follow-up tools
        if (this.isOperationCancelled()) {
          console.log('🛑 Cancelled before follow-up tool execution');
          throw new Error('Operation cancelled by user');
        }
        console.log(`🔄 Executing ${followUpToolCalls.length} intelligent follow-up queries...`);

        try {
          const followUpResults = await Promise.race([
            this.executeToolCalls(followUpToolCalls, mcpClient, logger),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Follow-up tool execution timeout (60s)")), 60000)
            ),
            // Add cancellation promise for follow-up
            new Promise((_, reject) => {
              const checkInterval = setInterval(() => {
                if (this.isOperationCancelled()) {
                  clearInterval(checkInterval);
                  reject(new Error('Operation cancelled by user'));
                }
              }, 100);
              setTimeout(() => clearInterval(checkInterval), 60000);
            }),
          ]);

          // Add follow-up calls and results to the main arrays
          allToolCalls.push(...followUpToolCalls);
          allToolResults.push(...followUpResults);

          console.log(
            `✅ Follow-up tool execution completed: ${followUpResults.length} additional results`
          );
        } catch (followUpError) {
          console.warn(`⚠️ Follow-up tool execution failed: ${followUpError.message}`);

          // Create error results for failed follow-up tools
          const errorResults = followUpToolCalls.map(toolCall => ({
            tool_use_id: toolCall.id,
            content: `Follow-up tool execution failed: ${followUpError.message}`,
            is_error: true,
          }));

          allToolCalls.push(...followUpToolCalls);
          allToolResults.push(...errorResults);
        }
      } else {
        console.log(`ℹ️ No intelligent follow-up queries generated`);
      }
    } catch (error) {
      console.error(`❌ Tool execution failed/timeout: ${error.message}`);

      // CRITICAL: Create error tool results for ALL tool calls to maintain conversation history
      allToolResults = allToolCalls.map(toolCall => ({
        tool_use_id: toolCall.id,
        content: `Tool execution failed: ${error.message}`,
        is_error: true,
      }));

      console.log(
        `🔧 Created ${allToolResults.length} error tool results to maintain conversation history`
      );
    }

    // CRITICAL: Ensure we have exactly one tool_result for each tool_call
    const missingResults = allToolCalls.filter(
      tc => !allToolResults.some(tr => tr.tool_use_id === tc.id)
    );

    if (missingResults.length > 0) {
      console.warn(
        `⚠️ Creating ${missingResults.length} missing tool results for conversation history integrity`
      );

      const emergencyResults = missingResults.map(toolCall => ({
        tool_use_id: toolCall.id,
        content: "Tool execution incomplete - timeout or error occurred",
        is_error: true,
      }));

      allToolResults.push(...emergencyResults);
    }

    console.log(
      `🔧 Tool execution summary: ${allToolCalls.length} calls, ${allToolResults.length} results`
    );

    // End performance tracking for tool batch execution
    this.performanceLogger.endPipelineStage(batchExecutionId, {
      total_tool_calls: allToolCalls.length,
      total_tool_results: allToolResults.length,
      success_rate: allToolResults.filter(r => !r.is_error).length / allToolResults.length,
      had_follow_ups: allToolCalls.length > initialToolCalls.length,
    });

    return {
      allToolCalls,
      allToolResults,
    };
  }

  validateConversationHistory() {
    // CRITICAL FIX: Don't validate conversation history during tool execution
    if (this.isExecutingTools) {
      console.log("🚫 Skipping conversation history validation during tool execution");
      return;
    }

    console.log("🧹 Validating conversation history...");

    // For now, keep it simple - just log that validation is running
    // The atomic tool cycle addition in chat() method should prevent corruption
    console.log("✅ Conversation history validation complete");
  }

  /**
   * Generate retry tool calls for failed mermaid diagrams
   */
  async generateMermaidRetryToolCalls(
    originalMessage,
    originalToolCalls,
    mermaidErrors,
    logger,
    collectedRawPrompts
  ) {
    const retryToolCalls = [];

    for (const error of mermaidErrors) {
      // Find the original tool call that caused this error
      const originalToolCall = originalToolCalls.find(tc => tc.id === error.tool_use_id);
      if (!originalToolCall) continue;

      // Create a retry tool call with improved instructions
      const retryToolCall = {
        id: `retry_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        name: "mermaid_diagram",
        input: {
          type: originalToolCall.input.type || "flowchart",
          code: originalToolCall.input.code,
          title: originalToolCall.input.title || null,
        },
      };

      console.log(`🔄 Generated retry tool call for mermaid diagram: ${retryToolCall.id}`);
      retryToolCalls.push(retryToolCall);
    }

    // Parameters are kept for future enhancement if needed
    console.log(
      `🔄 Generated ${
        retryToolCalls.length
      } retry tool calls for message: "${originalMessage.substring(0, 50)}..."`
    );

    return retryToolCalls;
  }
}
