import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

export class AdenMCPClient extends EventEmitter {
  constructor(serverPath = "../src/index.js", options = {}) {
    super();
    this.serverPath = serverPath;
    this.client = null;
    this.transport = null;
    this.serverProcess = null;
    this.isConnected = false;
    this.availableTools = [];
    this.jwtToken = options.jwtToken || null;
    this.teamId = options.teamId || null;
    
    // Cancellation support
    this.operationCancelled = false;
    this.activeOperations = new Map(); // Track active tool calls
  }

  async connect() {
    try {
      if (!this.serverPath) {
        throw new Error("Server path not specified");
      }

      // Prepare environment variables for the MCP server process
      const serverEnv = { ...process.env };
      if (this.jwtToken) {
        // Strip 'jwt ' prefix if present before setting environment variable
        const tokenValue = this.jwtToken.startsWith("jwt ")
          ? this.jwtToken.substring(4)
          : this.jwtToken;
        serverEnv.ADEN_API_TOKEN = tokenValue;
      }
      if (this.teamId) {
        serverEnv.CURRENT_TEAM_ID = this.teamId;
        console.log(`🐛 DEBUG MCP Client passing teamId to server: ${this.teamId}`);
        console.log(`🐛 DEBUG serverEnv.CURRENT_TEAM_ID:`, serverEnv.CURRENT_TEAM_ID);
      } else {
        console.log(`🐛 DEBUG MCP Client - no teamId available:`, this.teamId);
      }

      // Use the StdioClientTransport directly with command and args
      this.transport = new StdioClientTransport({
        command: "node",
        args: [this.serverPath],
        cwd: process.cwd(),
        env: serverEnv,
      });

      // Create and connect the MCP client
      this.client = new Client(
        {
          name: "aden-cli-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(this.transport);
      this.isConnected = true;

      // Get available tools
      await this.refreshTools();

      this.emit("connected");
      return true;
    } catch (error) {
      this.emit("error", error);
      throw new Error(`Failed to connect to MCP server: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        await this.client.close();
        this.client = null;
      }

      if (this.transport) {
        // The transport will handle cleanup of the spawned process
        this.transport = null;
      }

      this.isConnected = false;
      this.availableTools = [];
      this.emit("disconnected");
    } catch (error) {
      this.emit("error", error);
    }
  }

  async refreshTools() {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await this.client.listTools();
      this.availableTools = response.tools || [];
      
      // Debug: Check if db_query tool has proper schema
      const dbQueryTool = this.availableTools.find(t => t.name === 'db_query');
      if (dbQueryTool) {
        console.log('🔧 MCP db_query tool schema:', JSON.stringify(dbQueryTool, null, 2));
      }
      
      return this.availableTools;
    } catch (error) {
      throw new Error(`Failed to get tools: ${error.message}`);
    }
  }

  async listTools() {
    return this.availableTools;
  }

  getAvailableTools() {
    return this.availableTools;
  }

  async callTool(toolName, args = {}) {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    // Check for cancellation before starting
    if (this.operationCancelled) {
      throw new Error('Operation cancelled by user');
    }

    // Generate operation ID for tracking
    const operationId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Auto-inject JWT token for tools that require authentication
    const toolsNeedingAuth = ['rag_query'];
    
    // console.log(`🔧 MCP Client callTool: ${toolName}`);
    // console.log(`🔑 this.jwtToken available: ${!!this.jwtToken}`);
    // console.log(`🔑 this.jwtToken value: ${this.jwtToken ? this.jwtToken.substring(0, 20) + '...' : 'null'}`);
    // console.log(`📋 Original args:`, JSON.stringify(args, null, 2));
    
    if (toolsNeedingAuth.includes(toolName) && this.jwtToken) {
      // Strip 'jwt ' prefix if present, same as server environment setup
      const tokenValue = this.jwtToken.startsWith("jwt ")
        ? this.jwtToken.substring(4)
        : this.jwtToken;
      args = { ...args, jwtToken: tokenValue };
      // console.log(`📋 Modified args:`, JSON.stringify(args, null, 2));
    }

    try {
      // Track the active operation
      this.activeOperations.set(operationId, {
        toolName,
        args,
        startTime: Date.now()
      });

      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      // Remove from active operations
      this.activeOperations.delete(operationId);

      // Final cancellation check
      if (this.operationCancelled) {
        throw new Error('Operation cancelled by user');
      }

      return this.parseToolResponse(response);
    } catch (error) {
      // Remove from active operations on error
      this.activeOperations.delete(operationId);
      
      // Check if this is a cancellation
      if (this.operationCancelled || error.message.includes('cancelled')) {
        throw new Error('Operation cancelled by user');
      }
      
      throw new Error(`Tool call failed: ${error.message}`);
    }
  }

  parseToolResponse(response) {
    if (!response || !response.content) {
      return { text: "No response from tool", isError: true };
    }

    // Extract text content from MCP response
    const textContent = response.content
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("\n");

    return {
      text: textContent || "Empty response",
      isError: response.isError || false,
      content: response.content,
    };
  }

  // High-level methods for common operations
  async thinkSequentially(problem) {
    return await this.callTool("think_sequentially", { problem });
  }

  async planTasks(objective) {
    return await this.callTool("plan_tasks", { objective });
  }

  async executeTask(taskId) {
    return await this.callTool("execute_task", { taskId });
  }

  async getTaskStatus() {
    return await this.callTool("get_task_status");
  }

  // Utility methods
  isToolAvailable(toolName) {
    return this.availableTools.some(tool => tool.name === toolName);
  }

  getToolInfo(toolName) {
    return this.availableTools.find(tool => tool.name === toolName);
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { healthy: false, reason: "Not connected" };
      }

      // Try to get tools as a simple health check
      await this.refreshTools();

      return {
        healthy: true,
        toolCount: this.availableTools.length,
        transport: this.transport ? "connected" : "not connected",
      };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }

  // Event handling helpers
  onConnected(callback) {
    this.on("connected", callback);
  }

  onDisconnected(callback) {
    this.on("disconnected", callback);
  }

  onError(callback) {
    this.on("error", callback);
  }

  // Process cleanup
  setupCleanup() {
    const cleanup = () => {
      if (this.isConnected) {
        this.disconnect().catch(console.error);
      }
      // Force exit after cleanup
      setTimeout(() => process.exit(0), 100);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);
    process.on("uncaughtException", err => {
      console.error("Uncaught exception:", err);
      cleanup();
    });
  }

  /**
   * Cancel current operation
   */
  cancelCurrentOperation() {
    console.log(`🛑 Cancelling MCP operations (${this.activeOperations.size} active)`);
    this.operationCancelled = true;
    
    // Log active operations being cancelled
    for (const [operationId, operation] of this.activeOperations.entries()) {
      console.log(`🛑 Cancelling ${operation.toolName} operation: ${operationId}`);
    }
    
    // Clear active operations
    this.activeOperations.clear();
  }

  /**
   * Check if operation is cancelled
   */
  isOperationCancelled() {
    return this.operationCancelled;
  }

  /**
   * Reset cancellation state
   */
  resetCancellation() {
    this.operationCancelled = false;
    this.activeOperations.clear();
  }

  /**
   * Get active operations count
   */
  getActiveOperationsCount() {
    return this.activeOperations.size;
  }

  /**
   * Get active operations info
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.entries()).map(([id, operation]) => ({
      id,
      toolName: operation.toolName,
      duration: Date.now() - operation.startTime
    }));
  }
}
