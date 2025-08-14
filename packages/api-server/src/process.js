import { enrichToolCallsWithDisplayNames } from "../../mcp-server/src/tool-display-names.js";

const calculateTotalTokens = response => {
  let totalTokens = 0;

  if (response.usage) {
    if (response.usage.total_tokens) {
      totalTokens += response.usage.total_tokens;
    } else if (
      response.usage.input_tokens !== undefined &&
      response.usage.output_tokens !== undefined
    ) {
      totalTokens += response.usage.input_tokens + response.usage.output_tokens;
    }
  }

  if (response.rawPrompts && Array.isArray(response.rawPrompts)) {
    response.rawPrompts.forEach(prompt => {
      if (prompt.response && prompt.response.usage) {
        const usage = prompt.response.usage;
        if (usage.total_tokens) {
          totalTokens += usage.total_tokens;
        } else if (usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
          totalTokens += usage.input_tokens + usage.output_tokens;
        }
      }
    });
  }

  return totalTokens;
};

export const processMessage = async (sessionId, message, { sessionService }) => {
  const session = await sessionService.getSession(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  // Start timing for this prompt (reset each time)
  const promptStartTime = Date.now();
  session.timing = {
    promptStartTime: promptStartTime,
    finalElapsedTime: 0,
  };

  session.lastActivity = new Date().toISOString();

  // 2. Update activity in MongoDB
  try {
    await sessionService.ensurePersistenceReady();
    await sessionService.updateSessionActivity(sessionId);
  } catch (error) {
    console.warn("Failed to update session activity in MongoDB:", error.message);
  }

  // 3. LLM chat
  const startTime = Date.now();
  try {
    // Reset cancellation flag for new message processing
    if (session.llmClient && typeof session.llmClient.resetCancellation === 'function') {
      session.llmClient.resetCancellation();
    }
    if (session.mcpClient && typeof session.mcpClient.resetCancellation === 'function') {
      session.mcpClient.resetCancellation();
    }

    const response = await session.llmClient.chat(message, session.mcpClient, session.logger);

    const responseTime = Date.now() - startTime;

    // 4. Log interaction
    await session.logger.logInteraction(
      message,
      response.response,
      response.toolCalls || [],
      response.rawPrompts || [],
      {
        responseTime,
        tokensUsed: calculateTotalTokens(response),
        toolCallsCount: response.toolCalls?.length || 0,
        error: null,
      }
    );

    // Calculate elapsed time for this prompt
    const promptElapsed = (Date.now() - session.timing.promptStartTime) / 1000;
    session.timing.finalElapsedTime = promptElapsed;
    
    console.log(`🕐 Non-streaming elapsed time: ${promptElapsed.toFixed(2)}s`);

    // Add elapsed time to the last assistant message in conversation history
    if (session?.llmClient?.conversationHistory) {
      const history = session.llmClient.conversationHistory;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') {
          history[i].elapsed = promptElapsed;
          console.log(`📝 Stored elapsed time in message at index ${i}: ${promptElapsed.toFixed(2)}s`);
          break;
        }
      }
    }

    return {
      response: response.response,
      toolCalls: enrichToolCallsWithDisplayNames(response.toolCalls || []),
      usage: response.usage,
      responseTime,
      timestamp: new Date().toISOString(),
      promptElapsed,
    };
  } catch (error) {
    await session.logger.logInteraction(message, `Error: ${error.message}`, [], [], {
      responseTime: Date.now() - startTime,
      error: error.message,
    });
    throw error;
  }
};

export const processMessageWithStreaming = async (
  sessionId,
  message,
  callbacks = {},
  { sessionService }
) => {
  const session = await sessionService.getSession(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  // Start timing for this prompt (reset each time)
  const promptStartTime = Date.now();
  session.timing = {
    promptStartTime: promptStartTime,
    finalElapsedTime: 0,
  };

  session.lastActivity = new Date().toISOString();

  // Update activity in MongoDB
  try {
    await sessionService.ensurePersistenceReady();
    await sessionService.updateSessionActivity(sessionId);
  } catch (error) {
    console.warn("Failed to update session activity in MongoDB:", error.message);
  }

  const startTime = Date.now();

  try {
    // Reset cancellation flag for new message processing
    if (session.llmClient && typeof session.llmClient.resetCancellation === 'function') {
      session.llmClient.resetCancellation();
    }
    if (session.mcpClient && typeof session.mcpClient.resetCancellation === 'function') {
      session.mcpClient.resetCancellation();
    }

    // Use the real streaming method from ClaudeLLM
    const response = await session.llmClient.chatWithStreaming(
      message,
      session.mcpClient,
      session.logger,
      callbacks
    );

    const responseTime = Date.now() - startTime;

    // CRITICAL: Wait for any remaining tool execution to complete
    // The isExecutingTools flag ensures all tool processing is finished
    let waitCount = 0;
    const maxWait = 100; // 10 seconds max wait
    while (session.llmClient.isExecutingTools && waitCount < maxWait) {
      console.log(`⏳ Waiting for tool execution to complete... (${waitCount}/100)`);
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }

    if (waitCount >= maxWait) {
      console.warn("⚠️ Tool execution timeout - saving conversation anyway");
    } else if (waitCount > 0) {
      console.log(`✅ Tool execution completed after ${waitCount * 100}ms wait`);
    }

    // Log interaction
    await session.logger.logInteraction(
      message,
      response.response,
      response.toolCalls || [],
      response.rawPrompts || [],
      {
        responseTime,
        tokensUsed: calculateTotalTokens(response),
        toolCallsCount: response.toolCalls?.length || 0,
        error: null,
      }
    );

    // Calculate elapsed time for this prompt
    const promptElapsed = (Date.now() - session.timing.promptStartTime) / 1000;
    session.timing.finalElapsedTime = promptElapsed;
    
    console.log(`🕐 Streaming elapsed time: ${promptElapsed.toFixed(2)}s`);

    // Add elapsed time to the last assistant message in conversation history
    if (session?.llmClient?.conversationHistory) {
      const history = session.llmClient.conversationHistory;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') {
          history[i].elapsed = promptElapsed;
          console.log(`📝 Stored elapsed time in message at index ${i}: ${promptElapsed.toFixed(2)}s`);
          break;
        }
      }
    }

    const finalResponse = {
      response: response.response,
      toolCalls: enrichToolCallsWithDisplayNames(response.toolCalls || []),
      usage: response.usage,
      responseTime,
      timestamp: new Date().toISOString(),
      promptElapsed,
    };

    // Save updated conversation history to MongoDB (ONLY after tool execution is complete)
    try {
      await sessionService.ensurePersistenceReady();
      await sessionService.saveSessionToPersistence(session, true);
    } catch (error) {
      console.error(`Failed to save session conversation to MongoDB: ${error.message}`);
    }

    return finalResponse;
  } catch (error) {
    await session.logger.logInteraction(message, `Error: ${error.message}`, [], [], {
      responseTime: Date.now() - startTime,
      error: error.message,
    });
    throw error;
  }
};

export const handleCommand = async (
  sessionId,
  command,
  args,
  freshJwtToken = null,
  { sessionService }
) => {
  let session = sessionService.sessions.get(sessionId);

  // If session not in memory, try to restore it with fresh JWT token
  if (!session) {
    if (sessionService.isPersistenceReady()) {
      session = await sessionService.restoreSession(sessionId, freshJwtToken);
    }
    if (!session) {
      throw new Error("Session not found");
    }
  } else if (freshJwtToken) {
    // Update token for existing session too
    await sessionService.updateSessionToken(sessionId, freshJwtToken);
  }

  switch (command) {
    case "status":
      const health = await session.mcpClient.healthCheck();
      const stats = session.llmClient.getStats();
      return {
        mcpServer: health.healthy ? "Connected" : "Disconnected",
        toolCount: health.toolCount || 0,
        llmProvider: stats.provider,
        model: stats.model,
        conversationMessages: stats.totalMessages,
        logging: session.logger.enabled,
      };

    case "clear":
      return sessionService.clearSessionHistory(sessionId);

    case "context":
      return await sessionService.getSessionContext(sessionId);

    default:
      throw new Error(`Unknown command: ${command}`);
  }
};
