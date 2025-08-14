import express from "express";
import { requireJWT } from "../middleware/auth.js";
import { processMessageWithStreaming } from "../process.js";
import { enrichToolCallsWithDisplayNames } from "../../../mcp-server/src/tool-display-names.js";

const router = express.Router();

// One-shot endpoints - require authentication
router.post("/ask", requireJWT, async (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    const { message, sessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const userInfo = req.userInfo; // Set by requireJWT
    const jwtToken = req.jwtToken;

    console.log(`🔐 Ask request from user ${userInfo.userId} in team ${userInfo.teamId}`);
    
    let currentSessionId = sessionId;
    
    // If no sessionId provided, create a new persistent session
    if (!currentSessionId) {
      currentSessionId = await sessionService.createSession({
        jwtToken,
        userInfo,
      });
      console.log(`📝 Created new persistent session: ${currentSessionId}`);
    } else {
      // Validate existing session ownership
      const session = await sessionService.getSession(currentSessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (!session.userInfo || session.userInfo.userId !== userInfo.userId) {
        return res.status(403).json({ error: "Access denied: session belongs to different user" });
      }
      
      // Update session with fresh JWT token
      await sessionService.updateSessionToken(currentSessionId, jwtToken);
    }

    // Collect all streaming data to return as complete response
    let fullResponse = "";
    const toolCalls = [];
    let usage = null;
    let responseTime = null;
    let timestamp = null;
    let promptElapsed = null;
    
    // Process message with streaming (exactly like WebSocket)
    const response = await processMessageWithStreaming(
      currentSessionId,
      message,
      {
        onToolCall: toolCall => {
          // Collect tool calls
          toolCalls.push(toolCall);
        },
        onToolResult: (toolCall, result) => {
          // Tool results are already part of toolCall objects
        },
        onResponseChunk: chunk => {
          // Accumulate response chunks
          if (chunk && typeof chunk === 'object' && chunk.chunk !== undefined) {
            fullResponse += chunk.chunk;
          } else {
            fullResponse += chunk;
          }
        },
        onStatusChange: status => {
          // Status changes don't need to be collected for HTTP response
        },
        onText: chunk => {
          // Also accumulate text chunks
          fullResponse += chunk;
        },
        onComplete: finalResponse => {
          // Capture final response data
          fullResponse = finalResponse.response;
          usage = finalResponse.usage;
          responseTime = finalResponse.responseTime;
          timestamp = finalResponse.timestamp;
          promptElapsed = finalResponse.promptElapsed;
        },
      },
      { sessionService }
    );
    
    // Get updated context like WebSocket does
    const context = await sessionService.getSessionContext(currentSessionId, jwtToken);
    
    // Return response with sessionId and context, exactly mimicking WebSocket's response-complete event
    res.send({
      response: fullResponse || response.response,
      toolCalls: enrichToolCallsWithDisplayNames(response.toolCalls || []),
      usage: usage || response.usage,
      responseTime: responseTime || response.responseTime,
      timestamp: timestamp || response.timestamp,
      promptElapsed: promptElapsed || response.promptElapsed,
      sessionId: currentSessionId,
      context,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/think", requireJWT, async (req, res) => {
  const sessionService = req.app.locals.sessionService;

  try {
    const { problem } = req.body;
    if (!problem) {
      return res.status(400).json({ error: "Problem is required" });
    }

    const userInfo = req.userInfo; // Set by requireJWT
    const jwtToken = req.jwtToken;

    console.log(`🔐 Think request from user ${userInfo.userId} in team ${userInfo.teamId}`);

    const tempSessionId = await sessionService.createSession({
      jwtToken,
      userInfo,
    });

    try {
      const session = sessionService.sessions.get(tempSessionId);
      const result = await session.mcpClient.thinkSequentially(problem);
      res.send({ response: result.text, timestamp: new Date().toISOString() });
    } finally {
      await sessionService.destroySession(tempSessionId);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/plan", requireJWT, async (req, res) => {
  const sessionService = req.app.locals.sessionService;
  try {
    const { objective } = req.body;
    if (!objective) {
      return res.status(400).json({ error: "Objective is required" });
    }

    const userInfo = req.userInfo; // Set by requireJWT
    const jwtToken = req.jwtToken;

    console.log(`🔐 Plan request from user ${userInfo.userId} in team ${userInfo.teamId}`);

    const tempSessionId = await sessionService.createSession({
      jwtToken,
      userInfo,
    });

    try {
      const session = sessionService.sessions.get(tempSessionId);
      const result = await session.mcpClient.planTasks(objective);

      res.send({ response: result.text, timestamp: new Date().toISOString() });
    } finally {
      await sessionService.destroySession(tempSessionId);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
