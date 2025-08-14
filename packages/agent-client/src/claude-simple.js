import Anthropic from "@anthropic-ai/sdk";

export class SimpleClaudeClient {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error("Claude API key is required");
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });

    this.model = options.model || "claude-3-5-sonnet-20241022";
    this.maxTokens = options.maxTokens || 4000;
    this.temperature = options.temperature || 0.7;
    this.conversationHistory = [];
    this.systemPrompt = this.createSystemPrompt();
    this.conversationContext = {
      lastTopic: null,
      activeTasks: [],
      recentToolUse: [],
    };
  }

  createSystemPrompt() {
    return `You are Aden, an AI assistant with access to specialized tools through an MCP server.

CRITICAL: ALWAYS PRIORITIZE REAL-TIME TOOLS OVER TRAINING DATA:
- Your training data has a knowledge cutoff and may be outdated
- ALWAYS use tools for current information, recent events, or specific factual queries
- For ANY question about current events, recent releases, latest news, or time-sensitive information, you MUST use tools
- When in doubt between using tools vs. training data, ALWAYS choose tools

Tool Usage Priority:
1. For current/recent information: ALWAYS use plan_tasks + execute_task with web search
2. For factual queries that could change: ALWAYS use tools first
3. For explanations of general concepts: OK to use training data, but mention knowledge cutoff
4. For analysis requiring current data: MUST use tools

IMPORTANT Usage Patterns:
- When users ask about "latest", "recent", "current", "2024", "2025" - IMMEDIATELY use tools
- When users say \"run tasks\", \"execute tasks\", \"go ahead\", \"continue\" - use execute_task
- For research requests ("help me research", "compare options") - use plan_tasks
- Use get_task_status to check progress and execute_task to complete work
- Use think_sequentially for complex analysis requiring structured thinking

Available MCP Tools:
- think_sequentially: For complex problem analysis requiring structured thinking
- plan_tasks: For breaking down objectives into manageable, prioritized tasks (includes web_search capabilities)
- execute_task: ACTUALLY EXECUTE pending tasks with real web search and data fetching
- get_task_status: For checking current status of all planned tasks

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
- When users ask about "our deals", "our customers", "engagements", etc. you MUST use knowledge_search
- NEVER ask for clarification on business queries - search first, then ask if needed
- For queries like "tell me about our deals" - immediately call knowledge_search with "deals"
- For queries like "find Sang's contracts" - immediately call knowledge_search with "Sang contracts"

Default to tool use for maximum accuracy and recency.`;
  }

  // Smart tool and task detection - BIASED TOWARD TOOL USE
  shouldUseTools(message) {
    const lowerMessage = message.toLowerCase();

    // Direct business search requests should use knowledge_search directly
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

    // ALWAYS use tools for current/recent information
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

    // ALWAYS use tools for specific factual queries
    const factualPatterns = [
      /(what is|what are|who is|when is|where is|how much|how many)/,
      /^(find|search|look up|check)/i,
      /(price|cost|release date|schedule)/i,
      /(statistics|data|numbers|metrics)/i,
    ];

    if (factualPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Only skip tools for very basic greetings and simple confirmations
    const skipToolsPatterns = [
      /^(hello|hi|hey|thanks|thank you|bye|goodbye)$/i,
      /^(yes|no|ok|okay)$/i,
      /^(what|tell me|show me).*(command|help)$/i,
    ];

    if (skipToolsPatterns.some(pattern => pattern.test(lowerMessage))) {
      return false;
    }

    // Check if this needs tasks vs direct response
    const needsTasks = this.shouldCreateTasks(message);

    // Always check for explicit task execution commands
    const explicitTaskCommands = [
      /^(run tasks|execute tasks|run the tasks|execute the tasks)$/i,
      /^(go ahead|continue|proceed)$/i,
      /^(run all|execute all|do the work)$/i,
      /^(start|begin|let's go)$/i,
      /^(task status|get task status|status)$/i,
      /(what tools|list tools|available tools)/i,
    ];

    if (explicitTaskCommands.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Context-aware decisions - if we have active tasks, be more liberal with tool usage
    if (this.conversationContext.activeTasks.length > 0) {
      const taskRelatedPatterns = [
        /(continue|finish|complete|next|status|progress)/i,
        /(run|execute|do|perform)/i,
        /(tasks|work|analysis)/i,
        /(what.*next|how.*going|show.*results)/i,
      ];

      if (taskRelatedPatterns.some(pattern => pattern.test(lowerMessage))) {
        return true;
      }
    }

    // AGGRESSIVE TOOL USE: Use tools for any follow-up questions or requests
    const followUpPatterns = [
      /(what.*answer|answer|explain|details|more|clarify)/i,
      /(didn't|don't|not|need|want)/i,
      /(tell me|show me|give me)/i,
    ];

    if (followUpPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Use tools for work that needs task breakdown
    if (needsTasks) {
      const taskPatterns = [
        /(research|investigate|analyze|compare|evaluate)/i,
        /(help me plan|help me research|help me evaluate)/i,
        /(find information about|gather data on)/i,
      ];

      // If it needs tasks, likely needs tools too
      return taskPatterns.some(pattern => pattern.test(lowerMessage)) || true;
    }

    // DEFAULT TO TOOL USE for anything that could benefit from current data
    const generalInfoPatterns = [
      /(about|information|tell me)/i,
      /(explain|describe|overview)/i,
      /(how.*work|what.*like)/i,
    ];

    // For general info requests, use tools unless it's clearly a concept explanation
    if (generalInfoPatterns.some(pattern => pattern.test(lowerMessage))) {
      // Only skip tools if it's clearly asking for concept explanation
      const conceptPatterns = [
        /(how to|step by step|steps to|process of)/i,
        /(define|definition|meaning of)/i,
      ];
      return !conceptPatterns.some(pattern => pattern.test(lowerMessage));
    }

    // DEFAULT: ALWAYS use tools unless explicitly excluded above
    // We want to be very aggressive about tool usage to prevent LLM from faking
    return true;
  }

  // Determine if request needs task breakdown vs direct response - BIASED TOWARD TASKS
  shouldCreateTasks(message) {
    const lowerMessage = message.toLowerCase();

    // Direct search requests should NOT create elaborate task plans
    const directSearchPatterns = [
      /^(find|search|show|get|look up|review)\s+(engagements?|deals?|contracts?|records?)/i,
      /^(find|search|show|get|look up|review)\s+\w+\s+(engagements?|deals?|contracts?)/i,
      /engagements?\s+with\s+\w+/i,
      /deals?\s+(for|with)\s+\w+/i,
      /contracts?\s+(for|with)\s+\w+/i,
      /^(tell me|about|what).*(our|the)\s+(deals?|contracts?|customers?|clients?)/i,
      /^(find|show|list)\s+(deals?|contracts?|customers?)/i,
    ];

    if (directSearchPatterns.some(pattern => pattern.test(lowerMessage))) {
      return false; // Use direct tool calls instead
    }

    // ALWAYS create tasks for current/recent information requests
    const currentInfoPatterns = [
      /(latest|recent|current|new|newest)/i,
      /(2024|2025|today|now|this year)/i,
      /(what.*(happening|released|announced))/i,
    ];

    if (currentInfoPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Don't create tasks for simple direct requests
    const simpleDirectPatterns = [
      /^(find|search|show|tell me about|who is|what is)\s+\w+$/i, // "find sang", "who is sang"
      /^(show|display|list)\s+(tasks?|status)$/i,
    ];

    if (simpleDirectPatterns.some(pattern => pattern.test(lowerMessage))) {
      return false;
    }

    // ALWAYS create tasks for factual queries that could change over time
    const timeFactualPatterns = [
      /(price|cost|release date|schedule)/i,
      /(statistics|data|numbers|metrics)/i,
      /(status|state|condition)/i,
    ];

    if (timeFactualPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // Don't create tasks ONLY for pure explanation/process requests
    const explanationOnlyPatterns = [
      /(how to|how do i).*(work|build|create|make)/i,
      /(what are the steps|step by step|steps to)/i,
      /(explain how|tell me how|show me how)/i,
      /(define|definition|meaning of)/i,
      /(process of|procedure for)/i,
    ];

    if (explanationOnlyPatterns.some(pattern => pattern.test(lowerMessage))) {
      return false;
    }

    // Create tasks for complex research/work requests
    const complexWorkPatterns = [
      /(help me research|help me evaluate|help me analyze)/i,
      /(compare.*(options|alternatives|solutions|frameworks|technologies|different))/i,
      /(comprehensive|detailed|full).*(analysis|research|overview)/i,
      /(research.*(market|competitors|technologies))/i,
      /(analyze.*(feasibility|viability|options))/i,
    ];

    if (complexWorkPatterns.some(pattern => pattern.test(lowerMessage))) {
      return true;
    }

    // DEFAULT: Don't create tasks for simple requests
    const basicPatterns = [
      /^(hello|hi|hey|thanks|thank you|bye|goodbye)$/i,
      /(how.*work.*general|what.*concept|explain.*theory)/i,
      /^(tell me about|about|information|overview)\s+\w+$/i, // Simple info requests
    ];

    return !basicPatterns.some(pattern => pattern.test(lowerMessage));
  }

  // Determine if we should warn about knowledge cutoff
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

    // Warn for factual claims that could be outdated
    const factualClaimPatterns = [
      /(currently|as of|recently|now)/i,
      /(market.*worth|revenue|users|downloads)/i,
      /(ceo|president|leader.*is)/i,
    ];

    if (factualClaimPatterns.some(pattern => pattern.test(lowerResponse))) {
      return true;
    }

    // Don't warn for basic greetings or concept explanations
    const skipWarningPatterns = [
      /^(hello|hi|hey|thanks|thank you|bye|goodbye)/i,
      /(concept|theory|principle|definition|generally|typically)/i,
    ];

    return !skipWarningPatterns.some(pattern => pattern.test(lowerMessage));
  }

  // Update conversation context
  updateContext(message, toolCalls, response) {
    // Track topics
    if (message.length > 20) {
      this.conversationContext.lastTopic = message.slice(0, 100);
    }

    // Track tool usage
    if (toolCalls && toolCalls.length > 0) {
      this.conversationContext.recentToolUse = toolCalls.map(tc => ({
        name: tc.name,
        timestamp: Date.now(),
      }));

      // Clean old tool use (keep last 5)
      this.conversationContext.recentToolUse = this.conversationContext.recentToolUse.slice(-5);
    }

    // Track active tasks from response
    if (response.includes("[pending]") || response.includes("task_")) {
      const taskMatches = response.match(/task_\w+/g);
      if (taskMatches) {
        this.conversationContext.activeTasks = [...new Set(taskMatches)];
      }
    }

    // Clear active tasks if no pending tasks remain
    if (response.includes("task status") && !response.includes("[pending]")) {
      this.conversationContext.activeTasks = [];
    }
  }

  async chat(message, mcpClient = null) {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: "user",
        content: message,
      });

      // Prepare messages for Claude
      const messages = this.conversationHistory.slice();

      // Create tool definitions for Claude if MCP client is available and tools are appropriate
      const shouldUseTools = this.shouldUseTools(message);
      const shouldCreateTasks = this.shouldCreateTasks(message);
      const tools = mcpClient && shouldUseTools ? this.createClaudeTools(mcpClient) : [];

      // LOG: Tool selection decision
      console.log(`\n🔍 TOOL SELECTION DEBUG:`);
      console.log(`  Message: "${message}"`);
      console.log(`  shouldUseTools: ${shouldUseTools}`);
      console.log(`  shouldCreateTasks: ${shouldCreateTasks}`);
      console.log(`  MCP client available: ${!!mcpClient}`);
      console.log(`  Tools provided to Claude: ${tools.length}`);

      // Make initial Claude API call
      const response = await Promise.race([
        this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system: this.systemPrompt,
          messages: messages,
          tools: tools.length > 0 ? tools : undefined,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Claude API timeout (initial call)")), 20000)
        ),
      ]);

      // Process response content

      // Process the response
      let assistantResponse = "";
      const toolCalls = [];

      for (const content of response.content) {
        if (content.type === "text") {
          assistantResponse += content.text;
        } else if (content.type === "tool_use") {
          toolCalls.push(content);
        }
      }

      // Execute tool calls if any with enhanced response synthesis
      if (toolCalls.length > 0 && mcpClient) {
        // Execute tools and synthesize results
        const toolResults = await this.executeToolCalls(toolCalls, mcpClient);

        // Create a follow-up call to Claude with tool results for analysis
        const synthesizedResponse = await this.generateAnalyticalResponse(
          message,
          toolCalls,
          toolResults,
          assistantResponse
        );

        // Update conversation context
        this.updateContext(message, toolCalls, synthesizedResponse);

        // Add conversation to history
        this.conversationHistory.push({
          role: "assistant",
          content: [{ type: "text", text: synthesizedResponse }],
        });

        return {
          response: synthesizedResponse,
          toolCalls: toolCalls,
          usage: response.usage,
        };
      } else {
        // No tool calls - add knowledge cutoff warning if appropriate
        const shouldWarnAboutCutoff = this.shouldWarnAboutKnowledgeCutoff(
          message,
          assistantResponse
        );
        let finalResponse = assistantResponse;

        if (shouldWarnAboutCutoff) {
          finalResponse +=
            "\n\n⚠️ **Note:** This response is based on my training data which has a knowledge cutoff. For the most current information, I can search the web for you. Would you like me to research this topic with current data?";
        }

        // Add response to history
        this.conversationHistory.push({
          role: "assistant",
          content: response.content,
        });

        return {
          response: finalResponse,
          toolCalls: toolCalls,
          usage: response.usage,
        };
      }
    } catch (error) {
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  createClaudeTools(mcpClient) {
    const mcpTools = mcpClient.getAvailableTools();

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

  async executeToolCalls(toolCalls, mcpClient) {
    console.log(`\n🔧 EXECUTING ${toolCalls.length} REAL MCP TOOL CALLS:`);

    const results = [];

    // Enhanced execution - handle batch processing for related tasks
    const batchableTools = ["execute_task"];
    const batchCalls = toolCalls.filter(call => batchableTools.includes(call.name));
    const individualCalls = toolCalls.filter(call => !batchableTools.includes(call.name));

    // Execute individual calls first
    for (const toolCall of individualCalls) {
      console.log(`  📞 Calling MCP tool: ${toolCall.name}`);
      try {
        const mcpResult = await Promise.race([
          mcpClient.callTool(toolCall.name, toolCall.input),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("MCP tool timeout")), 15000)
          ),
        ]);

        // Check if tool returned an error in the content
        const isToolError = mcpResult.text && mcpResult.text.includes("Error:");

        if (isToolError) {
          console.log(`  ⚠️  MCP tool ${toolCall.name} returned error result`);
        } else {
          console.log(`  ✅ MCP tool ${toolCall.name} completed successfully`);
        }

        results.push({
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: mcpResult.text || "Tool executed successfully",
          is_error: isToolError,
        });
      } catch (error) {
        console.log(`  ❌ MCP tool ${toolCall.name} failed: ${error.message}`);
        results.push({
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: `Error: ${error.message}`,
          is_error: true,
        });
      }
    }

    // Execute batch calls with auto-continuation
    if (batchCalls.length > 0) {
      await this.executeBatchTasks(batchCalls, mcpClient, results);
    }

    return results;
  }

  async executeBatchTasks(batchCalls, mcpClient, results) {
    for (const toolCall of batchCalls) {
      console.log(`  📞 Calling batch MCP tool: ${toolCall.name}`);
      try {
        let mcpResult = await mcpClient.callTool(toolCall.name, toolCall.input);

        console.log(`  ✅ Batch MCP tool ${toolCall.name} completed successfully`);

        results.push({
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: mcpResult.text || "Task executed successfully",
        });

        // Auto-continue remaining tasks if this was successful
        if (toolCall.name === "execute_task" && !mcpResult.text.includes("Error")) {
          await this.autoCompleteRemainingTasks(mcpClient, results);
        }
      } catch (error) {
        console.log(`  ❌ Batch MCP tool ${toolCall.name} failed: ${error.message}`);
        results.push({
          tool_use_id: toolCall.id,
          tool_name: toolCall.name,
          content: `Error: ${error.message}`,
          is_error: true,
        });
      }
    }
  }

  async autoCompleteRemainingTasks(mcpClient, results) {
    try {
      // Get task status to see if there are pending tasks
      const statusResult = await mcpClient.callTool("get_task_status", {});

      if (statusResult.text && statusResult.text.includes("[pending]")) {
        // Show that we're continuing with remaining tasks
        results.push({
          tool_use_id: "continuation_notice",
          tool_name: "system",
          content: `🔄 **Continuing with remaining tasks...**`,
          is_progress: true,
        });

        // Extract pending task IDs and execute them
        const pendingMatches = statusResult.text.match(/\[pending\]\s*(\w+):/g);

        if (pendingMatches && pendingMatches.length > 0) {
          for (const match of pendingMatches.slice(0, 3)) {
            // Limit to 3 auto-executions
            const taskId = match.match(/\[pending\]\s*(\w+):/)[1];

            // Show progress for each auto-execution
            results.push({
              tool_use_id: `auto_progress_${taskId}`,
              tool_name: "system",
              content: `⚙️ **Auto-executing:** ${taskId}...`,
              is_progress: true,
            });

            const taskResult = await mcpClient.callTool("execute_task", {
              taskId,
            });
            results.push({
              tool_use_id: `auto_${taskId}`,
              tool_name: "execute_task",
              content: taskResult.text || "Task completed automatically",
            });

            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    } catch (error) {
      // Silent failure for auto-completion
    }
  }

  async synthesizeResponse(assistantResponse, toolResults, toolCalls) {
    // Enhanced response synthesis
    let synthesized = assistantResponse;

    // Filter out progress messages for separate display
    const contentResults = toolResults.filter(r => !r.is_progress);
    const progressMessages = toolResults.filter(r => r.is_progress);

    // Group content results by tool type
    const thinkingResults = contentResults.filter(r =>
      toolCalls.find(tc => tc.id === r.tool_use_id && tc.name === "think_sequentially")
    );
    const planningResults = contentResults.filter(r =>
      toolCalls.find(tc => tc.id === r.tool_use_id && tc.name === "plan_tasks")
    );
    const executionResults = contentResults.filter(
      r =>
        toolCalls.find(tc => tc.id === r.tool_use_id && tc.name === "execute_task") ||
        r.tool_name === "execute_task"
    );
    const statusResults = contentResults.filter(r =>
      toolCalls.find(tc => tc.id === r.tool_use_id && tc.name === "get_task_status")
    );
    const knowledgeResults = contentResults.filter(r =>
      toolCalls.find(tc => tc.id === r.tool_use_id && tc.name === "knowledge_search")
    );
    const errorResults = contentResults.filter(r => r.is_error);

    // Add progress messages first if any
    if (progressMessages.length > 0) {
      const progressContent = progressMessages.map(p => p.content).join("\n");
      synthesized += `\n\n${progressContent}`;
    }

    // Synthesize based on tool types used
    if (thinkingResults.length > 0) {
      synthesized += this.formatThinkingResults(thinkingResults);
    }

    if (planningResults.length > 0) {
      synthesized += this.formatPlanningResults(planningResults);
    }

    if (executionResults.length > 0) {
      synthesized += this.formatExecutionResults(executionResults);
    }

    if (statusResults.length > 0 && executionResults.length === 0) {
      synthesized += this.formatStatusResults(statusResults);
    }

    if (knowledgeResults.length > 0) {
      synthesized += this.formatKnowledgeResults(knowledgeResults);
    }

    // Show error results prominently
    if (errorResults.length > 0) {
      synthesized += this.formatErrorResults(errorResults);
    }

    // Add process summary for complex tool usage
    const processDescription = this.describeThinkingProcess(toolCalls, contentResults);
    if (processDescription) {
      synthesized += processDescription;
    }

    return synthesized;
  }

  formatThinkingResults(results) {
    const content = results.map(r => r.content).join("\n\n");
    return `\n\n🧠 **Thinking Process:**\n${content}`;
  }

  formatPlanningResults(results) {
    const content = results.map(r => r.content).join("\n\n");

    // Check if this looks like a preview (contains approach description)
    if (content.includes("Systematic research approach") || content.includes("preview")) {
      return `\n\n📋 **Research Plan:**\n${content}\n\nWould you like me to proceed with this research plan?`;
    }

    // For business queries, auto-execute instead of asking
    if (this.isBusinessQuery(content)) {
      return `\n\n📋 **Research Plan Created**\n${content}\n\n*Executing tasks automatically...*`;
    }

    return `\n\n📋 **Research Plan:**\n${content}`;
  }

  isBusinessQuery(content) {
    const businessTerms = ["deals", "contracts", "engagements", "customers", "clients", "sales"];
    return businessTerms.some(term => content.toLowerCase().includes(term));
  }

  formatExecutionResults(results) {
    if (results.length === 1) {
      const analysis = this.analyzeExecutionResult(results[0]);
      return `\n\n🔧 **Research Results:**\n${results[0].content}\n\n${analysis}`;
    } else {
      const formattedResults = results
        .map((r, i) => {
          const taskNum = i + 1;
          return `**Task ${taskNum} Complete:**\n${r.content}`;
        })
        .join("\n\n");

      const synthesizedAnalysis = this.synthesizeMultipleResults(results);
      return `\n\n🔧 **Research Results:**\n${formattedResults}\n\n${synthesizedAnalysis}`;
    }
  }

  analyzeExecutionResult(result) {
    const content = result.content.toLowerCase();

    // Analyze knowledge base search results
    if (
      content.includes("internal records") ||
      content.includes("knowledge") ||
      content.includes("exp_contacts")
    ) {
      return this.analyzeKnowledgeResults(result.content);
    }

    // Analyze web search results
    if (
      content.includes("web search results") ||
      (content.includes("found") && content.includes("relevant results"))
    ) {
      return this.analyzeWebResults(result.content);
    }

    // Analyze strategy/planning results
    if (
      content.includes("strategic framework") ||
      content.includes("phases") ||
      content.includes("timeframe")
    ) {
      return this.analyzeStrategyResults(result.content);
    }

    return "📊 **Key Takeaway:** Research completed successfully.";
  }

  analyzeKnowledgeResults(content) {
    // Extract key insights from knowledge base results - generic analysis
    const insights = [];

    // Extract table names and count records
    const tableMatches = content.match(/\*\*(\w+)\*\*/g);
    const tables = {};

    if (tableMatches) {
      tableMatches.forEach(match => {
        const tableName = match.replace(/\*\*/g, "");
        tables[tableName] = (tables[tableName] || 0) + 1;
      });
    }

    // Analyze content generically
    const totalRecords = Object.values(tables).reduce((sum, count) => sum + count, 0);
    if (totalRecords > 0) {
      insights.push(
        `📊 **Records Found:** ${totalRecords} across ${Object.keys(tables).length} table(s)`
      );

      // List tables found
      Object.entries(tables).forEach(([table, count]) => {
        insights.push(`   📋 ${table}: ${count} records`);
      });
    }

    // Look for business-relevant content patterns
    if (content.includes("deal") || content.includes("contract") || content.includes("agreement")) {
      insights.push("💼 Deal/contract related information found");
    }

    if (content.includes("engagement") || content.includes("interaction")) {
      insights.push("🤝 Customer engagement data available");
    }

    if (content.includes("contact") || content.includes("customer") || content.includes("client")) {
      insights.push("👤 Customer/contact information present");
    }

    // Look for email addresses
    const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      insights.push(`📧 Contact info: ${emailMatch[1]}`);
    }

    // Look for amounts/values
    const amountMatches = content.match(/(\$?\d{1,3}(?:,\d{3})*|\d+)/g);
    if (amountMatches && amountMatches.length > 0) {
      const numbers = amountMatches
        .map(m => parseInt(m.replace(/[$,]/g, "")))
        .filter(n => !isNaN(n) && n > 100);
      if (numbers.length > 0) {
        const maxValue = Math.max(...numbers);
        insights.push(`💰 Notable values: up to ${maxValue.toLocaleString()}`);
      }
    }

    // Look for status indicators
    const statusTerms = ["active", "pending", "closed", "won", "negotiation", "proposal"];
    const foundStatuses = statusTerms.filter(term => content.toLowerCase().includes(term));
    if (foundStatuses.length > 0) {
      insights.push(`📈 Status indicators: ${foundStatuses.join(", ")}`);
    }

    if (insights.length === 0) {
      insights.push("ℹ️ Limited structured information found in internal records");
    }

    return `📊 **Key Insights:**\n${insights.map(i => `   ${i}`).join("\n")}`;
  }

  analyzeWebResults(content) {
    const resultCount = (content.match(/\d+\.\s\*\*/g) || []).length;

    if (resultCount === 0) {
      return "📊 **Key Insight:** No relevant external information found.";
    }

    return `📊 **Key Insight:** Found ${resultCount} external references for additional context.`;
  }

  analyzeStrategyResults(content) {
    if (content.includes("phases") && content.includes("success_metrics")) {
      return "📊 **Key Insight:** Strategic framework developed with implementation phases and success metrics.";
    }

    return "📊 **Key Insight:** Strategic planning completed.";
  }

  synthesizeMultipleResults(results) {
    const insights = [];
    let hasKnowledgeData = false;
    let hasWebData = false;

    results.forEach(result => {
      const content = result.content.toLowerCase();

      if (content.includes("internal records") || content.includes("exp_contacts")) {
        hasKnowledgeData = true;

        // Extract specific insights
        if (content.includes("customer")) {
          insights.push("🎯 Confirmed: Active customer in our system");
        }
        if (content.includes("champion") || content.includes("stakeholder")) {
          insights.push("⭐ Key Role: Implementation champion/stakeholder");
        }
        if (content.includes("@")) {
          const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (emailMatch) {
            insights.push(`📧 Contact: ${emailMatch[1]}`);
          }
        }
      }

      if (content.includes("web search") || content.includes("relevant results")) {
        hasWebData = true;
      }
    });

    // Add summary based on data types found
    if (hasKnowledgeData && hasWebData) {
      insights.unshift(
        "🔍 **Research Complete:** Combined internal records with external validation"
      );
    } else if (hasKnowledgeData) {
      insights.unshift("🏢 **Internal Data Found:** Located relevant customer information");
    }

    // Add actionable recommendations
    if (hasKnowledgeData) {
      insights.push(
        "💡 **Next Steps:** Review engagement history and identify expansion opportunities"
      );
    }

    if (insights.length === 0) {
      insights.push("ℹ️ Research completed with mixed results");
    }

    return `📊 **Summary & Insights:**\n${insights.map(i => `   ${i}`).join("\n")}`;
  }

  formatStatusResults(results) {
    const content = results.map(r => r.content).join("\n\n");
    return `\n\n📊 **Current Status:**\n${content}`;
  }

  formatKnowledgeResults(results) {
    const content = results.map(r => r.content).join("\n\n");

    // Encourage analysis by adding a prompt for interpretation
    return `\n\n🔍 **Knowledge Search Results:**\n${content}\n\n**Analysis needed:** Please interpret these results to answer the original question with clear conclusions and recommendations.`;
  }

  formatErrorResults(results) {
    const content = results.map(r => r.content).join("\n\n");
    return `\n\n❌ **Tool Errors:**\n${content}`;
  }

  describeThinkingProcess(toolCalls, toolResults) {
    const processSteps = [];

    toolCalls.forEach((call, i) => {
      const result = toolResults[i];
      if (!result || result.is_error) return;

      let stepDescription = "";
      switch (call.name) {
        case "think_sequentially":
          stepDescription = `🧠 **Structured Analysis:** Broke down the problem into systematic steps`;
          break;
        case "plan_tasks":
          stepDescription = `📋 **Research Planning:** Created targeted research tasks with tool integration`;
          break;
        case "execute_task":
          stepDescription = `⚙️ **Task Execution:** Completed research using specialized analysis tools`;
          break;
        case "get_task_status":
          stepDescription = `📊 **Progress Check:** Monitored task completion status`;
          break;
      }

      if (stepDescription) {
        processSteps.push(stepDescription);
      }
    });

    if (processSteps.length > 0) {
      return `\n\n🔧 **Process Summary:**\n${processSteps.join("\n")}`;
    }

    return "";
  }

  async generateAnalyticalResponse(originalMessage, toolCalls, toolResults, initialResponse) {
    // Prepare tool results summary for Claude to analyze
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

Please analyze these results and provide a complete answer to the original question. Include:
1. Clear conclusions based on the data
2. Specific recommendations or findings
3. Direct answers to what was asked

Do not just summarize the tool results - interpret them and provide actionable insights.`;

    try {
      // Make follow-up Claude call for analysis
      const analysisResponse = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system:
          "You are an AI assistant that analyzes tool results and provides clear, actionable conclusions. Always provide direct answers and specific insights rather than just summarizing data.",
        messages: [
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
      });

      // Extract the analytical response
      const analyticalText = analysisResponse.content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");

      return analyticalText;
    } catch (error) {
      // Fallback to original synthesis if analysis fails
      console.warn(`Analysis generation failed: ${error.message}`);
      return await this.synthesizeResponse(initialResponse, toolResults, toolCalls);
    }
  }

  // Copy other methods from the original client
  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return this.conversationHistory.slice();
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  setModel(model) {
    this.model = model;
  }

  setTemperature(temperature) {
    this.temperature = Math.max(0, Math.min(1, temperature));
  }

  setMaxTokens(maxTokens) {
    this.maxTokens = maxTokens;
  }

  getStats() {
    const messages = this.conversationHistory;
    const userMessages = messages.filter(m => m.role === "user").length;
    const assistantMessages = messages.filter(m => m.role === "assistant").length;

    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };
  }
}
