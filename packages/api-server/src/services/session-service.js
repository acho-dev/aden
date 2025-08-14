import { v4 as uuidv4 } from "uuid";
import { SessionManager } from "../session-manager.js";
import { ConversationLogger } from "../../../agent-client/src/conversation-logger.js";
import { LLMFactory } from "../../../agent-client/src/llm/llm-factory.js";
import { AdenMCPClient } from "../../../agent-client/src/mcp-client.js";
import { getToolDisplayName } from "../../../mcp-server/src/tool-display-names.js";

class SessionService {
  constructor({ config, memoryService }) {
    this.sessions = new Map();

    this.config = config;
    this.memoryService = memoryService;

    const mongoUrl = process.env.MONGODB_URL || "mongodb://localhost:27017";
    this.sessionManagerInitialized = false;
    this.sessionManager = new SessionManager(mongoUrl, "erp", this.memoryService);
  }

  async ensurePersistenceReady() {
    if (this.sessionManagerInitialized) {
      return;
    }

    try {
      await this.sessionManager.connect();
      this.sessionManagerInitialized = true;
      console.log("💾 Session persistence initialized on demand");
    } catch (error) {
      console.error("❌ Failed to connect to MongoDB:", error);
      console.log("💡 Running without session persistence - sessions will be in-memory only");
      this.sessionManager = null;
      // Don't throw error - continue without persistence
    }
  }

  isPersistenceReady() {
    return this.sessionManagerInitialized;
  }

  async saveSessionToPersistence(session, updateHistory = false) {
    if (!this.isPersistenceReady()) {
      return;
    }

    const persistentData = this.sessionManager.serializeSessionForStorage(session);
    if (updateHistory) {
      persistentData.conversationHistory = session.llmClient.conversationHistory;
    }

    await this.sessionManager.saveSession(session.sessionId, persistentData);
    console.log(
      `💾 Conversation saved for session ${session.sessionId} with ${persistentData.conversationHistory.length} messages`
    );
  }

  async updateSessionActivity(sessionId) {
    if (!this.isPersistenceReady()) {
      return;
    }

    await this.sessionManager.updateSessionActivity(sessionId);
  }

  async createSession(options = {}) {
    const sessionId = uuidv4();

    // Validate configuration
    const validation = this.config.validate();
    if (!validation.isValid) {
      throw new Error(`Configuration invalid: ${validation.errors.join(", ")}`);
    }

    // Initialize clients
    const llmConfig = this.config.getCurrentLLMConfig();
    const mcpConfig = this.config.getMCPConfig();

    const llmClient = await LLMFactory.create(
      llmConfig.provider,
      {
        model: llmConfig.model,
        maxTokens: llmConfig.maxTokens,
        temperature: llmConfig.temperature,
      },
      {
        apiKey: llmConfig.apiKey,
      }
    );

    const mcpClient = new AdenMCPClient(mcpConfig.serverPath, {
      jwtToken: options.jwtToken,
      teamId: options.teamId || options.userInfo?.teamId,
    });
    mcpClient.setupCleanup();
    await mcpClient.connect();

    // Create logger
    const logger = new ConversationLogger(
      this.config.get("conversationLogging"),
      this.config.get("htmlReporting")
    );

    await logger.startSession({
      type: "api",
      sessionId,
      llmProvider: llmConfig.provider,
      mcpServerPath: mcpConfig.serverPath,
    });

    // Initialize memory service for LLM client if available
    if (this.memoryService) {
      try {
        const teamId = options.teamId || options.userInfo?.teamId;
        llmClient.initializeMemory(
          this.memoryService,
          sessionId,
          teamId,
          options.userInfo?.userId,
          options.projectId
        );
      } catch (error) {
        console.warn(`Failed to initialize memory for session ${sessionId}:`, error.message);
      }
    }

    // Store session in memory and MongoDB
    const sessionData = {
      sessionId,
      llmClient,
      mcpClient,
      logger,
      status: "active",
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      conversationHistory: [],
      timing: {
        promptStartTime: null,
        finalElapsedTime: 0,
      },
      userInfo: options.userInfo || null,
      jwtToken: options.jwtToken || null,
      sessionName: options.sessionName || null,
      description: options.description || null,
      projectId: options.projectId || null,
      teamId: options.teamId || options.userInfo?.teamId || null,
      messageLikes: {},
      messageDislikes: {},
    };

    this.sessions.set(sessionId, sessionData);

    // Save to MongoDB
    try {
      if (this.sessionManager) {
        const persistentData = this.sessionManager.serializeSessionForStorage(sessionData);
        await this.sessionManager.saveSession(sessionId, persistentData);
      }
    } catch (error) {
      console.error(`Failed to save session to MongoDB: ${error.message}`);
    }

    return sessionId;
  }

  async getSession(sessionId) {
    // Check in memory first
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    // If not found in memory, try to restore from MongoDB
    if (this.sessionManager) {
      console.warn(`Session ${sessionId} not found in memory, attempting to restore from MongoDB.`);
      return await this.restoreSession(sessionId);
    }
    console.warn(`Session ${sessionId} not found in memory or MongoDB.`);

    return null;
  }

  async restoreSession(sessionId, freshJwtToken = null) {
    if (!this.sessionManager) return null;

    try {
      const sessionData = await this.sessionManager.loadSession(sessionId);
      if (!sessionData) return null;

      // Validate configuration before restoring
      const validation = this.config.validate();
      if (!validation.isValid) {
        return null;
      }

      // Use fresh JWT token if provided, otherwise fall back to stored token
      const jwtTokenToUse = freshJwtToken || sessionData.jwtToken;

      // Recreate the session objects
      const llmConfig = this.config.getCurrentLLMConfig();
      const mcpConfig = this.config.getMCPConfig();

      const llmClient = await LLMFactory.create(
        llmConfig.provider,
        {
          model: llmConfig.model,
          maxTokens: llmConfig.maxTokens,
          temperature: llmConfig.temperature,
        },
        {
          apiKey: llmConfig.apiKey,
        }
      );
      const mcpClient = new AdenMCPClient(mcpConfig.serverPath, {
        jwtToken: jwtTokenToUse,
        teamId: sessionData.teamId || sessionData.userInfo?.teamId,
      });
      mcpClient.setupCleanup();
      await mcpClient.connect();

      // Create logger
      const logger = new ConversationLogger(
        this.config.get("conversationLogging"),
        this.config.get("htmlReporting")
      );

      await logger.startSession({
        type: "api",
        sessionId,
        llmProvider: llmConfig.provider,
        mcpServerPath: mcpConfig.serverPath,
      });

      // Restore conversation history in LLM client
      if (sessionData.conversationHistory && sessionData.conversationHistory.length > 0) {
        llmClient.conversationHistory = sessionData.conversationHistory;
      }

      // Initialize memory service for restored session
      if (this.memoryService) {
        try {
          llmClient.initializeMemory(
            this.memoryService,
            sessionId,
            sessionData.teamId || sessionData.userInfo?.teamId,
            sessionData.userInfo?.userId,
            sessionData.projectId
          );
        } catch (error) {
          console.warn(`Failed to restore memory for session ${sessionId}:`, error.message);
        }
      }

      const restoredSession = {
        sessionId,
        llmClient,
        mcpClient,
        logger,
        status: "active",
        createdAt: sessionData.createdAt,
        lastActivity: new Date().toISOString(),
        conversationHistory: sessionData.conversationHistory || [],
        timing: sessionData.timing || {
          promptStartTime: null,
          finalElapsedTime: 0,
        },
        userInfo: sessionData.userInfo || null,
        jwtToken: jwtTokenToUse,
        sessionName: sessionData.sessionName || null,
        description: sessionData.description || null,
        projectId: sessionData.projectId || null,
        teamId: sessionData.teamId || sessionData.userInfo?.teamId || null,
        messageLikes: sessionData.messageLikes || {},
        messageDislikes: sessionData.messageDislikes || {},
      };

      this.sessions.set(sessionId, restoredSession);

      return restoredSession;
    } catch (error) {
      console.error(`Failed to restore session ${sessionId}:`, error);
      return null;
    }
  }

  async updateSessionToken(sessionId, freshJwtToken) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.jwtToken = freshJwtToken;

      // Reconnect the MCP client with the new token
      if (session.mcpClient) {
        await session.mcpClient.disconnect();

        const mcpConfig = this.config.getMCPConfig();
        session.mcpClient = new AdenMCPClient(mcpConfig.serverPath, {
          jwtToken: freshJwtToken,
          teamId: session.teamId || session.userInfo?.teamId,
        });
        session.mcpClient.setupCleanup();
        await session.mcpClient.connect();
      }

      return true;
    } catch (error) {
      console.error(`Failed to update JWT token for session ${sessionId}:`, error);
      return false;
    }
  }

  async destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Check if session exists in MongoDB but not in memory
      if (this.sessionManager) {
        await this.sessionManager.deleteSession(sessionId);
      }
      throw new Error("Session not found");
    }

    try {
      if (session.logger) {
        await session.logger.endSession();
      }
      if (session.mcpClient) {
        await session.mcpClient.disconnect();
      }

      this.sessions.delete(sessionId);

      if (this.sessionManager) {
        await this.sessionManager.deleteSession(sessionId);
      }
    } catch (error) {
      console.error(`Error destroying session ${sessionId}:`, error);
      throw error;
    }
  }

  // ...existing code...

  /**
   * Get session context (stats, recent topics, status, lastActivity)
   */
  async getSessionContext(sessionId, freshJwtToken = null) {
    let session = this.sessions.get(sessionId);

    // If session not in memory, try to restore it with fresh JWT token
    if (!session && this.sessionManager) {
      session = await this.restoreSession(sessionId, freshJwtToken);
    }
    if (!session) {
      throw new Error("Session not found");
    }
    if (freshJwtToken) {
      await this.updateSessionToken(sessionId, freshJwtToken);
    }

    const stats = session.llmClient.getStats();
    const history = session.llmClient.getHistory();
    const recentHistory = history.slice(-6);
    const recentTopics = recentHistory
      .filter(msg => msg.role === "user")
      .map(msg => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map(c => c.text || "").join(" ");
        return content.length > 40 ? content.slice(0, 40) + "..." : content;
      })
      .slice(-2);

    return {
      sessionId,
      stats,
      recentTopics,
      status: session.status,
      lastActivity: session.lastActivity,
    };
  }

  async getSessionHistory(sessionId, freshJwtToken = null) {
    let session = this.sessions.get(sessionId);

    // If session not in memory, try to restore from MongoDB with fresh JWT token
    if (!session && this.sessionManager) {
      session = await this.restoreSession(sessionId, freshJwtToken);
    }
    if (!session) {
      throw new Error("Session not found");
    }
    if (freshJwtToken) {
      await this.updateSessionToken(sessionId, freshJwtToken);
    }

    const history = session.llmClient.getHistory();
    return {
      sessionId,
      messages: history.map((msg, index) => {
        const enrichedMsg = {
          id: index,
          role: msg.role,
          content: this.enrichContentWithToolDisplayNames(msg.content),
          timestamp: new Date().toISOString(), // If you have real timestamps, use them
          elapsed: msg.elapsed, // Include elapsed time from stored message
          liked: session.messageLikes?.[index] || false,
          disliked: session.messageDislikes?.[index] || false,
        };
        return enrichedMsg;
      }),
      totalMessages: history.length,
    };
  }

  // Helper method to add tool display names to message content
  enrichContentWithToolDisplayNames(content) {
    console.log(
      "🔍 enrichContentWithToolDisplayNames called with:",
      typeof content,
      Array.isArray(content)
    );

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      const enriched = content.map(item => {
        if (item.type === "tool_use" && item.name) {
          const displayName = getToolDisplayName(item.name);
          console.log(`  🎨 Adding displayName for ${item.name}: ${displayName}`);
          return {
            ...item,
            displayName,
          };
        }
        return item;
      });
      console.log(
        "  ✅ Enriched",
        enriched.filter(item => item.type === "tool_use").length,
        "tool_use items"
      );
      return enriched;
    }

    return content;
  }

  clearSessionHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    session.llmClient.clearHistory();
    return { status: "cleared", sessionId };
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  async likeMessage(sessionId, messageId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const history = session.llmClient.getHistory();
    if (messageId < 0 || messageId >= history.length) {
      throw new Error("Message not found");
    }

    // Toggle like status
    const wasLiked = session.messageLikes[messageId] || false;
    session.messageLikes[messageId] = !wasLiked;

    // If liking, remove dislike
    if (session.messageLikes[messageId]) {
      session.messageDislikes[messageId] = false;
    }

    session.lastActivity = new Date().toISOString();

    // Save to MongoDB
    try {
      await this.saveSessionToPersistence(session);
    } catch (error) {
      console.error(`Failed to save like status to MongoDB: ${error.message}`);
    }

    return {
      messageId,
      liked: session.messageLikes[messageId],
      disliked: session.messageDislikes[messageId],
      status: "updated",
    };
  }

  async dislikeMessage(sessionId, messageId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const history = session.llmClient.getHistory();
    if (messageId < 0 || messageId >= history.length) {
      throw new Error("Message not found");
    }

    // Toggle dislike status
    const wasDisliked = session.messageDislikes[messageId] || false;
    session.messageDislikes[messageId] = !wasDisliked;

    // If disliking, remove like
    if (session.messageDislikes[messageId]) {
      session.messageLikes[messageId] = false;
    }

    session.lastActivity = new Date().toISOString();

    // Save to MongoDB
    try {
      await this.saveSessionToPersistence(session);
    } catch (error) {
      console.error(`Failed to save dislike status to MongoDB: ${error.message}`);
    }

    return {
      messageId,
      liked: session.messageLikes[messageId],
      disliked: session.messageDislikes[messageId],
      status: "updated",
    };
  }

  async removeFeedback(sessionId, messageId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const history = session.llmClient.getHistory();
    if (messageId < 0 || messageId >= history.length) {
      throw new Error("Message not found");
    }

    // Remove both like and dislike
    session.messageLikes[messageId] = false;
    session.messageDislikes[messageId] = false;

    session.lastActivity = new Date().toISOString();

    // Save to MongoDB
    try {
      await this.saveSessionToPersistence(session);
    } catch (error) {
      console.error(`Failed to save feedback removal to MongoDB: ${error.message}`);
    }

    return {
      messageId,
      liked: false,
      disliked: false,
      status: "feedback_removed",
    };
  }

  async disconnect() {
    if (this.sessionManager) {
      await this.sessionManager.disconnect();
      this.sessionManager = null;
      this.sessionManagerInitialized = false;
      console.log("💾 Session persistence disconnected");
    } else {
      console.warn("No session manager to disconnect");
    }
  }

  /**
   * Set temporary cancellation flag to stop current operation
   * Session remains active for new questions
   */
  async setOperationCancelled(sessionId, reason = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Set temporary cancellation flag (not permanent termination)
    session.operationCancelled = true;
    session.cancellationReason = reason;
    session.cancelledAt = new Date().toISOString();

    // Signal MCP client to stop current operations
    if (session.mcpClient && typeof session.mcpClient.cancelCurrentOperation === 'function') {
      session.mcpClient.cancelCurrentOperation();
    }

    // Signal LLM client to stop streaming if it supports it
    if (session.llmClient && typeof session.llmClient.cancelCurrentOperation === 'function') {
      session.llmClient.cancelCurrentOperation();
    }

    console.log(`🛑 Current operation cancelled for session ${sessionId}: ${reason}`);
  }

  /**
   * Add cancellation notice to conversation and clean up incomplete messages
   */
  async addCancellationNotice(sessionId, reason = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const conversationHistory = session.llmClient.conversationHistory || [];
    
    // Check if the last assistant message is incomplete (has tool calls but no content)
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (lastMessage && 
        lastMessage.role === 'assistant' && 
        (!lastMessage.content || lastMessage.content.trim() === '') && 
        lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      
      // Mark the incomplete message as cancelled
      lastMessage.content = "⚠️ Operation was cancelled by user";
      lastMessage.cancelled = true;
      lastMessage.cancelledAt = new Date().toISOString();
    }

    // Add cancellation notice as a system message
    const cancellationNotice = {
      role: "system",
      content: `🛑 Operation cancelled by user${reason ? ': ' + reason : ''}. You can continue with a new question.`,
      timestamp: new Date().toISOString(),
      type: "cancellation_notice"
    };

    conversationHistory.push(cancellationNotice);
    session.lastActivity = new Date().toISOString();

    // Clear the cancellation flag so user can ask new questions
    session.operationCancelled = false;
    session.cancellationReason = null;

    // Save to persistence
    if (this.isPersistenceReady()) {
      await this.saveSessionToPersistence(session, true);
    }

    console.log(`📝 Cancellation notice added to session ${sessionId}, ready for new questions`);
  }

  /**
   * Check if current operation is cancelled
   */
  isOperationCancelled(sessionId) {
    const session = this.sessions.get(sessionId);
    return session?.operationCancelled || false;
  }
}

export default SessionService;
