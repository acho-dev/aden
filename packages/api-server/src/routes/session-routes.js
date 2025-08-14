import express from "express";
import { processMessage } from "../process.js";
import { requireJWT, requireSessionOwnership } from "../middleware/auth.js";

const router = express.Router();

router.post("/sessions", requireJWT, async (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    const userInfo = req.userInfo; // Set by requireJWT
    const jwtToken = req.jwtToken;
    const { sessionName, description } = req.body;

    console.log(
      `🔐 Session created for user ${userInfo.userId} in team ${userInfo.teamId}${
        sessionName ? ` with name "${sessionName}"` : ""
      }`
    );

    console.log(`🐛 DEBUG createSession call - req.body:`, req.body);
    console.log(`🐛 DEBUG createSession call - userInfo:`, userInfo);

    const sessionId = await sessionService.createSession({
      ...req.body,
      jwtToken,
      userInfo,
      sessionName,
      description,
    });

    res.json({
      sessionId,
      sessionName,
      status: "created",
      userInfo: {
        userId: userInfo.userId,
        teamId: userInfo.teamId,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sessions/:sessionId", requireJWT, requireSessionOwnership, async (req, res) => {
  const sessionService = req.app.locals.sessionService;
  try {
    const session = await sessionService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({
      sessionId: req.params.sessionId,
      sessionName: session.sessionName,
      description: session.description,
      status: session.status,
      conversationStats: session.llmClient?.getStats() || {},
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      userInfo: session.userInfo
        ? {
            userId: session.userInfo.userId,
            teamId: session.userInfo.teamId,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/sessions/:sessionId/name", requireJWT, requireSessionOwnership, async (req, res) => {
  const sessionService = req.app.locals.sessionService;
  try {
    const { sessionName, description } = req.body;

    if (!sessionName) {
      return res.status(400).json({ error: "sessionName is required" });
    }

    const sessionId = req.params.sessionId;
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Update session metadata
    session.sessionName = sessionName;
    if (description !== undefined) {
      session.description = description;
    }
    session.lastActivity = new Date().toISOString();

    // Save to MongoDB
    try {
      await sessionService.ensurePersistenceReady();
      if (sessionService.isPersistenceReady()) {
        await sessionService.saveSessionToPersistence(session);
      }
    } catch (error) {
      console.error(`Failed to save session name update to MongoDB: ${error.message}`);
    }

    res.json({
      sessionId,
      sessionName: session.sessionName,
      description: session.description,
      status: "updated",
      lastActivity: session.lastActivity,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/sessions/:sessionId", requireJWT, requireSessionOwnership, async (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    await sessionService.destroySession(req.params.sessionId);
    res.json({ status: "destroyed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/sessions/:sessionId/chat", requireJWT, requireSessionOwnership, async (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Ensure session uses fresh JWT token
    await sessionService.updateSessionToken(req.params.sessionId, req.jwtToken);

    const response = await processMessage(req.params.sessionId, message, {
      sessionService,
    });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get(
  "/sessions/:sessionId/context",
  requireJWT,
  requireSessionOwnership,
  async (req, res) => {
    const sessionService = req.app.locals.sessionService;

    try {
      const context = await sessionService.getSessionContext(req.params.sessionId, req.jwtToken);
      res.json(context);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  "/sessions/:sessionId/history",
  requireJWT,
  requireSessionOwnership,
  async (req, res) => {
    const sessionService = req.app.locals.sessionService;

    try {
      // Ensure session uses fresh JWT token if it needs to be restored
      const history = await sessionService.getSessionHistory(req.params.sessionId, req.jwtToken);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete("/sessions/:sessionId/history", requireJWT, requireSessionOwnership, (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    sessionService.clearSessionHistory(req.params.sessionId);
    res.json({ status: "cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Like a message
router.post(
  "/sessions/:sessionId/messages/:messageId/like",
  requireJWT,
  requireSessionOwnership,
  async (req, res) => {
    const sessionService = req.app.locals.sessionService;

    try {
      const { sessionId, messageId } = req.params;
      const result = await sessionService.likeMessage(sessionId, parseInt(messageId));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Dislike a message
router.post(
  "/sessions/:sessionId/messages/:messageId/dislike",
  requireJWT,
  requireSessionOwnership,
  async (req, res) => {
    const sessionService = req.app.locals.sessionService;

    try {
      const { sessionId, messageId } = req.params;
      const result = await sessionService.dislikeMessage(sessionId, parseInt(messageId));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete feedback (remove like/dislike)
router.delete(
  "/sessions/:sessionId/messages/:messageId/feedback",
  requireJWT,
  requireSessionOwnership,
  async (req, res) => {
    const sessionService = req.app.locals.sessionService;

    try {
      const { sessionId, messageId } = req.params;
      const result = await sessionService.removeFeedback(sessionId, parseInt(messageId));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Sessions listing - require authentication and filter by user
router.get("/sessions", requireJWT, async (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    const currentUser = req.userInfo; // Set by requireJWT
    
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 10;
    const offset = (page - 1) * size;
    
    // Validate pagination parameters
    if (page < 1 || size < 1 || size > 100) {
      return res.status(400).json({ 
        error: "Invalid pagination parameters. Page must be >= 1, size must be between 1 and 100" 
      });
    }
    
    console.log(`📋 Listing sessions for user ${currentUser.userId} (page: ${page}, size: ${size})`);

    // Get in-memory sessions for current user only
    const allMemorySessions = Array.from(sessionService.sessions.entries());
    console.log(`Found ${allMemorySessions.length} total in-memory sessions`);

    const memorySessions = allMemorySessions
      .filter(([id, session]) => {
        const hasUserInfo =
          session.userInfo &&
          session.userInfo.userId === currentUser.userId &&
          session.userInfo.teamId === currentUser.teamId;
        if (!hasUserInfo) {
          console.log(
            `Session ${id} filtered out: userInfo=${!!session.userInfo}, userId=${
              session.userInfo?.userId
            }, teamId=${session.userInfo?.teamId}`
          );
        }
        return hasUserInfo;
      })
      .map(([id, session]) => ({
        sessionId: id,
        sessionName: session.sessionName,
        description: session.description,
        status: session.status,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        conversationStats: session.llmClient?.getStats() || {},
        userInfo: {
          userId: session.userInfo.userId,
          teamId: session.userInfo.teamId,
        },
        location: "memory",
      }));

    console.log(
      `Found ${memorySessions.length} in-memory sessions for user ${currentUser.userId} in team ${currentUser.teamId}`
    );

    // Get persistent sessions from MongoDB with proper pagination
    let persistentSessions = [];
    let mongoTotalCount = 0;
    
    try {
      await sessionService.ensurePersistenceReady();

      if (sessionService.isPersistenceReady()) {
        // Get list of in-memory session IDs to exclude from MongoDB query
        const inMemorySessionIds = Array.from(sessionService.sessions.keys());
        
        // Build filter for current user's sessions, excluding those already in memory
        const mongoFilter = {
          'userInfo.userId': currentUser.userId,
          'userInfo.teamId': currentUser.teamId
        };
        
        // Add exclusion for in-memory sessions if any exist
        if (inMemorySessionIds.length > 0) {
          mongoFilter.sessionId = { $nin: inMemorySessionIds };
        }
        
        // Get total count from MongoDB (excluding in-memory sessions)
        mongoTotalCount = await sessionService.sessionManager.collection.countDocuments(mongoFilter);
        console.log(`Found ${mongoTotalCount} MongoDB sessions (excluding in-memory) for user ${currentUser.userId} in team ${currentUser.teamId}`);
        
        // Calculate how many MongoDB sessions we need to fetch
        // Account for in-memory sessions that come first
        const mongoSkip = Math.max(0, offset - memorySessions.length);
        const mongoLimit = size; // Always fetch full page size from MongoDB
        
        // Get paginated sessions from MongoDB (already excludes in-memory sessions)
        const mongoSessions = await sessionService.sessionManager.collection
          .find(mongoFilter)
          .sort({ createdAt: -1 })
          .skip(mongoSkip)
          .limit(mongoLimit)
          .toArray();
        
        // Format MongoDB sessions (no need to filter, already excluded in query)
        persistentSessions = mongoSessions.map(s => ({
          sessionId: s.sessionId,
          sessionName: s.sessionName,
          description: s.description,
          status: "stored",
          createdAt: s.createdAt,
          lastActivity: s.lastActivity,
          conversationHistory: s.conversationHistory,
          userInfo: {
            userId: s.userInfo.userId,
            teamId: s.userInfo.teamId,
          },
          location: "mongodb",
        }));

        console.log(`Loaded ${persistentSessions.length} MongoDB sessions for page ${page}`);
      }
    } catch (mongoError) {
      console.warn("Failed to initialize or load MongoDB sessions:", mongoError.message);
      // Continue with just in-memory sessions
    }

    // Calculate total sessions (MongoDB count already excludes in-memory sessions)
    const totalSessions = memorySessions.length + mongoTotalCount;
    const totalPages = Math.ceil(totalSessions / size);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    
    // Combine sessions for current page
    let paginatedSessions = [];
    
    if (offset < memorySessions.length) {
      // Page includes some in-memory sessions
      const memoryEnd = Math.min(offset + size, memorySessions.length);
      paginatedSessions = memorySessions.slice(offset, memoryEnd);
      
      // Fill remaining slots with MongoDB sessions if needed
      const remainingSlots = size - paginatedSessions.length;
      if (remainingSlots > 0 && persistentSessions.length > 0) {
        paginatedSessions = [...paginatedSessions, ...persistentSessions.slice(0, remainingSlots)];
      }
    } else {
      // Page is entirely from MongoDB sessions
      paginatedSessions = persistentSessions.slice(0, size);
    }
    
    // Sort by creation date
    paginatedSessions.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    res.json({
      sessions: paginatedSessions,
      pagination: {
        page,
        size,
        totalSessions,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null
      },
      metadata: {
        inMemory: memorySessions.length,
        persistent: mongoTotalCount,
        userId: currentUser.userId,
        teamId: currentUser.teamId,
        sessionManagerAvailable: sessionService.isPersistenceReady(),
      }
    });
  } catch (error) {
    console.error("Sessions listing error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
