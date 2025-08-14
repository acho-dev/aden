import express from "express";

import { requireJWT } from "../middleware/auth.js";

const router = express.Router();

// Health check
router.get("/health", async (req, res) => {
  const sessionService = req.app.locals.sessionService;
  const startTime = Date.now();
  try {
    let mongoConnected = false;
    try {
      await sessionService.ensurePersistenceReady();
      mongoConnected = sessionService.isPersistenceReady();
    } catch (error) {
      console.warn(`⚠️ Health check: MongoDB connection check failed: ${error.message}`);
    }
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      activeSessions: sessionService.sessions.size,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      mongoConnected,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    };
    const responseTime = Date.now() - startTime;
    if (responseTime > 2000) {
      console.warn(
        `⚠️ Slow health check response: ${responseTime}ms - Memory: ${JSON.stringify(
          health.memory
        )}`
      );
    } else if (responseTime > 1000) {
      console.log(`💓 Health check response: ${responseTime}ms`);
    }
    health.responseTimeMs = responseTime;
    res.json(health);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Health check error after ${responseTime}ms: ${error.message}`);
    console.error(`❌ Health check stack: ${error.stack}`);
    res.status(200).json({
      status: "degraded",
      error: error.message,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      activeSessions: sessionService.sessions?.size || 0,
    });
  }
});

// API info
router.get("/api", (req, res) => {
  const port = req.app.locals.port || 3001;
  res.json({
    name: "Aden API Server",
    version: "1.0.0",
    endpoints: {
      sessions: "/sessions",
      chat: "/sessions/:sessionId/chat",
      context: "/sessions/:sessionId/context",
      history: "/sessions/:sessionId/history",
      oneShot: "/ask",
      thinking: "/think",
      planning: "/plan",
      config: "/config",
      logs: "/logs",
    },
    websocket: {
      url: "ws://localhost:" + port,
      events: {
        client: ["join-session", "chat-message", "command"],
        server: [
          "session-joined",
          "chat-status",
          "tool-call",
          "tool-result",
          "response-chunk",
          "response-complete",
          "context-update",
          "chat-error",
          "command-result",
          "command-error",
        ],
      },
    },
  });
});

router.get("/config", (req, res) => {
  const config = req.app.locals.config;
  const validation = config.validate();
  const llmConfig = config.getCurrentLLMConfig();
  const mcpConfig = config.getMCPConfig();

  // Remove sensitive information (API keys, tokens, etc.)
  const safeLlmConfig = {
    provider: llmConfig.provider,
    model: llmConfig.model,
    maxTokens: llmConfig.maxTokens,
    temperature: llmConfig.temperature,
    hasApiKey: !!llmConfig.apiKey, // Just indicate if key exists
  };

  const safeMcpConfig = {
    serverPath: mcpConfig.serverPath,
    // Don't expose any sensitive MCP configuration
  };

  const currentConfig = {
    isValid: validation.isValid,
    errors: validation.errors,
    llm: safeLlmConfig,
    mcp: safeMcpConfig,
    logging: {
      enabled: config.get("conversationLogging"),
      html: config.get("htmlReporting"),
    },
  };

  res.json(currentConfig);
});

// Auth endpoint for testing JWT token parsing
router.get("/auth/identity", requireJWT, async (req, res) => {
  try {
    const userInfo = req.userInfo; // Set by requireJWT
    res.json({
      userId: userInfo.userId,
      teamId: userInfo.teamId,
      identity: userInfo.fullIdentity,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
