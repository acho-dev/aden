import { createBusinessKeywordMatcher } from "../utils/keyword-matcher.js";
import { getPerformanceLogger } from "../performance-logger.js";

/**
 * Enhanced abstract base class for sophisticated LLM implementations
 * Based on the Claude LLM's advanced patterns and intelligent analytics
 */
export class BaseLLM {
  constructor(config = {}) {
    if (this.constructor === BaseLLM) {
      throw new Error("BaseLLM is abstract and cannot be instantiated directly");
    }

    this.config = {
      // Default configuration that all providers should support
      model: config.model || this.getDefaultModel?.() || "default",
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.7,
      // Provider-specific configuration
      ...config,
    };

    this.conversationHistory = [];
    this.conversationContext = {
      lastTopic: null,
      activeTasks: [],
      recentToolUse: [],
    };

    // Memory service for enhanced context management
    this.memoryService = null;
    this.sessionId = config.sessionId || null;
    this.teamId = config.teamId || null;
    this.userId = config.userId || null;
    this.projectId = config.projectId || null;

    // Initialize performance logger
    this.performanceLogger = getPerformanceLogger(this.sessionId);
    
    // Initialize circuit breaker counter
    this.invalidToolCallCounter = 0;

    // Performance and usage tracking
    this.metrics = {
      totalRequests: 0,
      totalTokensUsed: 0,
      averageResponseTime: 0,
      errorCount: 0,
      toolCallCount: 0,
    };

    // Cancellation support
    this.currentAbortController = null;
    this.operationCancelled = false;

    // Enhanced query generation configuration for data awareness
    this.queryGenerationConfig = {
      enabled: config.enableIntelligentQueries !== false, // Default true
      minQueries: config.minFollowupQueries || 8,
      maxQueries: config.maxFollowupQueries || 15,
      aggressiveness: config.queryAggressiveness || "medium", // 'low', 'medium', 'high'
      includeHistoricalData: config.includeHistoricalData !== false, // Default true
      includeRelatedEntities: config.includeRelatedEntities !== false, // Default true
      includeSummaryData: config.includeSummaryData !== false, // Default true
      includeComparativeData: config.includeComparativeData !== false, // Default true
    };

    // Provider-specific capabilities
    this.capabilities = {
      streaming: false,
      functionCalling: false,
      vision: false,
      codeExecution: false,
      internetAccess: false,
      maxContextLength: 4000,
      supportedLanguages: ["en"],
      ...this.getProviderCapabilities?.(),
    };

    // Track tool execution state (critical for conversation integrity)
    this.isExecutingTools = false;

    // Initialize business keyword matcher for intelligent analytics
    this.businessKeywordMatcher = createBusinessKeywordMatcher({
      threshold: 0.6,
      exactWeight: 0.4,
      distanceWeight: 0.3,
      jaccardWeight: 0.2,
      substringWeight: 0.1,
      distanceThreshold: 0.7,
      jaccardThreshold: 0.5,
    });
  }

  // Abstract methods that must be implemented by providers
  async initialize(credentials) {
    throw new Error("initialize() must be implemented by subclass");
  }

  getProviderName() {
    throw new Error("getProviderName() must be implemented by subclass");
  }

  getDefaultModel() {
    throw new Error("getDefaultModel() must be implemented by subclass");
  }

  getProviderCapabilities() {
    return {};
  }

  isValidModel(model) {
    throw new Error("isValidModel() must be implemented by subclass");
  }

  getTokenCosts() {
    return { input: 0, output: 0 };
  }

  // Provider-specific API call method
  async callProviderAPI(messages, tools, config = {}) {
    throw new Error("callProviderAPI() must be implemented by subclass");
  }

  // Provider-specific streaming method
  async callProviderAPIStreaming(messages, tools, config = {}, callbacks = {}) {
    throw new Error("callProviderAPIStreaming() must be implemented by subclass");
  }

  // Core sophisticated chat method following Claude's pattern
  async chat(message, mcpClient = null, logger = null) {
    const startTime = Date.now();
    this.isExecutingTools = true;

    try {
      console.log(`\n💬 ${this.getProviderName().toUpperCase()} CHAT: "${message}"`);

      // Step 1: Enhance message with memory context (CRITICAL - always search memories first)
      const enhancedMessage = await this.enhanceMessageWithMemoryContext(message, mcpClient);

      // Step 2: Determine tool selection strategy
      const toolsConfig = this.selectToolsForMessage(enhancedMessage, mcpClient);

      // Step 3: Build messages for provider API
      const messages = this.buildProviderMessages(enhancedMessage);

      // Step 4: Initial API call
      console.log(`🔥 Making initial ${this.getProviderName()} API call...`);
      const initialResponse = await this.callProviderAPI(messages, toolsConfig.tools, {
        timeout: 60000, // 60 second timeout for initial call
      });

      let toolCalls = this.extractToolCalls(initialResponse);
      let toolResults = [];
      let collectedRawPrompts = [];

      // Step 5: Execute initial tool calls
      if (toolCalls.length > 0) {
        console.log(`\n🔧 Executing ${toolCalls.length} initial tool calls...`);
        toolResults = await this.executeToolCalls(toolCalls, mcpClient, logger);
      }

      // Step 6: Generate intelligent follow-up queries (Claude's signature feature)
      let followUpToolCalls = [];
      if (this.shouldGenerateIntelligentFollowUps()) {
        followUpToolCalls = await this.generateIntelligentFollowUpQueries(
          message,
          toolCalls,
          toolResults,
          logger,
          collectedRawPrompts
        );

        // Execute follow-up tool calls
        if (followUpToolCalls.length > 0) {
          console.log(
            `\n🔄 Executing ${followUpToolCalls.length} intelligent follow-up queries...`
          );
          const followUpResults = await this.executeToolCalls(followUpToolCalls, mcpClient, logger);
          toolResults = toolResults.concat(followUpResults);
          toolCalls = toolCalls.concat(followUpToolCalls);
        }
      }

      // Step 7: Generate analytical response using all tool results
      const finalResponse = await this.generateAnalyticalResponse(
        message,
        toolCalls,
        toolResults,
        initialResponse.text || "",
        collectedRawPrompts
      );

      // Step 8: Update conversation history atomically (maintain tool_use/tool_result integrity)
      await this.updateConversationHistory(message, toolCalls, toolResults, finalResponse);

      // Step 9: Track metrics and context
      const responseTime = Date.now() - startTime;
      this.trackMetrics(
        responseTime,
        initialResponse.usage?.total_tokens || 0,
        false,
        toolCalls.length
      );
      await this.updateContext(message, toolCalls, finalResponse);

      this.isExecutingTools = false;

      return {
        response: finalResponse,
        toolCalls: toolCalls.map((tc, index) => {
          const toolResult = toolResults.find(tr => tr.tool_use_id === tc.id);
          return {
            ...tc,
            result: toolResult?.content || null,
            error: toolResult?.is_error ? toolResult.content : null,
          };
        }),
        usage: initialResponse.usage,
        rawPrompts: collectedRawPrompts,
      };
    } catch (error) {
      this.isExecutingTools = false;
      console.error(`❌ ${this.getProviderName()} chat error:`, error);
      throw new Error(`${this.getProviderName()} API error: ${error.message}`);
    }
  }

  // Enhanced message with memory context (Claude's memory-first pattern)
  async enhanceMessageWithMemoryContext(message, mcpClient) {
    // Don't call tools directly here - let the LLM call them
    // This ensures proper tool_use/tool_result tracking in the conversation
    return message;
  }

  // Smart tool selection following Claude's patterns
  async selectToolsForMessage(message, mcpClient) {
    if (!mcpClient || !this.shouldUseTools(message)) {
      return { tools: [], filtered: true };
    }

    const allTools = mcpClient.getAvailableTools
      ? await mcpClient.getAvailableTools()
      : mcpClient.tools || [];

    // Filter tools based on message content (Claude's intelligent filtering)
    const lowerMessage = message.toLowerCase();

    // Diagram tool intelligence
    if (this.isDiagramRequest(message)) {
      return {
        tools: allTools.filter(tool =>
          ["mermaid_diagram", "vega_lite_diagram"].includes(tool.name)
        ),
        filtered: true,
      };
    }

    // Table/data formatting requests
    if (this.isTableRequest(message)) {
      return {
        tools: allTools.filter(tool =>
          ["markdown_table", "db_query", "graph_export"].includes(tool.name)
        ),
        filtered: true,
      };
    }

    // Action item requests
    if (this.isActionItemRequest(message)) {
      return {
        tools: allTools.filter(tool => ["markdown_action_item", "plan_tasks"].includes(tool.name)),
        filtered: true,
      };
    }

    // Default: provide all tools
    return { tools: allTools, filtered: false };
  }

  // Business query detection (Claude's intelligent analytics)
  shouldTriggerGraphExport(message, existingToolCalls = []) {
    // Skip if graph_export already present
    if (existingToolCalls.some(tc => tc.name === "graph_export")) {
      return false;
    }

    // First check exclusions - basic greetings, social questions, and simple responses
    const isBasicGreeting = /^(hello|hi|hey|thanks|thank you|bye|goodbye|yes|no|ok|okay)$/i.test(
      message.trim()
    );
    const isSocialQuestion =
      /^(hello|hi|hey).*(how are you|how's it going|what's up)/i.test(message.trim()) ||
      /^(what is|tell me about).*(machine learning|ai|artificial intelligence|yourself)/i.test(
        message.trim()
      ) ||
      /^(tell me a|give me a).*(joke|story|fun fact)/i.test(message.trim());

    if (isBasicGreeting || isSocialQuestion) {
      return false;
    }

    // Multi-layer business query detection following Claude's pattern
    const matchResult = this.businessKeywordMatcher.getMatchDetails(message);
    const hasBusinessKeywords = matchResult.hasMatches;

    // Only use proper nouns and questions if we have some business context
    const hasProperNouns = /\b[A-Z][a-z]+\b/.test(message);
    const isQuestionLike =
      message.includes("?") ||
      /\b(show|tell|give|provide|get|find|search|display|list|what|how|when|where|who)\b/i.test(
        message
      );

    // Require business keywords for basic queries, or business keywords + proper nouns/questions for complex queries
    if (hasBusinessKeywords) {
      return true;
    }

    // Only trigger for proper nouns or questions if they seem business-related
    if ((hasProperNouns || isQuestionLike) && hasBusinessKeywords) {
      return true;
    }

    return false;
  }

  // Reset circuit breaker for invalid tool call generation
  resetInvalidToolCallCounter() {
    const previousCount = this.invalidToolCallCounter;
    this.invalidToolCallCounter = 0;
    console.log(`🔄 Circuit breaker reset: was ${previousCount}, now ${this.invalidToolCallCounter}`);
  }

  // Generate intelligent follow-up queries (Claude's signature feature)
  async generateIntelligentFollowUpQueries(
    originalMessage,
    toolCalls,
    toolResults,
    logger = null,
    collectedRawPrompts = []
  ) {
    // Check if intelligent queries are enabled
    if (!this.queryGenerationConfig.enabled) {
      return [];
    }

    // CIRCUIT BREAKER: Prevent infinite loops from invalid tool call generation
    if (!this.invalidToolCallCounter) {
      this.invalidToolCallCounter = 0;
    }
    
    // If we've had too many consecutive invalid tool call attempts, stop trying
    const MAX_INVALID_ATTEMPTS = 3;
    if (this.invalidToolCallCounter >= MAX_INVALID_ATTEMPTS) {
      console.log(`🚫 CIRCUIT BREAKER: Stopping intelligent follow-up generation after ${this.invalidToolCallCounter} consecutive invalid attempts`);
      this.invalidToolCallCounter = 0; // Reset for next conversation
      return [];
    }

    // Check for various result types
    // const graphExportResults = toolResults.filter(
    //   (result, index) => toolCalls[index]?.name === "graph_export" && result.content
    // );

    // const searchMemoriesResults = toolResults.filter(
    //   (result, index) => toolCalls[index]?.name === "search_memories" && result.content
    // );

    // Enhanced orchestration logic with aggressiveness settings
    const shouldGenerateFollowUps = () => {
      // CRITICAL: Always generate follow-ups for diagram requests since they need real data
      const diagramResults = toolResults.filter(
        (result, index) =>
          toolCalls[index]?.name === "mermaid_diagram" ||
          toolCalls[index]?.name === "vega_lite_diagram"
      );
      if (diagramResults.length > 0) {
        console.log(`🎨 Diagram results detected - will generate follow-up queries for real data`);
        return true;
      }

      // Always generate follow-ups for business queries (schema is now in system prompt)
      if (this.shouldTriggerGraphExport(originalMessage, toolCalls)) {
        console.log(`💼 Business query detected - will generate follow-up queries`);
        return true;
      }

      // For high aggressiveness, always generate queries
      if (this.queryGenerationConfig.aggressiveness === "high") {
        return true;
      }

      return false;
    };

    if (!shouldGenerateFollowUps()) {
      return [];
    }

    // Schema is now in system prompt, so we don't need graph_export calls
    // Skip the old graph_export dependency logic

    // Prepare context for intelligent query generation
    let contextSummary = "";

    // if (searchMemoriesResults.length > 0) {
    //   contextSummary += "Team memory context:\n";
    //   contextSummary += searchMemoriesResults.map(result => result.content).join("\n\n");
    //   contextSummary += "\n\n";
    // }

    // Schema context is now in system prompt - no need to add it here
    contextSummary += "Database schema is available in your system context for reference.\n\n";

    // Generate intelligent queries using the provider's LLM
    const queryGenerationPrompt = `Based on the user's question: "${originalMessage}"

And this context:
${contextSummary}

Generate MULTIPLE comprehensive follow-up tool calls to get detailed information that would help answer the user's question completely with full data awareness.

CRITICAL RESPONSE FORMAT:
- Respond with ONLY a JSON array of tool calls
- NO explanatory text, NO markdown, NO code blocks
- Pure JSON array format: [{...}, {...}, {...}]

CRITICAL CONSISTENCY RULES:
- ALWAYS generate ${this.queryGenerationConfig.minQueries}-${
      this.queryGenerationConfig.maxQueries
    } follow-up queries for comprehensive data awareness
- Generate queries for DIFFERENT perspectives: summary, detailed, related data, trends
- Do NOT be sporadic or random - follow a consistent pattern based on the user's question type
- Query aggressiveness level: ${this.queryGenerationConfig.aggressiveness}

ENHANCED MULTI-QUERY STRATEGY:
Generate queries for multiple dimensions to ensure comprehensive data awareness:
1. PRIMARY DATA: Direct answer to the user's question
2. CONTEXTUAL DATA: Related information that provides context  
3. SUMMARY DATA: Aggregated insights and totals${
      this.queryGenerationConfig.includeSummaryData ? " (ENABLED)" : " (DISABLED)"
    }
4. COMPARATIVE DATA: Trends, comparisons, or benchmarks${
      this.queryGenerationConfig.includeComparativeData ? " (ENABLED)" : " (DISABLED)"
    }
5. RELATIONSHIP DATA: Connected entities and associations${
      this.queryGenerationConfig.includeRelatedEntities ? " (ENABLED)" : " (DISABLED)"
    }
6. HISTORICAL DATA: Time-series data and trends${
      this.queryGenerationConfig.includeHistoricalData ? " (ENABLED)" : " (DISABLED)"
    }
7. DETAIL DATA: Granular information for deep analysis
8. RELATED ENTITIES: Associated records and connections${
      this.queryGenerationConfig.includeRelatedEntities ? " (ENABLED)" : " (DISABLED)"
    }

SPECIFIC QUERY GENERATION PATTERNS:
1. For customer/engagement questions: 
   - Customer details and profile data
   - Engagement metrics and interaction history
   - Revenue and payment information
   - Related deals and contracts
   - Activity timelines and touchpoints

2. For financial questions: 
   - Revenue and payment data
   - Financial metrics and trends over time
   - Comparative performance metrics
   - Related invoices and transactions
   - Budget and forecasting data

3. For product questions: 
   - Product specifications and features
   - Usage metrics and analytics
   - Performance data and benchmarks
   - User adoption and feedback
   - Related services and integrations

4. For team/user questions: 
   - User profiles and team information
   - Organization structure and hierarchy
   - Activity metrics and productivity data
   - Access permissions and roles
   - Project assignments and workloads

5. For performance questions: 
   - Key performance indicators (KPIs)
   - Analytics and metrics dashboards
   - Historical performance trends
   - Comparative benchmarks
   - Goal tracking and progress

Rules for SQL generation:
- Use SELECT * to get comprehensive data for analysis
- Include proper JOINs to related tables when relevant
- Use ILIKE for case-insensitive text matching
- Add explicit PostgreSQL type casting with :: operator when needed
- For analytics questions, do NOT add LIMIT (analyze all data)
- For browsing questions, add reasonable LIMIT (10-50 records)
- CRITICAL: Use parameterized queries with $1, $2, etc. placeholders AND provide params array

Response format - return EXACTLY this structure as a JSON array:
[{
  "name": "db_query",
  "input": {
    "query": "SELECT * FROM table_name WHERE column_name ILIKE $1",
    "params": ["search_value"],
    "limit": null
  }
}]

Example for searching Richard - respond with ONLY:
[{
  "name": "db_query", 
  "input": {
    "query": "SELECT * FROM contacts WHERE first_name ILIKE $1 OR last_name ILIKE $1",
    "params": ["Richard"],
    "limit": null
  }
}]

Available tools: db_query, markdown_table, markdown_action_item, vega_lite_diagram, mermaid_diagram

IMPORTANT: Respond with pure JSON array only - no other text!`;

    try {
      // Use the provider's LLM to generate intelligent follow-up queries
      const queryMessages = [
        {
          role: "system",
          content:
            "You are an intelligent query generator. Respond with only the JSON array of tool calls, no other text.",
        },
        { role: "user", content: queryGenerationPrompt },
      ];

      const queryResponse = await this.callProviderAPI(queryMessages, [], {
        timeout: 30000, // 30 second timeout for follow-up generation
        temperature: 0.3, // Lower temperature for more consistent query generation
      });

      // Parse the generated queries with detailed logging
      const responseText = queryResponse.text || "";
      console.log(`🔍 INTELLIGENT QUERY GENERATION DEBUG:`);
      console.log(`   Raw response length: ${responseText.length}`);
      console.log(
        `   Raw response preview: "${responseText.substring(0, 200)}${
          responseText.length > 200 ? "..." : ""
        }"`
      );

      // Try multiple extraction methods
      let generatedQueries = [];

      // Method 1: Look for pure JSON array (including within code blocks)
      let cleanJsonText = responseText.trim();

      // Remove markdown code block markers if present
      if (cleanJsonText.startsWith("```json") && cleanJsonText.endsWith("```")) {
        cleanJsonText = cleanJsonText
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
          .trim();
        console.log(`   📋 Method 1a: Extracted JSON from code block`);
      }

      // Try to parse the cleaned JSON
      if (cleanJsonText.startsWith("[") && cleanJsonText.endsWith("]")) {
        console.log(`   📋 Method 1b: Pure JSON array detected`);
        try {
          generatedQueries = JSON.parse(cleanJsonText);
          console.log(`   ✅ Pure JSON parsed successfully: ${generatedQueries.length} queries`);
        } catch (error) {
          console.log(`   ❌ Pure JSON parsing failed: ${error.message}`);
          console.log(`   JSON preview: "${cleanJsonText.substring(0, 200)}..."`);
        }
      }

      // Method 2: Extract individual JSON objects from mixed content
      if (generatedQueries.length === 0) {
        console.log(`   📋 Method 2: Extracting individual JSON objects from mixed content`);

        // Extract content from markdown code blocks
        let cleanedText = responseText;
        const codeBlockPattern = /```(?:json)?\s*([\s\S]*?)```/g;
        const codeBlocks = [];
        let match;

        while ((match = codeBlockPattern.exec(responseText)) !== null) {
          const blockContent = match[1].trim();
          if (blockContent.startsWith("[") || blockContent.startsWith("{")) {
            codeBlocks.push(blockContent);
          }
        }

        if (codeBlocks.length > 0) {
          console.log(`   Found ${codeBlocks.length} JSON code blocks`);

          // Try to parse each code block as complete JSON first
          for (const block of codeBlocks) {
            if (block.startsWith("[") && block.endsWith("]")) {
              try {
                const blockQueries = JSON.parse(block);
                if (Array.isArray(blockQueries) && blockQueries.length > 0) {
                  generatedQueries = blockQueries.filter(q => q.name && q.input);
                  console.log(
                    `   ✅ Code block parsed as complete JSON array: ${generatedQueries.length} queries`
                  );
                  break;
                }
              } catch (error) {
                console.log(`   ❌ Code block JSON parsing failed: ${error.message}`);
              }
            }
          }

          if (generatedQueries.length === 0) {
            cleanedText = codeBlocks.join("\n");
          }
        }

        // Now look for JSON objects in the cleaned text
        const jsonObjectPattern = /\{[\s\S]*?"name"\s*:\s*"db_query"[\s\S]*?\}/g;
        const jsonMatches = cleanedText.match(jsonObjectPattern);

        if (jsonMatches) {
          console.log(`   Found ${jsonMatches.length} potential JSON objects`);

          for (let i = 0; i < jsonMatches.length; i++) {
            const jsonString = jsonMatches[i];
            console.log(`   Trying to parse object ${i + 1}: ${jsonString.substring(0, 100)}...`);

            try {
              const parsed = JSON.parse(jsonString);
              if (parsed.name && parsed.input) {
                generatedQueries.push(parsed);
                console.log(`   ✅ Object ${i + 1} parsed successfully: ${parsed.name}`);
              } else {
                console.log(`   ⚠️ Object ${i + 1} missing required fields`);
              }
            } catch (parseError) {
              console.log(`   ❌ Object ${i + 1} parsing failed: ${parseError.message}`);

              // Try to fix common JSON issues
              let fixedJson = jsonString;

              // Fix trailing commas
              fixedJson = fixedJson.replace(/,\s*([}\]])/, "$1");

              // Fix incomplete JSON (common issue)
              if (!fixedJson.endsWith("}")) {
                const openBraces = (fixedJson.match(/\{/g) || []).length;
                const closeBraces = (fixedJson.match(/\}/g) || []).length;
                const missingBraces = openBraces - closeBraces;

                if (missingBraces > 0) {
                  fixedJson += "}".repeat(missingBraces);
                  console.log(`   🔧 Added ${missingBraces} missing closing braces`);
                }
              }

              try {
                const fixedParsed = JSON.parse(fixedJson);
                if (fixedParsed.name && fixedParsed.input) {
                  generatedQueries.push(fixedParsed);
                  console.log(`   ✅ Object ${i + 1} fixed and parsed: ${fixedParsed.name}`);
                }
              } catch (fixError) {
                console.log(`   ❌ Object ${i + 1} fix attempt failed: ${fixError.message}`);
              }
            }
          }
        } else {
          console.log(`   ❌ No JSON objects found with db_query pattern`);
        }
      }

      // Method 3: Fallback - try to extract any valid JSON array with proper bracket matching
      if (generatedQueries.length === 0) {
        console.log(`   📋 Method 3: Fallback - trying bracket-matched JSON array`);

        // Find the first '[' and then match brackets to find the complete array
        const startIndex = responseText.indexOf("[");
        if (startIndex !== -1) {
          let bracketCount = 0;
          let endIndex = -1;

          for (let i = startIndex; i < responseText.length; i++) {
            if (responseText[i] === "[") {
              bracketCount++;
            } else if (responseText[i] === "]") {
              bracketCount--;
              if (bracketCount === 0) {
                endIndex = i;
                break;
              }
            }
          }

          if (endIndex !== -1) {
            const arrayText = responseText.substring(startIndex, endIndex + 1);
            console.log(`   Found bracket-matched array: ${arrayText.length} characters`);

            try {
              const fallbackQueries = JSON.parse(arrayText);
              if (Array.isArray(fallbackQueries) && fallbackQueries.length > 0) {
                generatedQueries = fallbackQueries.filter(q => q.name && q.input);
                console.log(
                  `   ✅ Bracket-matched parsing found ${generatedQueries.length} valid queries`
                );
              }
            } catch (error) {
              console.log(`   ❌ Bracket-matched parsing failed: ${error.message}`);
              console.log(`   Array text preview: "${arrayText.substring(0, 200)}..."`);
            }
          }
        }
      }

      if (generatedQueries.length > 0) {
        console.log(`   🎉 Successfully extracted ${generatedQueries.length} queries:`);
        generatedQueries.forEach((q, i) => console.log(`     ${i + 1}. ${q.name}`));

        // Reset invalid counter on successful generation
        this.invalidToolCallCounter = 0;

        return generatedQueries.map(query => ({
          id: `intf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: query.name,
          input: query.input,
        }));
      } else {
        console.log(`   ❌ No valid queries could be extracted`);
        console.log(`   Full response: "${responseText}"`);
        
        // Increment invalid counter to prevent infinite loops
        this.invalidToolCallCounter++;
        console.log(`🚫 Invalid tool call attempt ${this.invalidToolCallCounter}/3`);
      }
    } catch (error) {
      console.log(`⚠️ Intelligent query generation failed: ${error.message}`);
      console.log(`   Error stack: ${error.stack}`);
      
      // Increment invalid counter for errors too
      this.invalidToolCallCounter++;
      console.log(`🚫 Invalid tool call attempt (error) ${this.invalidToolCallCounter}/3`);
    }

    return [];
  }

  // Retry db_query tool calls with improved SQL queries
  async retryDbQueryWithFix(originalToolCall, errorMessage, mcpClient, logger, retryCount = 1) {
    const MAX_DB_QUERY_RETRIES = 2;
    
    if (retryCount > MAX_DB_QUERY_RETRIES) {
      console.log(`🚫 Max db_query retries (${MAX_DB_QUERY_RETRIES}) exceeded for ${originalToolCall.id}`);
      return null; // Return null to indicate retry failure
    }

    console.log(`🔄 Attempting db_query retry ${retryCount}/${MAX_DB_QUERY_RETRIES} for: ${originalToolCall.id}`);
    console.log(`   Original error: ${errorMessage}`);

    try {
      // Generate a corrected query using the LLM
      const fixQueryPrompt = `The following PostgreSQL query failed with an error. Please provide a corrected version of the query that fixes the error.

ORIGINAL QUERY:
${originalToolCall.input.query}

ERROR MESSAGE:
${errorMessage}

INSTRUCTIONS:
- Analyze the error and provide a corrected PostgreSQL query
- Ensure proper table/column names, JOIN syntax, and data types
- Use explicit type casting with :: operator when needed (e.g., column_name::text)
- Respond with ONLY the corrected SQL query, no explanation
- If the query involves dates, use proper PostgreSQL date functions
- If the error mentions missing columns/tables, suggest alternatives or check schema

CORRECTED QUERY:`;

      const queryMessages = [
        {
          role: "system", 
          content: "You are a PostgreSQL expert. Provide only the corrected SQL query, no explanation."
        },
        { role: "user", content: fixQueryPrompt }
      ];

      const correctionResponse = await this.callProviderAPI(queryMessages, [], {
        timeout: 20000,
        temperature: 0.1, // Low temperature for precise SQL corrections
      });

      let correctedQuery = (correctionResponse.text || "").trim();
      
      // Clean up the response - remove markdown code blocks if present
      if (correctedQuery.startsWith("```sql")) {
        correctedQuery = correctedQuery.replace(/^```sql\s*/, '').replace(/\s*```$/, '').trim();
      } else if (correctedQuery.startsWith("```")) {
        correctedQuery = correctedQuery.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
      }

      if (!correctedQuery || correctedQuery.length < 10) {
        console.log(`⚠️ Failed to generate corrected query for retry ${retryCount}`);
        return null;
      }

      console.log(`🔧 Generated corrected query: ${correctedQuery.substring(0, 100)}...`);

      // Create retry tool call with corrected query
      const retryToolCall = {
        id: `retry_dbq_${retryCount}_${originalToolCall.id}`,
        name: "db_query",
        input: {
          query: correctedQuery,
          params: originalToolCall.input.params || [],
          limit: originalToolCall.input.limit || 100
        }
      };

      // Execute the corrected query
      const startTime = Date.now();
      const toolExecutionId = this.performanceLogger?.startToolExecution(
        "db_query",
        "database",
        { tool_input_size: JSON.stringify(retryToolCall.input).length, retry_attempt: retryCount }
      );

      try {
        const mcpResult = await Promise.race([
          mcpClient.callTool(retryToolCall.name, retryToolCall.input),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("MCP tool timeout after 15s")), 15000)
          ),
        ]);

        const executionTime = Date.now() - startTime;

        // Check if the retry succeeded
        const isRetryError =
          mcpResult.text &&
          (mcpResult.text.includes("Error:") ||
            mcpResult.text.includes("Column not found") ||
            mcpResult.text.includes("Table not found") ||
            mcpResult.text.includes("Error Code:") ||
            mcpResult.text.includes("syntax error") ||
            mcpResult.text.toLowerCase().includes("failed"));

        if (isRetryError && retryCount < MAX_DB_QUERY_RETRIES) {
          console.log(`   ⚠️ Retry ${retryCount} failed, attempting retry ${retryCount + 1}...`);
          
          // End current tracking and retry again
          if (toolExecutionId) {
            this.performanceLogger.endToolExecution(toolExecutionId, false, {
              execution_time_ms: executionTime,
              retry_attempt: retryCount,
              error: "Retry failed, attempting next retry"
            });
          }

          return await this.retryDbQueryWithFix(originalToolCall, mcpResult.text, mcpClient, logger, retryCount + 1);
        }

        console.log(`   ${isRetryError ? '⚠️' : '✅'} db_query retry ${retryCount} ${isRetryError ? 'failed' : 'succeeded'}`);

        // End performance tracking
        if (toolExecutionId) {
          this.performanceLogger.endToolExecution(toolExecutionId, !isRetryError, {
            execution_time_ms: executionTime,
            response_size: mcpResult.text?.length || 0,
            error_detected: isRetryError,
            retry_attempt: retryCount,
            retry_success: !isRetryError
          });
        }

        const result = {
          tool_use_id: retryToolCall.id,
          tool_name: retryToolCall.name,
          content: mcpResult.text || "Query retry executed successfully",
          is_error: isRetryError,
          is_retry: true,
          original_tool_id: originalToolCall.id,
          retry_count: retryCount
        };

        // Log the retry attempt
        if (logger) {
          await logger.logToolCall({
            id: retryToolCall.id,
            name: retryToolCall.name,
            input: retryToolCall.input,
            result: mcpResult.text || "Query retry executed successfully",
            executionTime,
            error: isRetryError ? mcpResult.text : null,
            metadata: { 
              mcpServer: true, 
              isError: isRetryError, 
              isRetry: true, 
              originalToolId: originalToolCall.id,
              retryCount: retryCount
            },
          });
        }

        return result;

      } catch (retryError) {
        const executionTime = Date.now() - startTime;
        console.log(`   ❌ db_query retry ${retryCount} execution failed: ${retryError.message}`);

        // End performance tracking for failed retry
        if (toolExecutionId) {
          this.performanceLogger.endToolExecution(toolExecutionId, false, {
            execution_time_ms: executionTime,
            error: retryError.message,
            retry_attempt: retryCount,
            timeout: retryError.message.includes("timeout")
          });
        }

        // Try next retry if available
        if (retryCount < MAX_DB_QUERY_RETRIES) {
          return await this.retryDbQueryWithFix(originalToolCall, retryError.message, mcpClient, logger, retryCount + 1);
        }

        return {
          tool_use_id: `retry_dbq_${retryCount}_${originalToolCall.id}`,
          tool_name: "db_query",
          content: `Retry failed: ${retryError.message}`,
          is_error: true,
          is_retry: true,
          original_tool_id: originalToolCall.id,
          retry_count: retryCount
        };
      }

    } catch (fixGenerationError) {
      console.log(`   ❌ Failed to generate corrected query: ${fixGenerationError.message}`);
      return null;
    }
  }

  // Execute tool calls with comprehensive error handling
  async executeToolCalls(toolCalls, mcpClient, logger = null) {
    console.log(`\n🔧 EXECUTING ${toolCalls.length} REAL MCP TOOL CALLS IN PARALLEL:`);

    // Check if operation is cancelled before starting
    if (this.isOperationCancelled()) {
      console.log('🛑 Tool execution cancelled before starting');
      throw new Error('Operation cancelled by user');
    }

    // Track parallel execution for performance metrics
    if (toolCalls.length > 1) {
      this.performanceLogger?.recordParallelExecution(toolCalls.length);
    }

    // Execute all tool calls in parallel
    const toolPromises = toolCalls.map(async (toolCall, index) => {
      const startTime = Date.now();

      // Start performance tracking for individual tool execution
      const toolExecutionId = this.performanceLogger?.startToolExecution(
        toolCall.name,
        this.getToolCategory(toolCall.name),
        { tool_input_size: JSON.stringify(toolCall.input).length }
      );

      console.log(`  📞 Calling MCP tool [${index + 1}/${toolCalls.length}]: ${toolCall.name}`);

      try {
        // Check for cancellation before executing each tool
        if (this.isOperationCancelled()) {
          console.log(`🛑 Tool execution cancelled before tool ${toolCall.name}`);
          throw new Error('Operation cancelled by user');
        }

        const mcpResult = await Promise.race([
          mcpClient.callTool(toolCall.name, toolCall.input),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("MCP tool timeout after 15s")), 15000)
          ),
          // Add cancellation promise that rejects when operation is cancelled
          new Promise((_, reject) => {
            const checkInterval = setInterval(() => {
              if (this.isOperationCancelled()) {
                clearInterval(checkInterval);
                reject(new Error('Operation cancelled by user'));
              }
            }, 100); // Check every 100ms
            // Clear interval after timeout to prevent memory leak
            setTimeout(() => clearInterval(checkInterval), 15000);
          }),
        ]);

        if (!mcpResult) {
          throw new Error("MCP tool returned null/undefined result");
        }

        const executionTime = Date.now() - startTime;

        // Comprehensive error detection
        const isToolError =
          mcpResult.text &&
          (mcpResult.text.includes("Error:") ||
            mcpResult.text.includes("HTTP error!") ||
            mcpResult.text.includes("status: 4") ||
            mcpResult.text.includes("status: 5") ||
            mcpResult.text.toLowerCase().includes("failed") ||
            mcpResult.text.toLowerCase().includes("exception") ||
            mcpResult.text.toLowerCase().includes("timeout") ||
            mcpResult.text.includes("Column not found") ||
            mcpResult.text.includes("Table not found") ||
            mcpResult.text.includes("Error Code:") ||
            mcpResult.text.includes("Hint:"));

        if (isToolError) {
          console.log(`  ⚠️  MCP tool ${toolCall.name} returned error result`);
        } else {
          console.log(`  ✅ MCP tool ${toolCall.name} completed successfully`);
        }

        // End performance tracking for successful tool execution
        if (toolExecutionId) {
          this.performanceLogger.endToolExecution(toolExecutionId, !isToolError, {
            execution_time_ms: executionTime,
            response_size: mcpResult.text?.length || 0,
            error_detected: isToolError,
          });
        }

        const result = {
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: mcpResult.text || "Tool executed successfully",
          is_error: isToolError,
        };

        // Log tool call if logger is available
        if (logger) {
          await logger.logToolCall({
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
            result: mcpResult.text || "Tool executed successfully",
            executionTime,
            error: isToolError ? mcpResult.text : null,
            metadata: { mcpServer: true, isError: isToolError },
          });
        }

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        console.log(`  ❌ MCP tool ${toolCall.name} failed: ${error.message}`);

        // End performance tracking for failed tool execution
        if (toolExecutionId) {
          this.performanceLogger.endToolExecution(toolExecutionId, false, {
            execution_time_ms: executionTime,
            error: error.message,
            timeout: error.message.includes("timeout"),
          });
        }

        const result = {
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: `Error: ${error.message}`,
          is_error: true,
        };

        if (logger) {
          await logger.logToolCall({
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
            result: null,
            executionTime,
            error: error.message,
            metadata: { mcpServer: true, isError: true },
          });
        }

        return result;
      }
    });

    // Wait for all tool calls to complete
    const results = await Promise.allSettled(toolPromises);

    // Process results and handle any rejections
    const initialResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        // Handle unexpected promise rejections
        console.error(
          `Unexpected tool promise rejection for ${toolCalls[index].name}:`,
          result.reason
        );
        return {
          tool_use_id: toolCalls[index].id,
          tool_name: toolCalls[index].name,
          content: `Unexpected error: ${result.reason.message}`,
          is_error: true,
        };
      }
    });

    // Check for failed db_query calls and attempt retries
    const finalResults = [];
    const retryPromises = [];

    for (let i = 0; i < initialResults.length; i++) {
      const result = initialResults[i];
      const toolCall = toolCalls[i];

      // Check if this is a failed db_query that should be retried
      if (
        toolCall.name === "db_query" && 
        result.is_error && 
        !result.is_retry && // Don't retry retries
        this.shouldRetryDbQuery(result.content)
      ) {
        console.log(`🔄 Scheduling db_query retry for failed tool: ${toolCall.id}`);
        
        // Schedule retry
        const retryPromise = this.retryDbQueryWithFix(toolCall, result.content, mcpClient, logger)
          .then(retryResult => {
            if (retryResult) {
              console.log(`✅ db_query retry succeeded for ${toolCall.id}`);
              return retryResult;
            } else {
              console.log(`❌ db_query retry failed for ${toolCall.id}, using original error`);
              return result; // Use original error if retry failed completely
            }
          })
          .catch(error => {
            console.log(`❌ db_query retry exception for ${toolCall.id}: ${error.message}`);
            return result; // Use original error if retry threw exception
          });

        retryPromises.push(retryPromise);
      } else {
        // Not a retryable db_query error, use original result
        finalResults.push(result);
      }
    }

    // Wait for all retries to complete
    if (retryPromises.length > 0) {
      console.log(`⏳ Waiting for ${retryPromises.length} db_query retries to complete...`);
      const retryResults = await Promise.allSettled(retryPromises);
      
      retryResults.forEach(retryResult => {
        if (retryResult.status === "fulfilled") {
          finalResults.push(retryResult.value);
        } else {
          console.error(`Retry promise failed:`, retryResult.reason);
          // This should not happen since we catch errors in the retry promise
          finalResults.push({
            tool_use_id: "unknown_retry",
            tool_name: "db_query", 
            content: `Retry system error: ${retryResult.reason.message}`,
            is_error: true,
          });
        }
      });
    }

    return finalResults;
  }

  // Determine if a db_query error should be automatically retried
  shouldRetryDbQuery(errorContent) {
    if (!errorContent || typeof errorContent !== 'string') {
      return false;
    }

    const errorText = errorContent.toLowerCase();
    
    // Retry these types of SQL errors that can often be fixed with query corrections
    const retryableErrors = [
      'column does not exist',
      'column not found',
      'table does not exist', 
      'table not found',
      'relation does not exist',
      'syntax error',
      'invalid input syntax',
      'function does not exist',
      'operator does not exist',
      'type does not exist',
      'ambiguous column reference',
      'must appear in group by',
      'invalid reference to from-clause',
      'subquery must return only one column',
      'division by zero',
      'invalid regular expression',
      'date/time field value out of range',
      'integer out of range',
      'numeric field overflow',
      'duplicate column name',
      'permission denied',
      'connection error',
      'timeout',
      'deadlock detected'
    ];

    // Don't retry certain non-fixable errors
    const nonRetryableErrors = [
      'authentication failed',
      'access denied', 
      'insufficient privileges',
      'disk full',
      'out of memory',
      'server shutting down',
      'too many connections'
    ];

    // Check for non-retryable errors first
    if (nonRetryableErrors.some(error => errorText.includes(error))) {
      return false;
    }

    // Check for retryable errors
    return retryableErrors.some(error => errorText.includes(error));
  }

  // Helper method to categorize tools for performance tracking
  getToolCategory(toolName) {
    const categories = {
      // Data access tools
      db_query: "database",
      graph_export: "schema",

      // Analysis tools
      think_sequentially: "analysis",
      plan_tasks: "planning",
      execute_task: "execution",

      // Formatting tools
      markdown_table: "formatting",
      markdown_action_item: "formatting",
      mermaid_diagram: "visualization",
      vega_lite_diagram: "visualization",

      // Communication tools
      provide_options: "communication",
    };

    return categories[toolName] || "unknown";
  }

  // Generate comprehensive analytical response
  async generateAnalyticalResponse(
    originalMessage,
    toolCalls,
    toolResults,
    initialResponse,
    collectedRawPrompts = []
  ) {
    if (toolResults.length === 0) {
      return initialResponse;
    }

    // Build comprehensive tool summary
    const toolSummary = toolResults
      .map((result, index) => {
        const toolCall = toolCalls[index];
        return `Tool: ${toolCall?.name || "unknown"}
Input: ${JSON.stringify(toolCall?.input || {})}
Result: ${result.content}`;
      })
      .join("\n\n");

    const analyticalPrompt = `Based on the user's question: "${originalMessage}"

Here are the tool execution results:
${toolSummary}

Please provide a comprehensive analytical response that:
1. Directly answers the user's question using the tool results
2. Identifies key findings, patterns, and insights from the data
3. Provides actionable recommendations where appropriate
4. Synthesizes information from multiple tools when relevant
5. Uses clear, business-focused language

Important:
- Focus on answering the user's specific question
- Highlight the most important insights
- If data shows trends or patterns, explain their significance
- If there are errors in tool results, work around them gracefully
- Provide context for any numbers or statistics mentioned

Initial context: ${initialResponse}`;

    try {
      const analyticalMessages = [
        {
          role: "system",
          content:
            "You are a senior business analyst. Provide comprehensive, insightful analysis based on the provided data.",
        },
        { role: "user", content: analyticalPrompt },
      ];

      const analyticalResponse = await this.callProviderAPI(analyticalMessages, [], {
        timeout: 60000, // 60 second timeout for analytical response
        temperature: 0.7,
      });

      return analyticalResponse.text || initialResponse;
    } catch (error) {
      console.log(`⚠️ Analytical response generation failed: ${error.message}`);
      // Fallback to basic synthesis
      return `${initialResponse}\n\nBased on the tool execution results:\n${toolSummary}`;
    }
  }

  // Update conversation history with tool integrity
  async updateConversationHistory(message, toolCalls, toolResults, finalResponse) {
    // Build complete conversation turn with tool_use/tool_result pairs
    const userMessage = { role: "user", content: message };

    let assistantContent = [];

    // Add initial response if any
    if (finalResponse && finalResponse !== message) {
      assistantContent.push({ type: "text", text: finalResponse });
    }

    // Add tool_use/tool_result pairs
    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      const toolResult = toolResults[i];

      if (toolCall) {
        assistantContent.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });
      }

      if (toolResult) {
        assistantContent.push({
          type: "tool_result",
          tool_use_id: toolResult.tool_use_id,
          content: toolResult.content,
          is_error: toolResult.is_error,
        });
      }
    }

    const assistantMessage = {
      role: "assistant",
      content: assistantContent.length > 0 ? assistantContent : finalResponse,
    };

    // Atomically add both messages
    this.conversationHistory.push(userMessage, assistantMessage);
  }

  // Utility methods for message analysis
  shouldGenerateIntelligentFollowUps() {
    return true; // Can be overridden by providers
  }

  isDiagramRequest(message) {
    const lowerMessage = message.toLowerCase();
    return /\b(diagram|chart|graph|visual|flow|process|structure|relationship)\b/.test(
      lowerMessage
    );
  }

  isTableRequest(message) {
    const lowerMessage = message.toLowerCase();
    return /\b(table|data|list|show|display|format)\b/.test(lowerMessage);
  }

  isActionItemRequest(message) {
    const lowerMessage = message.toLowerCase();
    return /\b(action|todo|task|plan|step|checklist)\b/.test(lowerMessage);
  }

  // Extract tool calls from provider response (must be implemented by subclass)
  extractToolCalls(response) {
    return []; // Default implementation
  }

  extractJSONFromResponse(responseText, fallbackData = {}) {
    if (!responseText || typeof responseText !== "string") {
      console.warn("Invalid response text for JSON extraction, using fallback");
      return fallbackData;
    }

    try {
      // Method 1: Try direct JSON parsing
      try {
        return JSON.parse(responseText.trim());
      } catch (directParseError) {
        // Continue to more sophisticated extraction methods
      }

      // Method 2: Extract JSON from markdown code blocks
      const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1]);
        } catch (codeBlockParseError) {
          console.warn("Failed to parse JSON from code block");
        }
      }

      // Method 3: Find the first complete JSON object in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (jsonParseError) {
          console.warn("Failed to parse extracted JSON object");
        }
      }

      console.warn("No valid JSON found in response, using fallback data");
      return fallbackData;
    } catch (error) {
      console.error("Error during JSON extraction:", error);
      return fallbackData;
    }
  }

  // Build provider-specific message format (must be implemented by subclass)
  buildProviderMessages(message) {
    return [{ role: "user", content: message }]; // Default implementation
  }

  // Performance and utility methods from original BaseLLM
  trackMetrics(responseTime, tokensUsed = 0, hasError = false, toolCalls = 0) {
    this.metrics.totalRequests++;
    this.metrics.totalTokensUsed += tokensUsed;
    this.metrics.toolCallCount += toolCalls;

    if (hasError) {
      this.metrics.errorCount++;
    }

    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) /
      this.metrics.totalRequests;
  }

  getMetrics() {
    return {
      ...this.metrics,
      errorRate:
        this.metrics.totalRequests > 0 ? this.metrics.errorCount / this.metrics.totalRequests : 0,
      averageToolCalls:
        this.metrics.totalRequests > 0
          ? this.metrics.toolCallCount / this.metrics.totalRequests
          : 0,
      provider: this.getProviderName(),
      model: this.config.model,
    };
  }

  calculateCost(inputTokens, outputTokens) {
    const costs = this.getTokenCosts();
    return (inputTokens * costs.input + outputTokens * costs.output) / 1000000;
  }

  // Task creation determination (for debugging/logging)
  shouldCreateTasks(message) {
    // Simple implementation - this is primarily used for logging
    const lowerMessage = message.toLowerCase();
    return /\b(task|plan|execute|run|do|create|make|build)\b/.test(lowerMessage);
  }

  // Tool usage determination
  shouldUseTools(message) {
    const lowerMessage = message.toLowerCase();

    // Business search patterns should use tools
    const businessSearchPatterns = [
      /^(find|search|show|get|look up|review)\s+(engagements?|deals?|contracts?|records?)/i,
      /^(find|search|show|get|review)\s+\w+\s+(engagements?|deals?|contracts?)/i,
      /engagements?\s+with\s+\w+/i,
      /deals?\s+(for|with)\s+\w+/i,
      /contracts?\s+(for|with)\s+\w+/i,
      /^(who is|tell me about|about)\s+\w+$/i,
      /^(tell me|about|what).*(our|the)\s+(deals?|contracts?|customers?|clients?)/i,
      /^(find|show|list)\s+(deals?|contracts?|customers?)/i,
    ];

    if (businessSearchPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Current/recent information patterns
    const currentInfoPatterns = [
      /(latest|recent|current|new|newest)/i,
      /(2024|2025|today|now|this year)/i,
      /(what.*(happening|released|announced))/i,
      /(when.*(released|announced|coming))/i,
      /(who.*(won|performing|releasing))/i,
    ];

    if (currentInfoPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Skip tools for basic greetings
    const skipToolsPatterns = [
      /^(hello|hi|hey|thanks|thank you|bye|goodbye)$/i,
      /^(yes|no|ok|okay)$/i,
      /^(what|tell me|show me).*(command|help)$/i,
      /^(hey\?|hello\?|hi\?)$/i,
      /^(where's|what's|where is|what is).*(your|the).*(conclusion|answer|response|result)$/i,
      /^(and\?|so\?|then\?|what\?|now\?)$/i,
      /^(continue|go on|keep going|what else)$/i,
    ];

    if (skipToolsPatterns.some(pattern => pattern.test(lowerMessage))) {
      return false;
    }

    // Default: Use tools for most queries
    return true;
  }

  // Context update following Claude's pattern
  async updateContext(message, toolCalls, response) {
    if (message.length > 20) {
      this.conversationContext.lastTopic = message.slice(0, 100);
    }

    if (toolCalls && toolCalls.length > 0) {
      this.conversationContext.recentToolUse = toolCalls.map(tc => ({
        name: tc.name,
        timestamp: Date.now(),
      }));

      this.conversationContext.recentToolUse = this.conversationContext.recentToolUse.slice(-5);
    }

    if (response.includes("[pending]") || response.includes("task_")) {
      const taskMatches = response.match(/task_\w+/g);
      if (taskMatches) {
        this.conversationContext.activeTasks = [...new Set(taskMatches)];
      }
    }

    if (response.includes("task status") && !response.includes("[pending]")) {
      this.conversationContext.activeTasks = [];
    }
  }

  // Utility methods
  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return this.conversationHistory.slice();
  }

  getStats() {
    const messages = this.conversationHistory;
    const userMessages = messages.filter(m => m.role === "user").length;
    const assistantMessages = messages.filter(m => m.role === "assistant").length;

    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      provider: this.getProviderName(),
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    };
  }

  setModel(model) {
    this.config.model = model;
  }

  setTemperature(temperature) {
    this.config.temperature = Math.max(0, Math.min(1, temperature));
  }

  setMaxTokens(maxTokens) {
    this.config.maxTokens = maxTokens;
  }

  // Business Intelligence and Analysis Methods (from Claude's sophisticated implementation)

  synthesizeBasicResponse(assistantResponse, toolResults, toolCalls) {
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

    return synthesized;
  }

  isMermaidDiagramRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    // Direct Mermaid diagram type requests
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

    // Structure/Process context indicators
    const structuralContextPatterns = [
      /(?:show|visualize|map|diagram)\s+(?:the\s+)?(?:process|workflow|flow|sequence|steps|procedure)/i,
      /(?:how|what)\s+(?:does|is)\s+(?:the\s+)?(?:process|workflow|flow|system|architecture)/i,
      /(?:connect|relationship|link)\s+between/i,
      /(?:step|stage|phase)\s+(?:by\s+step|through)/i,
      /(?:from|to)\s+.*(?:to|from)/i,
      /approval\s+process/i,
      /data\s+flow/i,
    ];

    return (
      directMermaidPatterns.some(pattern => pattern.test(lowerMessage)) ||
      structuralContextPatterns.some(pattern => pattern.test(lowerMessage))
    );
  }

  isMarkdownTableRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    const tablePatterns = [
      /(?:create|generate|make|show|format|display)\s+(?:a|an)?\s*(?:table|spreadsheet|grid)/i,
      /(?:in|as|to)\s+(?:a\s+)?(?:table|spreadsheet|tabular)\s+format/i,
      /(?:organize|structure|format)\s+(?:this|the)?\s*(?:data|information|results)\s+(?:in|as|into)\s+(?:a\s+)?table/i,
      /tabulate/i,
      /(?:rows|columns)\s+and\s+(?:columns|rows)/i,
      /comparison\s+table/i,
      /summary\s+table/i,
    ];

    return tablePatterns.some(pattern => pattern.test(lowerMessage));
  }

  isMarkdownActionItemRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    const actionItemPatterns = [
      /(?:create|generate|make|show)\s+(?:a|an)?\s*(?:action\s+item|todo|task)\s+list/i,
      /(?:action\s+items?|tasks?|todos?)\s+(?:for|from|based\s+on)/i,
      /(?:next\s+steps?|follow\s+up\s+actions?)/i,
      /(?:checklist|action\s+plan)/i,
      /what\s+(?:should|do)\s+(?:i|we|they)\s+(?:do|need\s+to\s+do)/i,
      /(?:organize|structure|format)\s+(?:this|the)?\s*(?:into|as)\s+(?:action\s+items?|tasks?)/i,
    ];

    return actionItemPatterns.some(pattern => pattern.test(lowerMessage));
  }

  isVegaLiteDiagramRequest(message) {
    if (!message || typeof message !== "string") {
      return false;
    }

    const lowerMessage = message.toLowerCase();

    const chartPatterns = [
      /(?:create|generate|make|show)\s+(?:a|an)?\s*(?:chart|graph|plot|visualization)/i,
      /(?:bar|line|scatter|pie|area|histogram|box\s+plot)\s+chart/i,
      /(?:visualize|plot)\s+(?:this|the)?\s*data/i,
      /(?:trend|correlation|distribution|comparison)\s+(?:chart|graph)/i,
      /(?:time\s+series|dashboard|analytics)\s+(?:chart|visualization)/i,
    ];

    return chartPatterns.some(pattern => pattern.test(lowerMessage));
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

    // Check if we mentioned knowledge cutoff already
    const hasKnowledgeCutoffMention =
      lowerResponse.includes("knowledge") &&
      (lowerResponse.includes("cutoff") || lowerResponse.includes("training"));

    // Only warn if time-sensitive and no mention yet
    return (
      timeSensitivePatterns.some(pattern => pattern.test(lowerMessage)) &&
      !hasKnowledgeCutoffMention
    );
  }

  intelligentDiagramAnalysis(message) {
    if (!message || typeof message !== "string") {
      return null;
    }

    const lowerMessage = message.toLowerCase();

    // Analyze what type of diagram would be most appropriate
    if (this.isMermaidDiagramRequest(message)) {
      return {
        type: "mermaid",
        confidence: "high",
        suggested: "flowchart",
        reason: "Process or workflow visualization detected",
      };
    }

    if (this.isVegaLiteDiagramRequest(message)) {
      return {
        type: "vega-lite",
        confidence: "high",
        suggested: "bar",
        reason: "Data visualization request detected",
      };
    }

    // Check for data analysis patterns that might benefit from charts
    if (/\b(analyze|analysis|trend|compare|comparison|metric|performance)\b/.test(lowerMessage)) {
      return {
        type: "vega-lite",
        confidence: "medium",
        suggested: "line",
        reason: "Analysis context suggests data visualization",
      };
    }

    return null;
  }

  /**
   * Initialize AbortController for current operation
   */
  startOperation() {
    this.currentAbortController = new AbortController();
    this.operationCancelled = false;
    return this.currentAbortController;
  }

  /**
   * Cancel current operation
   */
  cancelCurrentOperation() {
    console.log(`🛑 Cancelling ${this.getProviderName()} operation`);
    this.operationCancelled = true;
    
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    
    // Set a new AbortController for the next operation
    this.currentAbortController = new AbortController();
  }

  /**
   * Check if current operation is cancelled
   */
  isOperationCancelled() {
    return this.operationCancelled || (this.currentAbortController && this.currentAbortController.signal.aborted);
  }

  /**
   * Reset cancellation state
   */
  resetCancellation() {
    this.operationCancelled = false;
    this.currentAbortController = new AbortController();
  }

  /**
   * Throw cancellation error if operation is cancelled
   */
  checkCancellation() {
    if (this.isOperationCancelled()) {
      throw new Error('Operation cancelled by user');
    }
  }
}
