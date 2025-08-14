import { MongoClient } from "mongodb";

export class SessionManager {
  constructor(mongoUrl, dbName = "erp", memoryService = null) {
    this.mongoUrl = mongoUrl;
    this.dbName = dbName;
    this.collectionName = "agent_sessions";
    this.client = null;
    this.db = null;
    this.collection = null;
    this.inMemoryCache = new Map(); // Keep in-memory cache for active sessions
    this.memoryService = memoryService; // Mem0 memory service
  }

  async connect() {
    try {
      this.client = new MongoClient(this.mongoUrl);
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.collection = this.db.collection(this.collectionName);

      // Create index on sessionId for faster lookups
      await this.collection.createIndex({ sessionId: 1 }, { unique: true });
      // Create index on lastActivity for efficient querying (no TTL - sessions are permanent)
      await this.collection.createIndex({ lastActivity: 1 });

      console.log(`📦 Connected to MongoDB: ${this.dbName}.${this.collectionName}`);
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log("📦 Disconnected from MongoDB");
    }
  }

  async saveSession(sessionId, sessionData) {
    try {
      const doc = {
        sessionId,
        ...sessionData,
        lastActivity: new Date(),
        updatedAt: new Date(),
      };

      const isNewSession = !(await this.collection.findOne({ sessionId }));

      // If this is a new session, add createdAt
      if (isNewSession) {
        doc.createdAt = new Date();
      }

      await this.collection.replaceOne({ sessionId }, doc, { upsert: true });

      // Update in-memory cache
      this.inMemoryCache.set(sessionId, sessionData);

      // Store session summary in memory service if available
      if (
        this.memoryService &&
        sessionData.conversationHistory &&
        sessionData.conversationHistory.length > 0
      ) {
        try {
          await this.memoryService.createSessionSummary(
            sessionId,
            sessionData.conversationHistory,
            {
              user_id: sessionData.userInfo?.userId,
              session_name: sessionData.sessionName,
              is_new_session: isNewSession,
            }
          );
        } catch (memoryError) {
          console.warn(`Failed to store session memory for ${sessionId}:`, memoryError.message);
        }
      }

      console.log(`💾 Session saved: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to save session ${sessionId}:`, error);
      throw error;
    }
  }

  async loadSession(sessionId) {
    try {
      // Check in-memory cache first
      if (this.inMemoryCache.has(sessionId)) {
        return this.inMemoryCache.get(sessionId);
      }

      // Load from MongoDB
      const doc = await this.collection.findOne({ sessionId });
      if (!doc) {
        return null;
      }

      // Remove MongoDB-specific fields
      const { _id, createdAt, updatedAt, ...sessionData } = doc;

      // Update in-memory cache
      this.inMemoryCache.set(sessionId, sessionData);

      console.log(`📦 Session loaded: ${sessionId}`);
      return sessionData;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      throw error;
    }
  }

  async deleteSession(sessionId) {
    try {
      await this.collection.deleteOne({ sessionId });
      this.inMemoryCache.delete(sessionId);
      console.log(`🗑️ Session deleted: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  async updateSessionActivity(sessionId) {
    try {
      await this.collection.updateOne(
        { sessionId },
        {
          $set: { lastActivity: new Date() },
          $currentDate: { updatedAt: true },
        }
      );

      // Update in-memory cache if session exists
      if (this.inMemoryCache.has(sessionId)) {
        const sessionData = this.inMemoryCache.get(sessionId);
        sessionData.lastActivity = new Date().toISOString();
        this.inMemoryCache.set(sessionId, sessionData);
      }
    } catch (error) {
      console.error(`Failed to update session activity ${sessionId}:`, error);
      throw error;
    }
  }

  async listActiveSessions() {
    try {
      const sessions = await this.collection.find({}).toArray();
      return sessions.map(session => ({
        sessionId: session.sessionId,
        sessionName: session.sessionName,
        description: session.description,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        conversationHistory: session.conversationHistory,
        userInfo: session.userInfo,
        llmClientConfig: session.llmClientConfig,
      }));
    } catch (error) {
      console.error("Failed to list active sessions:", error);
      throw error;
    }
  }

  async listSessionsPaginated(filter = {}, page = 1, size = 10) {
    try {
      const skip = (page - 1) * size;
      
      // Get total count for pagination metadata
      const totalCount = await this.collection.countDocuments(filter);
      
      // Get paginated sessions
      const sessions = await this.collection
        .find(filter)
        .sort({ createdAt: -1 }) // Sort by creation date, newest first
        .skip(skip)
        .limit(size)
        .toArray();
      
      const formattedSessions = sessions.map(session => ({
        sessionId: session.sessionId,
        sessionName: session.sessionName,
        description: session.description,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        conversationHistory: session.conversationHistory,
        userInfo: session.userInfo,
        llmClientConfig: session.llmClientConfig,
      }));

      return {
        sessions: formattedSessions,
        totalCount,
        page,
        size,
        totalPages: Math.ceil(totalCount / size)
      };
    } catch (error) {
      console.error("Failed to list paginated sessions:", error);
      throw error;
    }
  }

  async getSessionStats() {
    try {
      const totalSessions = await this.collection.countDocuments();
      const activeSessions = this.inMemoryCache.size;
      const recentSessions = await this.collection.countDocuments({
        lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      return {
        total: totalSessions,
        active: activeSessions,
        recent24h: recentSessions,
      };
    } catch (error) {
      console.error("Failed to get session stats:", error);
      return { total: 0, active: 0, recent24h: 0 };
    }
  }

  /**
   * Set memory service for enhanced session management
   * @param {Mem0MemoryService} memoryService - Initialized memory service
   */
  setMemoryService(memoryService) {
    this.memoryService = memoryService;
  }

  /**
   * Get session context including relevant memories
   * @param {string} sessionId - Session ID
   * @param {string} currentMessage - Current user message
   * @returns {Promise<Object>} Enhanced session context with memories
   */
  async getEnhancedSessionContext(sessionId, currentMessage) {
    if (!this.memoryService) {
      return { memories: [], context_summary: null };
    }

    try {
      // Get session data
      const sessionData = await this.loadSession(sessionId);
      if (!sessionData) {
        return { memories: [], context_summary: null };
      }

      // Get conversation context from memory service
      const memoryContext = await this.memoryService.getConversationContext(
        sessionId,
        currentMessage,
        {
          userId: sessionData.userInfo?.userId,
          projectId: sessionData.projectId,
        }
      );

      return memoryContext;
    } catch (error) {
      console.error(`Failed to get enhanced session context for ${sessionId}:`, error);
      return { memories: [], context_summary: null };
    }
  }

  // Helper method to serialize session data for storage
  serializeSessionForStorage(session) {
    return {
      conversationHistory: session.conversationHistory || [],
      llmClientConfig: session.llmClient
        ? {
            model: session.llmClient.config.model,
            maxTokens: session.llmClient.config.maxTokens,
            temperature: session.llmClient.config.temperature,
          }
        : null,
      jwtToken: session.jwtToken || null,
      teamId: session.userInfo?.teamId || session.teamId || null,
      userInfo: session.userInfo
        ? {
            userId: session.userInfo.userId,
            teamId: session.userInfo.teamId,
            fullIdentity: session.userInfo.fullIdentity,
          }
        : null,
      sessionName: session.sessionName || null,
      description: session.description || null,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    };
  }

  // Helper method to deserialize session data from storage
  async deserializeSessionFromStorage(sessionData) {
    // We'll need to recreate the LLM client and MCP client
    // This will be handled in the server.js when restoring sessions
    return {
      ...sessionData,
      conversationHistory: sessionData.conversationHistory || [],
      llmClient: null, // Will be recreated
      mcpClient: null, // Will be recreated
      logger: null, // Will be recreated
    };
  }
}
