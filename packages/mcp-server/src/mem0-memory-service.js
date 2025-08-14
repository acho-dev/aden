// Polyfill for window object (required by mem0ai in Node.js)
import crypto from "crypto";

if (typeof window === "undefined") {
  global.window = {
    crypto: {
      getRandomValues: arr => {
        return crypto.randomFillSync(arr);
      },
      subtle: {
        digest: async (algorithm, data) => {
          const hash = crypto.createHash(algorithm.toLowerCase().replace("-", ""));
          hash.update(data);
          return hash.digest();
        },
      },
    },
    location: { hostname: "localhost" },
    navigator: { userAgent: "Node.js" },
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
  };
}

import { MemoryClient } from "mem0ai";

/**
 * Mem0 Memory Service - Provides conversation memory management using mem0
 */
export class Mem0MemoryService {
  constructor(apiKey, config = {}) {
    if (!apiKey) {
      throw new Error("MEM0_API_KEY is required");
    }

    // Initialize mem0 cloud client
    this.client = new MemoryClient({
      apiKey: apiKey,
      host: config.host || "https://api.mem0.ai",
      organizationName: config.organizationName,
      projectName: config.projectName,
      organizationId: config.organizationId,
      projectId: config.projectId,
    });

    this.config = {
      maxMemoriesPerSearch: config.maxMemoriesPerSearch || 5,
      memoryTtl: config.memoryTtl || 30 * 24 * 60 * 60, // 30 days
      enableSessionSummaries: config.enableSessionSummaries !== false,
      ...config,
    };
  }

  /**
   * Intelligently add conversation insights to memory
   */
  async addConversationTurn(sessionId, userMessage, assistantResponse, metadata = {}) {
    const storedMemories = [];

    // Analyze user message for business information or strategic opinions
    const userInsight = this.extractUserInsights(userMessage);
    if (userInsight) {
      try {
        console.log(
          `🧠 Storing user insight: ${userInsight.category} (confidence: ${userInsight.confidence})`
        );
        const userMemory = await this.client.add(userInsight.content, {
          user_id: sessionId,
          metadata: this.trimMetadata({
            type: "user_insight",
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            confidence: userInsight.confidence,
            category: userInsight.category,
            insight_type: userInsight.type,
          }),
        });
        storedMemories.push(userMemory);
      } catch (error) {
        console.warn("⚠️  Failed to store user insight:", this.getErrorMessage(error));
      }
    }

    // Analyze assistant response for confident insights
    const assistantInsight = this.extractAssistantInsights(assistantResponse, metadata);
    if (assistantInsight) {
      try {
        console.log(
          `🧠 Storing assistant insight: ${assistantInsight.category} (confidence: ${assistantInsight.confidence})`
        );
        if (!metadata.teamId) {
          throw new Error("teamId is required for storing assistant memories");
        }

        // Ensure we don't double-prefix with "team_"
        const teamIdStr = String(metadata.teamId);
        const agentId = teamIdStr.startsWith("team_") ? teamIdStr : `team_${teamIdStr}`;
        console.log(
          `💾 Storing assistant memory with agent_id: ${agentId} (original teamId: ${metadata.teamId})`
        );

        const assistantMemory = await this.client.add(assistantInsight.content, {
          user_id: agentId,
          metadata: this.trimMetadata({
            type: "assistant_insight",
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            confidence: assistantInsight.confidence,
            category: assistantInsight.category,
            insight_type: assistantInsight.type,
            tools_used: assistantInsight.tools_used ? assistantInsight.tools_used.join(",") : "",
          }),
        });
        storedMemories.push(assistantMemory);
      } catch (error) {
        console.warn("⚠️  Failed to store assistant insight:", this.getErrorMessage(error));

        // Attempt retry with minimal metadata for metadata size errors
        if (error.message && error.message.includes("Metadata size is too large")) {
          try {
            console.log("🔄 Retrying with minimal metadata...");
            const minimalMetadata = {
              type: "assistant_insight",
              timestamp: new Date().toISOString(),
              session_id: sessionId.substring(0, 8),
            };
            if (!metadata.teamId) {
              throw new Error("teamId is required for storing assistant memories");
            }

            // Ensure we don't double-prefix with "team_"
            const teamIdStr = String(metadata.teamId);
            const agentId = teamIdStr.startsWith("team_") ? teamIdStr : `team_${teamIdStr}`;

            const assistantMemory = await this.client.add(assistantInsight.content, {
              user_id: agentId,
              metadata: minimalMetadata,
            });
            storedMemories.push(assistantMemory);
            console.log("✅ Successfully stored with minimal metadata");
          } catch (retryError) {
            console.warn(
              "⚠️  Failed to store even with minimal metadata:",
              this.getErrorMessage(retryError)
            );
          }
        }
      }
    }

    return storedMemories;
  }

  /**
   * Search for relevant memories based on query
   */
  async searchMemories(sessionId, query, filters = {}) {
    if (!filters.teamId) {
      throw new Error("teamId is required for searching memories");
    }

    // Ensure we don't double-prefix with "team_"
    const teamIdStr = String(filters.teamId);
    const agentId = teamIdStr.startsWith("team_") ? teamIdStr : `team_${teamIdStr}`;
    console.log(
      `🔍 Searching memories with agent_id: ${agentId} (original teamId: ${filters.teamId})`
    );

    try {
      const searchResult = await this.client.search(query, {
        user_id: agentId,
        limit: filters.limit || this.config.maxMemoriesPerSearch,
        ...filters,
      });

      return this.formatSearchResults(searchResult);
    } catch (error) {
      // Enhanced error handling for search operations
      if (error.message && error.message.includes("Server Error (500)")) {
        console.warn(
          "⚠️  Mem0 service temporarily unavailable for search. Continuing without memory context."
        );
      } else if (error.message && error.message.includes("overloaded")) {
        console.warn("⚠️  Mem0 service overloaded for search. Continuing without memory context.");
      } else {
        console.error("Failed to search memories:", error);
        console.warn("⚠️  Memory search failed. Continuing without memory context.");
      }
      return [];
    }
  }

  /**
   * Get all memories for a session
   */
  async getSessionMemories(sessionId, filters = {}) {
    try {
      const memories = await this.client.getAll({
        user_id: sessionId,
        ...filters,
      });
      return memories;
    } catch (error) {
      console.error("Failed to get session memories:", error);
      return [];
    }
  }

  /**
   * Add project-level memory
   */
  async addProjectMemory(projectId, content, metadata = {}) {
    try {
      const result = await this.client.add(content, {
        user_id: `project_${projectId}`,
        metadata: this.trimMetadata({
          type: "project_memory",
          project_id: projectId,
          timestamp: new Date().toISOString(),
        }),
      });
      return result;
    } catch (error) {
      console.error("Failed to add project memory:", error);
      throw error;
    }
  }

  /**
   * Search project memories
   */
  async searchProjectMemories(projectId, query, filters = {}) {
    try {
      return await this.searchMemories(`project_${projectId}`, query, filters);
    } catch (error) {
      console.error("Failed to search project memories:", error);
      return [];
    }
  }

  /**
   * Add user-level memory that persists across sessions
   */
  async addUserMemory(userId, content, metadata = {}) {
    try {
      const result = await this.client.add(content, {
        user_id: `user_${userId}`,
        metadata: this.trimMetadata({
          type: "user_memory",
          user_id: userId,
          timestamp: new Date().toISOString(),
        }),
      });
      return result;
    } catch (error) {
      console.error("Failed to add user memory:", error);
      throw error;
    }
  }

  /**
   * Search user memories across all sessions
   */
  async searchUserMemories(userId, query, filters = {}) {
    try {
      return await this.searchMemories(`user_${userId}`, query, filters);
    } catch (error) {
      console.error("Failed to search user memories:", error);
      return [];
    }
  }

  /**
   * Create session summary and store as memory
   */
  async createSessionSummary(sessionId, conversationHistory) {
    if (!this.config.enableSessionSummaries) {
      return null;
    }

    try {
      const summary = this.generateConversationSummary(conversationHistory);

      const result = await this.client.add(summary, {
        user_id: sessionId,
        metadata: this.trimMetadata({
          type: "session_summary",
          session_id: sessionId,
          message_count: conversationHistory.length,
          timestamp: new Date().toISOString(),
        }),
      });

      return result;
    } catch (error) {
      console.error("Failed to create session summary:", error);
      throw error;
    }
  }

  /**
   * Get conversation context including relevant memories
   */
  async getConversationContext(sessionId, currentMessage, options = {}) {
    try {
      const [sessionMemories, userMemories, projectMemories] = await Promise.all([
        options.teamId
          ? this.searchMemories(sessionId, currentMessage, {
              teamId: options.teamId,
              limit: 3,
            })
          : [],
        options.userId
          ? this.searchUserMemories(options.userId, currentMessage, {
              limit: 2,
            })
          : [],
        options.projectId
          ? this.searchProjectMemories(options.projectId, currentMessage, {
              limit: 2,
            })
          : [],
      ]);

      return {
        relevant_memories: sessionMemories,
        user_memories: userMemories,
        project_memories: projectMemories,
        context_summary: this.buildContextSummary(sessionMemories, userMemories, projectMemories),
      };
    } catch (error) {
      console.error("Failed to get conversation context:", error);
      return {
        relevant_memories: [],
        user_memories: [],
        project_memories: [],
        context_summary: null,
      };
    }
  }

  /**
   * Format search results for consumption
   */
  formatSearchResults(results) {
    if (!Array.isArray(results)) {
      return [];
    }

    return results.map(result => ({
      content: result.memory || result.content,
      score: result.score,
      metadata: result.metadata || {},
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  }

  /**
   * Generate conversation summary
   */
  generateConversationSummary(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return "Empty conversation";
    }

    const topics = new Set();
    const toolsUsed = new Set();
    let userQuestions = 0;
    let assistantResponses = 0;

    conversationHistory.forEach(msg => {
      // Handle different message formats
      const content = msg.content || (Array.isArray(msg.content) ? msg.content[0]?.text : "") || "";
      const contentStr = typeof content === "string" ? content : "";

      if (msg.role === "user") {
        userQuestions++;
        // Extract potential topics from user messages
        if (contentStr) {
          const words = contentStr.toLowerCase().split(/\s+/);
          words.forEach(word => {
            if (
              word.length > 5 &&
              ![
                "that",
                "this",
                "with",
                "from",
                "they",
                "have",
                "would",
                "could",
                "should",
              ].includes(word)
            ) {
              topics.add(word);
            }
          });
        }
      } else if (msg.role === "assistant") {
        assistantResponses++;
      }
    });

    const topicsList = Array.from(topics).slice(0, 5).join(", ");

    return `Conversation summary: ${userQuestions} user messages, ${assistantResponses} assistant responses. Key topics: ${topicsList}. Tools used: ${
      Array.from(toolsUsed).join(", ") || "none"
    }.`;
  }

  /**
   * Trim metadata to stay within size limits
   */
  trimMetadata(metadata) {
    const maxSize = 1800; // Leave some buffer under 2000 char limit
    let metadataStr = JSON.stringify(metadata);

    if (metadataStr.length <= maxSize) {
      return metadata;
    }

    // Start trimming non-essential fields
    const trimmed = { ...metadata };

    // Remove or truncate large fields
    if (trimmed.tools_used && trimmed.tools_used.length > 100) {
      trimmed.tools_used = trimmed.tools_used.substring(0, 100) + "...";
    }

    if (trimmed.session_id) {
      trimmed.session_id = trimmed.session_id.substring(0, 8); // Keep first 8 chars
    }

    // If still too large, keep only essential fields
    metadataStr = JSON.stringify(trimmed);
    if (metadataStr.length > maxSize) {
      return {
        type: metadata.type,
        category: metadata.category,
        confidence: metadata.confidence,
        timestamp: metadata.timestamp,
      };
    }

    return trimmed;
  }

  /**
   * Build context summary from different memory types
   */
  buildContextSummary(sessionMemories, userMemories, projectMemories) {
    const parts = [];

    if (sessionMemories.length > 0) {
      parts.push(`Recent conversation context: ${sessionMemories.length} relevant memories`);
    }

    if (userMemories.length > 0) {
      parts.push(`User context: ${userMemories.length} relevant user memories`);
    }

    if (projectMemories.length > 0) {
      parts.push(`Project context: ${projectMemories.length} relevant project memories`);
    }

    return parts.length > 0 ? parts.join(". ") : null;
  }

  /**
   * Extract actionable insights from user messages
   */
  extractUserInsights(message) {
    // Skip questions - users asking questions don't provide insights
    if (this.isUserQuestion(message)) {
      return null;
    }

    // Business information patterns
    const businessPatterns = [
      {
        pattern:
          /(we|our company|our business|our team).*(uses?|works? with|operates|focuses? on|specializes? in)/i,
        category: "business_operations",
        confidence: 0.8,
      },
      {
        pattern:
          /(our|the) (customers?|clients?|users?).*(prefer|want|need|expect|complain|feedback)/i,
        category: "customer_insights",
        confidence: 0.9,
      },
      {
        pattern: /(we|our company).*(strategy|goal|objective|plan|vision|mission)/i,
        category: "strategic_direction",
        confidence: 0.85,
      },
      {
        pattern:
          /(our|the) (market|industry|competition|competitors?).*(is|are|shows?|indicates?)/i,
        category: "market_insights",
        confidence: 0.8,
      },
      {
        pattern: /(we|our).*(budget|revenue|profit|cost|expense|pricing)/i,
        category: "financial_info",
        confidence: 0.9,
      },
      {
        pattern: /(we|our team|our company).*(challenge|problem|issue|difficulty|struggle)/i,
        category: "business_challenges",
        confidence: 0.85,
      },
    ];

    // Strategic opinion patterns
    const opinionPatterns = [
      {
        pattern:
          /(i think|i believe|in my opinion|my view is|i feel that).*(should|must|need to|important|critical)/i,
        category: "strategic_opinion",
        confidence: 0.7,
      },
      {
        pattern: /(we should|we need to|we must|it's important|it's critical)/i,
        category: "strategic_direction",
        confidence: 0.8,
      },
    ];

    // Check business patterns
    for (const { pattern, category, confidence } of businessPatterns) {
      if (pattern.test(message)) {
        return {
          content: message,
          confidence,
          category,
          type: "business_information",
        };
      }
    }

    // Check opinion patterns
    for (const { pattern, category, confidence } of opinionPatterns) {
      if (pattern.test(message)) {
        return {
          content: message,
          confidence,
          category,
          type: "strategic_opinion",
        };
      }
    }

    return null;
  }

  /**
   * Extract confident insights from assistant responses
   */
  extractAssistantInsights(response, metadata = {}) {
    const text = response.toLowerCase();

    // High-confidence insights from tool usage
    if (metadata.toolCalls && metadata.toolCalls.length > 0) {
      const toolBasedInsights = this.extractToolBasedInsights(response, metadata.toolCalls);
      if (toolBasedInsights) {
        return toolBasedInsights;
      }
    }

    // Confident analysis patterns
    const confidentPatterns = [
      {
        pattern:
          /(analysis shows|data indicates|results show|findings suggest|evidence points to)/i,
        category: "analytical_insight",
        confidence: 0.9,
      },
      {
        pattern: /(based on the (data|analysis|results)|according to the (findings|report))/i,
        category: "data_driven_insight",
        confidence: 0.85,
      },
      {
        pattern: /(recommendation|suggested approach|best practice|optimal solution)/i,
        category: "recommendation",
        confidence: 0.8,
      },
      {
        pattern: /(key insight|important finding|critical factor|significant trend)/i,
        category: "key_insight",
        confidence: 0.85,
      },
    ];

    // Skip if response contains uncertainty indicators
    const uncertaintyIndicators = [
      "might",
      "maybe",
      "possibly",
      "could be",
      "potentially",
      "it depends",
      "not sure",
      "unclear",
      "uncertain",
      "difficult to say",
    ];

    if (uncertaintyIndicators.some(indicator => text.includes(indicator))) {
      return null;
    }

    // Check for confident patterns
    for (const { pattern, category, confidence } of confidentPatterns) {
      if (pattern.test(response)) {
        return {
          content: response,
          confidence,
          category,
          type: "confident_analysis",
        };
      }
    }

    return null;
  }

  /**
   * Extract insights from tool-based responses
   */
  extractToolBasedInsights(response, toolCalls) {
    // Tool calls indicate confident, data-driven responses
    const toolCategories = {
      db_query: "database_insight",
      knowledge_search: "knowledge_insight",
      think_sequentially: "analytical_insight",
      plan_tasks: "planning_insight",
    };

    const toolNames = toolCalls.map(tc => tc.name);
    const primaryTool = toolNames[0];

    if (toolCategories[primaryTool]) {
      return {
        content: response,
        confidence: 0.9,
        category: toolCategories[primaryTool],
        type: "tool_based_insight",
        tools_used: toolNames,
      };
    }

    return null;
  }

  /**
   * Check if user message is a question
   */
  isUserQuestion(message) {
    // Direct question indicators
    if (message.includes("?")) {
      return true;
    }

    // Question word patterns
    const questionPatterns = [
      /^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)/i,
      /(tell me|show me|explain|help me|find|search|look up)/i,
    ];

    return questionPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Health check for mem0 service
   */
  async healthCheck() {
    try {
      // Test with a simple memory operation
      await this.client.search("test query", { limit: 1 });
      return { status: "healthy", timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Extract user-friendly error message from mem0 API errors
   */
  getErrorMessage(error) {
    if (error.message && error.message.includes("Server Error (500)")) {
      return "Mem0 service temporarily unavailable (500 error)";
    } else if (error.message && error.message.includes("overloaded")) {
      return "Mem0 service overloaded";
    } else if (error.message && error.message.includes("Metadata size is too large")) {
      return "Memory metadata too large";
    } else if (error.message && error.message.includes("<!doctype html>")) {
      return "Mem0 service returned HTML error page (likely server error)";
    } else {
      return error.message || "Unknown error";
    }
  }
}
