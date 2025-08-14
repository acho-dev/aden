#!/usr/bin/env node

import express from "express";
import { createServer } from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Import from other packages
import { Config } from "../../agent-client/src/config.js";
import { Mem0MemoryService } from "../../mcp-server/src/mem0-memory-service.js";
import SessionService from "./services/session-service.js";

import { setupWebSocket } from "./websocket.js";
import sessionRoutes from "./routes/session-routes.js";
import systemRoutes from "./routes/system-routes.js";
import logRoutes from "./routes/log-routes.js";
import oneShotRoutes from "./routes/one-shot-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

/**
 * HTTP API Server that exposes all CLI functionality for web clients
 * Supports both REST endpoints and WebSocket for real-time chat
 */
class AdenAPIServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.config = new Config();

    try {
      // Mem0 memory service
      this.memoryService = new Mem0MemoryService(process.env.MEM0_API_KEY, {
        maxMemoriesPerSearch: 5,
        enableSessionSummaries: true,
        organizationName: process.env.MEM0_ORG_NAME,
        projectName: process.env.MEM0_PROJECT_NAME,
      });
      console.log("🧠 Mem0 cloud memory service initialized");
    } catch (error) {
      console.warn("Failed to initialize Mem0 memory service:", error.message);
      throw new Error(`Failed to initialize Mem0 memory service: ${error.message}`);
    }

    // Make sessions accessible to middleware
    this.sessionService = new SessionService({
      config: this.config,
      memoryService: this.memoryService,
    });

    this.app.locals.memoryService = this.memoryService;
    this.app.locals.sessionService = this.sessionService;
    this.app.locals.config = this.config;

    this.setupMiddleware();
    this.setupRoutes();

    this.io = setupWebSocket(this.server, {
      sessionService: this.sessionService,
      memoryService: this.memoryService,
    });
  }

  setupMiddleware() {
    // CORS
    this.app.use(cors());

    // JSON parsing
    this.app.use(express.json({ limit: "10mb" }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });

    // JWT Authentication middleware
    this.app.use(this.authenticateJWT.bind(this));

    // Error handling
    this.app.use((err, req, res, next) => {
      console.error("API Error:", err);
      res.status(500).json({
        error: "Internal server error",
        message: err.message,
      });
    });
  }

  /**
   * JWT Authentication middleware
   * Validates "jwt <token>" format in Authorization header
   * Note: Does not verify token signature - token is issued by external server
   */
  authenticateJWT(req, res, next) {
    // Skip authentication for health check
    if (req.path === "/health") {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "Authorization header required",
        message: 'Please provide Authorization header with format: "jwt <ADEN_API_TOKEN>"',
      });
    }

    // Check for "jwt <token>" format
    const tokenMatch = authHeader.match(/^jwt\s+(.+)$/i);
    if (!tokenMatch) {
      return res.status(401).json({
        error: "Invalid authorization format",
        message: 'Authorization header must be in format: "jwt <ADEN_API_TOKEN>"',
      });
    }

    const token = tokenMatch[1];

    try {
      // Basic JWT format validation (without signature verification)
      const parts = token.split(".");
      if (parts.length !== 3) {
        return res.status(403).json({
          error: "Invalid token format",
          message: "Token must be a valid JWT with 3 parts",
        });
      }

      // Decode payload (without verification since token is from external issuer)
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      // Basic expiration check if 'exp' claim exists
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return res.status(401).json({
          error: "Token expired",
          message: "The provided token has expired",
        });
      }

      // Add decoded token info to request for use in handlers
      req.user = payload;

      // Token format is valid, proceed to next middleware
      next();
    } catch (error) {
      return res.status(403).json({
        error: "Invalid token",
        message: "The provided token is malformed",
      });
    }
  }

  setupRoutes() {
    this.app.locals.port = this.port;
    this.app.use("/", systemRoutes);
    this.app.use("/", sessionRoutes);
    this.app.use("/", logRoutes);
    this.app.use("/", oneShotRoutes);
  }

  /**
   * Health check - Enhanced with detailed logging and error handling
   */
  async healthCheck(req, res) {
    const startTime = Date.now();
    try {
      // Ensure session manager is available for health status
      let mongoConnected = false;
      try {
        await this.sessionService.ensurePersistenceReady();
        mongoConnected = this.sessionService.isPersistenceReady();
      } catch (error) {
        console.warn(`⚠️ Health check: MongoDB connection check failed: ${error.message}`);
      }

      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        activeSessions: this.sessionService.sessions.size,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        mongoConnected,
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      };

      const responseTime = Date.now() - startTime;

      // Log slow health checks to identify performance issues
      if (responseTime > 2000) {
        console.warn(
          `⚠️ Slow health check response: ${responseTime}ms - Memory: ${JSON.stringify(
            health.memory
          )}`
        );
      } else if (responseTime > 1000) {
        console.log(`💓 Health check response: ${responseTime}ms`);
      }

      // Add response time to health data
      health.responseTimeMs = responseTime;

      res.json(health);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ Health check error after ${responseTime}ms: ${error.message}`);
      console.error(`❌ Health check stack: ${error.stack}`);

      // Still return 200 but with error info to avoid unnecessary pod restarts
      res.status(200).json({
        status: "degraded",
        error: error.message,
        timestamp: new Date().toISOString(),
        responseTimeMs: responseTime,
        activeSessions: this.sessionService.sessions?.size || 0,
      });
    }
  }

  async start() {
    // Validate configuration
    const validation = this.config.validate();
    if (!validation.isValid) {
      console.error("❌ Configuration issues found:");
      validation.errors.forEach(error => {
        console.error(`  - ${error}`);
      });
      console.error("\n💡 Run the client configuration first:");
      console.error("  cd ../client && node src/cli.js config");
      process.exit(1);
    }

    // Initialize MongoDB session manager during startup
    await this.sessionService.ensurePersistenceReady();
    if (this.sessionService.isPersistenceReady()) {
      console.log("💾 Session persistence enabled - sessions will be restored on demand");
    } else {
      console.log("💾 Session persistence disabled - sessions will be in-memory only");
    }

    this.server.listen(this.port, () => {
      console.log(`🚀 Aden API Server running on port ${this.port}`);
      console.log(`📡 WebSocket support enabled`);
      console.log(`🔧 HTTP endpoints available at http://localhost:${this.port}`);
      console.log(`📖 API documentation at http://localhost:${this.port}/api`);
      console.log(`💾 All sessions are persistent - no automatic cleanup`);
    });

    // Graceful shutdown for Kubernetes
    const gracefulShutdown = async signal => {
      console.log(`\n🛑 Received ${signal}, shutting down API server gracefully...`);

      // Enhanced logging to trace SIGTERM source
      console.log(`🔍 SIGTERM Debug Info:`);
      console.log(`   - Signal: ${signal}`);
      console.log(`   - Parent PID: ${process.ppid}`);
      console.log(`   - Current PID: ${process.pid}`);
      console.log(`   - Memory usage: ${JSON.stringify(process.memoryUsage())}`);
      console.log(`   - Uptime: ${Math.floor(process.uptime())} seconds`);
      console.log(`   - Active sessions: ${this.sessionService.sessions.size}`);
      console.log(`   - Session service initialized: ${this.sessionService.isPersistenceReady()}`);
      console.log(`   - Node version: ${process.version}`);
      console.log(`   - Platform: ${process.platform}`);
      console.log(`   - Environment: ${process.env.NODE_ENV || "development"}`);

      // Log current load
      const totalConnections = this.io?.engine?.clientsCount || 0;
      console.log(`   - WebSocket connections: ${totalConnections}`);

      // Log pod information if available
      if (process.env.POD_NAME) {
        console.log(`   - Pod name: ${process.env.POD_NAME}`);
        console.log(`   - Pod namespace: ${process.env.POD_NAMESPACE}`);
        console.log(`   - Pod IP: ${process.env.POD_IP}`);
      }

      // Stop accepting new connections
      this.server.close(async () => {
        console.log("🔌 HTTP server stopped accepting new connections");

        // Close all WebSocket connections gracefully with proper cleanup
        console.log("🔌 Closing WebSocket connections...");

        // Get current connected clients before closing
        const connectedClients = this.io?.engine?.clientsCount || 0;
        console.log(`   - Disconnecting ${connectedClients} WebSocket clients`);

        // Notify all connected clients about shutdown
        this.io.emit("server-shutdown", {
          message: "Server is shutting down gracefully",
          timestamp: new Date().toISOString(),
          reconnectAfter: 30000, // Suggest reconnect after 30 seconds
        });

        // Give clients time to receive shutdown notification
        await new Promise(resolve => setTimeout(resolve, 2000));

        this.io.close(() => {
          console.log("✅ All WebSocket connections closed gracefully");
        });

        // Save all active sessions to MongoDB before shutdown
        if (this.sessionService.isPersistenceReady()) {
          console.log("💾 Saving active sessions to MongoDB...");
          for (const [sessionId, session] of this.sessionService.sessions.entries()) {
            try {
              await this.sessionService.saveSessionToPersistence(session);
            } catch (error) {
              console.error(`Failed to save session ${sessionId}:`, error);
            }
          }
        }

        // Clean up all sessions
        console.log("🧹 Cleaning up sessions...");
        for (const sessionId of this.sessionService.sessions.keys()) {
          await this.sessionService.destroySession(sessionId).catch(console.error);
        }

        // Disconnect from MongoDB
        await this.sessionService.disconnect();

        console.log("✅ API server shut down gracefully");
        process.exit(0);
      });

      // Force exit after 30 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error("⚠️ Graceful shutdown timeout, forcing exit");
        process.exit(1);
      }, 30000);
    };

    // Handle multiple shutdown signals for Kubernetes
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // Kubernetes uses SIGTERM
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || process.argv[2] || 3001;
  const server = new AdenAPIServer(parseInt(port));
  server.start().catch(console.error);
}

export { AdenAPIServer };
