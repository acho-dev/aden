import { Server as SocketIOServer } from "socket.io";
import { parseJWTToken } from "./utils/jwt.js";
import { enrichToolCallsWithDisplayNames } from "../../mcp-server/src/tool-display-names.js";
import { processMessageWithStreaming, handleCommand } from "./process.js";

export function setupWebSocket(server, { sessionService, memoryService }) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    // Enhanced Kubernetes-optimized settings for WebSocket stability
    pingTimeout: 180000, // 3 minutes - increased from 2 minutes for better stability
    pingInterval: 45000, // 45 seconds - increased from 30 seconds, less aggressive pinging
    upgradeTimeout: 15000, // 15 seconds - increased from 10 seconds for WebSocket upgrade
    allowEIO3: true,
    // Additional settings for Kubernetes environments with load balancers
    transports: ["websocket", "polling"], // Prefer WebSocket but allow polling fallback
    allowUpgrades: true,
    // Connection state recovery for disconnections - enhanced settings
    connectionStateRecovery: {
      maxDisconnectionDuration: 10 * 60 * 1000, // 10 minutes - increased from 5 minutes
      skipMiddlewares: true,
    },
    // Additional stability settings for production
    maxHttpBufferSize: 1e6, // 1MB buffer size
    httpCompression: true,
    perMessageDeflate: {
      threshold: 1024, // Enable compression for messages > 1KB
      concurrencyLimit: 10,
      memLevel: 7,
    },
    // Close timeout for graceful shutdowns
    closeTimeout: 30000, // 30 seconds
    // Heartbeat settings
    heartbeatInterval: 25000, // 25 seconds
    heartbeatTimeout: 60000, // 1 minute
  });

  io.use(async (socket, next) => {
    try {
      // Accept token from query parameters or auth object
      const token = socket.handshake.query.token || socket.handshake.auth.token;

      if (!token) {
        return next(
          new Error("Authentication error: JWT token required in query param or socket.auth.token")
        );
      }

      // Validate JWT token using acho-js identify function
      const userInfo = await parseJWTToken(token);

      // Add user info to socket for use in handlers
      socket.userInfo = userInfo;
      socket.jwtToken = token;

      console.log(
        `🔐 WebSocket connection from user ${userInfo.userId} in team ${userInfo.teamId}`
      );

      next();
    } catch (error) {
      return next(new Error("Authentication error: Invalid token format"));
    }
  });

  io.on("connection", socket => {
    const connectTime = Date.now();
    console.log(
      `🔌 WebSocket client connected: ${socket.id} (user: ${
        socket.userInfo?.userId || "unknown"
      }) at ${new Date().toISOString()}`
    );

    socket.connectionMetadata = {
      connectTime,
      userId: socket.userInfo?.userId,
      teamId: socket.userInfo?.teamId,
      userAgent: socket.handshake.headers["user-agent"],
      remoteAddress: socket.handshake.address,
      lastPing: Date.now(),
    };

    socket.on("error", handleSocketError(socket));
    socket.on("disconnect", handleDisconnect(socket));
    socket.on("connect_error", err => handleConnectError(socket, err));
    socket.on("ping", () => handlePing(socket));
    socket.on("pong", latency => handlePong(socket, latency));
    socket.on("join-session", handleJoinSession(socket, { sessionService }));
    socket.on("chat-message", chatMessageHandler(socket, { sessionService }));
    socket.on("command", commandHandler(socket, { sessionService }));
    socket.on("terminate-work", terminateWorkHandler(socket, { sessionService }));
  });

  return io;
}

function handleSocketError(socket) {
  return error => {
    const duration = Date.now() - socket.connectionMetadata.connectTime;
    console.error(`❌ WebSocket error for ${socket.id} (duration: ${duration}ms):`, {
      error: error.message,
      userId: socket.userInfo?.userId,
      duration,
      timestamp: new Date().toISOString(),
    });
  };
}

function handleDisconnect(socket) {
  return reason => {
    const duration = Date.now() - socket.connectionMetadata.connectTime;
    const durationMinutes = Math.floor(duration / 60000);
    const durationSeconds = Math.floor((duration % 60000) / 1000);

    const userId = socket.userInfo?.userId || "unknown";

    switch (reason) {
      case "ping timeout":
        console.warn(
          `⏰ WebSocket ping timeout: ${socket.id} (user: ${userId}) - Duration: ${durationMinutes}m ${durationSeconds}s`
        );
        console.warn(
          `   - Last ping: ${new Date(socket.connectionMetadata.lastPing).toISOString()}`
        );
        console.warn(`   - Ping interval: 45s, Timeout: 3m`);
        break;
      case "transport close":
        console.log(
          `🔌 WebSocket transport closed: ${socket.id} (user: ${userId}) - Duration: ${durationMinutes}m ${durationSeconds}s`
        );
        break;
      case "client namespace disconnect":
        console.log(
          `👋 WebSocket client disconnect: ${socket.id} (user: ${userId}) - Duration: ${durationMinutes}m ${durationSeconds}s`
        );
        break;
      default:
        console.log(
          `🔌 WebSocket disconnected: ${socket.id} (user: ${userId}) - Reason: ${reason}, Duration: ${durationMinutes}m ${durationSeconds}s`
        );
        break;
    }
  };
}

function handleConnectError(socket, error) {
  console.error(`❌ WebSocket connection error for ${socket.id}:`, {
    error: error.message,
    userId: socket.userInfo?.userId,
    timestamp: new Date().toISOString(),
  });
}

function handlePing(socket) {
  socket.connectionMetadata.lastPing = Date.now();
}

function handlePong(socket, latency) {
  if (latency > 5000) {
    console.warn(`⚠️ High WebSocket latency: ${socket.id} - ${latency}ms`);
  }
}

function handleJoinSession(socket, { sessionService }) {
  return async data => {
    const { sessionId } = data;

    try {
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Validate session ownership
      if (!session.userInfo || session.userInfo.userId !== socket.userInfo.userId) {
        socket.emit("error", {
          message: "Access denied: session belongs to different user",
        });
        return;
      }

      socket.join(sessionId);
      socket.emit("session-joined", { sessionId });

      // Send current context
      const context = await sessionService.getSessionContext(sessionId, socket.jwtToken);
      socket.emit("context-update", context);
    } catch (error) {
      socket.emit("error", {
        message: "Failed to join session: " + error.message,
      });
    }
  };
}

function chatMessageHandler(socket, { sessionService }) {
  return async data => {
    const { sessionId, message } = data;

    try {
      // Validate session ownership first
      const session = await sessionService.getSession(sessionId);

      if (!session) {
        socket.emit("chat-error", { error: "Session not found" });
        return;
      }

      if (!session.userInfo || session.userInfo.userId !== socket.userInfo.userId) {
        socket.emit("chat-error", {
          error: "Access denied: session belongs to different user",
        });
        return;
      }

      // Ensure session uses fresh JWT token
      await sessionService.updateSessionToken(sessionId, socket.jwtToken);

      // Emit thinking status
      socket.emit("chat-status", {
        status: "thinking",
        timestamp: new Date().toISOString(),
      });

      // Process message with streaming callbacks
      const response = await processMessageWithStreaming(
        sessionId,
        message,
        {
          onToolCall: toolCall => {
            const enrichedToolCall = enrichToolCallsWithDisplayNames([toolCall])[0];
            socket.emit("tool-call", {
              sessionId,
              name: toolCall.name,
              displayName: enrichedToolCall.displayName,
              args: toolCall.args,
              timestamp: new Date().toISOString(),
            });
          },
          onToolResult: (toolCall, result) => {
            const enrichedToolCall = enrichToolCallsWithDisplayNames([toolCall])[0];
            socket.emit("tool-result", {
              sessionId,
              name: toolCall.name,
              displayName: enrichedToolCall.displayName,
              content: result.content || result,
              isError: result.is_error || false,
              toolUseId: result.tool_use_id || toolCall.id,
              timestamp: new Date().toISOString(),
            });
          },
          onResponseChunk: chunk => {
            // Check if chunk already has metadata (enhanced chunk)
            if (chunk && typeof chunk === 'object' && chunk.chunk !== undefined && chunk.metadata) {
              // Chunk is already enhanced with metadata, add sessionId and emit
              socket.emit("response-chunk", {
                ...chunk,
                sessionId,
              });
            } else {
              // Legacy chunk, wrap it
              socket.emit("response-chunk", {
                sessionId,
                chunk: chunk,
                timestamp: new Date().toISOString(),
              });
            }
          },
          onStatusChange: status => {
            socket.emit("chat-status", {
              sessionId,
              status: status,
              timestamp: new Date().toISOString(),
            });
          },
          onText: chunk => {
            socket.emit("response-chunk", {
              sessionId,
              chunk: chunk,
              timestamp: new Date().toISOString(),
            });
          },
          onComplete: finalResponse => {
            // Calculate elapsed time here in the callback since we have access to session
            const session = sessionService.sessions.get(sessionId);
            const promptElapsed = session?.timing?.promptStartTime 
              ? (Date.now() - session.timing.promptStartTime) / 1000 
              : 0;
            
            console.log(`🌐 WebSocket sending elapsed time: ${promptElapsed.toFixed(2)}s`);
            
            socket.emit("response-complete", {
              sessionId,
              response: finalResponse.response,
              toolCalls: enrichToolCallsWithDisplayNames(finalResponse.toolCalls || []),
              usage: finalResponse.usage,
              responseTime: finalResponse.responseTime,
              timestamp: finalResponse.timestamp,
              promptElapsed: promptElapsed,
            });
          },
        },
        { sessionService }
      );

      // Emit updated context
      const context = await sessionService.getSessionContext(sessionId, socket.jwtToken);
      socket.emit("context-update", context);

      // Broadcast to room if multiple clients
      socket.to(sessionId).emit("chat-broadcast", {
        type: "message",
        user: "anonymous", // Could be enhanced with user management
        message,
        response: response.response,
        timestamp: response.timestamp,
      });
    } catch (error) {
      // Handle specific API errors with better user messaging
      let errorMessage = error.message;
      let retryable = false;

      if (error.message.includes("overloaded") || error.message.includes("Overloaded")) {
        errorMessage = "Claude API is temporarily overloaded. Please wait a moment and try again.";
        retryable = true;
      } else if (error.message.includes("rate_limit")) {
        errorMessage = "Rate limit exceeded. Please wait before sending another message.";
        retryable = true;
      }

      socket.emit("chat-error", {
        error: errorMessage,
        retryable,
        timestamp: new Date().toISOString(),
      });

      console.error(`Chat error for session ${sessionId}:`, error.message);
    }
  };
}

function commandHandler(socket, { sessionService }) {
  return async data => {
    const { sessionId, command, args } = data;

    try {
      const result = await handleCommand(sessionId, command, args, socket.jwtToken, {
        sessionService,
      });
      socket.emit("command-result", { command, result });

      // Emit updated context if command affects it
      if (["clear", "status"].includes(command)) {
        const context = await sessionService.getSessionContext(sessionId, socket.jwtToken);
        socket.emit("context-update", context);
      }
    } catch (error) {
      socket.emit("command-error", { command, error: error.message });
    }
  };
}

function terminateWorkHandler(socket, { sessionService }) {
  return async data => {
    const { sessionId, reason } = data;
    const timestamp = new Date().toISOString();

    console.log('\n' + '='.repeat(80));
    console.log(`🛑 TERMINATE-WORK EVENT RECEIVED at ${timestamp}`);
    console.log('='.repeat(80));
    console.log(`📍 Session ID: ${sessionId}`);
    console.log(`👤 User ID: ${socket.userInfo?.userId || 'unknown'}`);
    console.log(`🏢 Team ID: ${socket.userInfo?.teamId || 'unknown'}`);
    console.log(`🔌 Socket ID: ${socket.id}`);
    console.log(`📝 Reason: ${reason || 'User requested cancellation (no reason provided)'}`);
    console.log(`📊 Data received:`, JSON.stringify(data, null, 2));
    console.log('-'.repeat(80));

    try {
      // Validate session ownership
      console.log(`🔍 Validating session ownership...`);
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        console.log(`❌ Session not found: ${sessionId}`);
        console.log('='.repeat(80) + '\n');
        socket.emit("terminate-error", { error: "Session not found" });
        return;
      }
      
      console.log(`✅ Session found:`);
      console.log(`   - Session user: ${session.userInfo?.userId || 'none'}`);
      console.log(`   - Request user: ${socket.userInfo?.userId}`);
      console.log(`   - Session active: ${!session.cancelled}`);
      console.log(`   - Last activity: ${session.lastActivity || 'unknown'}`);

      if (!session.userInfo || session.userInfo.userId !== socket.userInfo.userId) {
        console.log(`❌ Access denied: session belongs to different user`);
        console.log(`   - Session owner: ${session.userInfo?.userId || 'none'}`);
        console.log(`   - Requesting user: ${socket.userInfo?.userId}`);
        console.log('='.repeat(80) + '\n');
        socket.emit("terminate-error", {
          error: "Access denied: session belongs to different user",
        });
        return;
      }
      
      console.log(`✅ User authorized to cancel session`);

      // Cancel current operation (temporary, session stays active)
      console.log(`\n🔄 Initiating cancellation process...`);
      console.log(`   Step 1: Setting operation cancelled flag...`);
      await sessionService.setOperationCancelled(sessionId, reason);
      console.log(`   ✅ Operation cancelled flag set`);

      // Add cancellation notice to conversation and clean up
      console.log(`   Step 2: Adding cancellation notice to conversation...`);
      await sessionService.addCancellationNotice(sessionId, reason);
      console.log(`   ✅ Cancellation notice added to conversation`);

      // Emit status update
      console.log(`\n📤 Sending cancellation notifications...`);
      console.log(`   Step 3: Emitting chat-status (cancelled)...`);
      socket.emit("chat-status", {
        status: "cancelled",
        reason: reason || "User requested cancellation",
        timestamp: new Date().toISOString(),
      });
      console.log(`   ✅ chat-status event sent`);

      // Emit cancellation confirmation
      console.log(`   Step 4: Emitting work-cancelled confirmation...`);
      socket.emit("work-cancelled", {
        sessionId,
        reason: reason || "User requested cancellation",
        message: "Current operation cancelled. You can continue with a new question.",
        timestamp: new Date().toISOString(),
      });
      console.log(`   ✅ work-cancelled event sent`);

      // Emit updated context
      console.log(`   Step 5: Getting and sending updated context...`);
      const context = await sessionService.getSessionContext(sessionId, socket.jwtToken);
      socket.emit("context-update", context);
      console.log(`   ✅ context-update event sent`);

      // Broadcast to room if multiple clients
      const roomClients = await socket.in(sessionId).allSockets();
      if (roomClients.size > 1) {
        console.log(`   Step 6: Broadcasting to ${roomClients.size - 1} other clients in room...`);
        socket.to(sessionId).emit("work-cancelled-broadcast", {
          sessionId,
          cancelledBy: socket.userInfo?.userId,
          reason: reason || "User requested cancellation",
          timestamp: new Date().toISOString(),
        });
        console.log(`   ✅ Broadcast sent to other clients`);
      } else {
        console.log(`   Step 6: No other clients in room, skipping broadcast`);
      }
      
      console.log(`\n✅ TERMINATION COMPLETE`);
      console.log(`   - Session ${sessionId} operation cancelled`);
      console.log(`   - Session remains active for new questions`);
      console.log(`   - Total time: ${Date.now() - new Date(timestamp).getTime()}ms`);
      console.log('='.repeat(80) + '\n');

    } catch (error) {
      console.error(`\n❌ TERMINATION FAILED`);
      console.error(`   Session: ${sessionId}`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
      console.log('='.repeat(80) + '\n');
      
      socket.emit("cancel-error", {
        error: "Failed to cancel operation: " + error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };
}
