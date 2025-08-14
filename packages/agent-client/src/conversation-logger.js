import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { HTMLRenderer } from "./html-renderer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conversation Logger for tracking tool calls, prompts, and responses
 * Organizes logs by conversation sessions with detailed metadata
 */
export class ConversationLogger {
  constructor(config = {}, htmlConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.logDir = config.logDir || path.join(__dirname, "..", "logs");
    this.sessionId = null;
    this.sessionStartTime = null;
    this.currentSession = null;
    this.maxLogFileSize = config.maxLogFileSize || 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = config.maxLogFiles || 50;

    // HTML rendering configuration
    this.htmlEnabled = htmlConfig.enabled ?? true;
    this.autoGenerateHTML = htmlConfig.autoGenerate ?? true;
    this.htmlRenderer = new HTMLRenderer({
      outputDir: htmlConfig.outputDir || path.join(this.logDir, "html"),
      theme: htmlConfig.theme || "modern",
      includeRawPrompts: htmlConfig.includeRawPrompts ?? true,
      includeToolDetails: htmlConfig.includeToolDetails ?? true,
      autoOpen: htmlConfig.autoOpen ?? false,
    });
  }

  /**
   * Start a new conversation session
   */
  async startSession(metadata = {}) {
    if (!this.enabled) return;

    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();

    this.currentSession = {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime.toISOString(),
      endTime: null,
      metadata: {
        user: process.env.USER || "unknown",
        platform: process.platform,
        nodeVersion: process.version,
        ...metadata,
      },
      interactions: [],
      stats: {
        totalInteractions: 0,
        totalToolCalls: 0,
        totalPrompts: 0,
        totalTokensUsed: 0,
      },
    };

    await this.ensureLogDirectory();
    await this.writeSessionLog();
  }

  /**
   * End the current session
   */
  async endSession() {
    if (!this.enabled || !this.currentSession) return;

    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.duration = Date.now() - new Date(this.currentSession.startTime).getTime();

    await this.writeSessionLog();

    // Generate HTML report automatically if enabled
    if (this.htmlEnabled && this.autoGenerateHTML) {
      try {
        const htmlPath = await this.generateHTMLReport();
        console.log(`📄 HTML report generated: ${htmlPath}`);
      } catch (error) {
        console.warn("Failed to generate HTML report:", error.message);
      }
    }

    // Clean up old logs if needed
    await this.cleanupOldLogs();

    this.currentSession = null;
    this.sessionId = null;
    this.sessionStartTime = null;
  }

  /**
   * Log a user message and system response interaction
   */
  async logInteraction(
    userMessage,
    systemResponse,
    toolCalls = [],
    rawPrompts = [],
    metadata = {}
  ) {
    if (!this.enabled || !this.currentSession) return;

    const interaction = {
      id: this.generateInteractionId(),
      timestamp: new Date().toISOString(),
      userMessage,
      systemResponse,
      toolCalls: toolCalls.map(tc => ({
        id: tc.id || "unknown",
        name: tc.name,
        input: tc.input,
        result: tc.result,
        executionTime: tc.executionTime,
        error: tc.error,
      })),
      rawPrompts: rawPrompts.map(prompt => ({
        id: this.generatePromptId(),
        timestamp: new Date().toISOString(),
        type: prompt.type || "unknown", // 'initial', 'tool-generation', 'analysis'
        messages: prompt.messages,
        system: prompt.system,
        model: prompt.model,
        temperature: prompt.temperature,
        maxTokens: prompt.maxTokens,
        response: prompt.response,
        usage: prompt.usage,
      })),
      metadata: {
        responseTime: metadata.responseTime,
        tokensUsed: metadata.tokensUsed,
        ...metadata,
      },
    };

    this.currentSession.interactions.push(interaction);

    // Update session stats
    this.currentSession.stats.totalInteractions++;
    this.currentSession.stats.totalToolCalls += toolCalls.length;
    this.currentSession.stats.totalPrompts += rawPrompts.length;
    this.currentSession.stats.totalTokensUsed += metadata.tokensUsed || 0;

    await this.writeSessionLog();
  }

  /**
   * Log a raw prompt sent to the LLM
   */
  async logRawPrompt(promptData) {
    if (!this.enabled) return;

    // This is used for individual prompt logging
    // Main logging happens in logInteraction
    const promptLog = {
      id: this.generatePromptId(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...promptData,
    };

    // Store in a separate prompts log file for detailed analysis
    await this.writeRawPromptLog(promptLog);
  }

  /**
   * Log tool call execution details
   */
  async logToolCall(toolCall) {
    if (!this.enabled) return;

    const toolLog = {
      id: toolCall.id || this.generateToolCallId(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      name: toolCall.name,
      input: toolCall.input,
      result: toolCall.result,
      executionTime: toolCall.executionTime,
      error: toolCall.error,
      metadata: toolCall.metadata || {},
    };

    // Store in a separate tool calls log file for detailed analysis
    await this.writeToolCallLog(toolLog);
  }

  /**
   * Get session logs with optional filtering
   */
  async getSessionLogs(filters = {}) {
    if (!this.enabled) return [];

    try {
      const logFiles = await fs.readdir(this.logDir);
      const sessionFiles = logFiles.filter(
        file => file.startsWith("session-") && file.endsWith(".json")
      );

      const sessions = [];
      for (const file of sessionFiles) {
        try {
          const content = await fs.readFile(path.join(this.logDir, file), "utf8");
          const session = JSON.parse(content);

          if (this.matchesFilters(session, filters)) {
            sessions.push(session);
          }
        } catch (error) {
          console.warn(`Failed to read session log ${file}:`, error.message);
        }
      }

      // Sort by start time, most recent first
      return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    } catch (error) {
      console.error("Failed to get session logs:", error.message);
      return [];
    }
  }

  /**
   * Get detailed logs for a specific session
   */
  async getSessionDetails(sessionId) {
    if (!this.enabled) return null;

    try {
      const sessionFile = path.join(this.logDir, `session-${sessionId}.json`);
      const content = await fs.readFile(sessionFile, "utf8");
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to get session details for ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * Get aggregated statistics across sessions
   */
  async getStatistics(filters = {}) {
    if (!this.enabled) return null;

    const sessions = await this.getSessionLogs(filters);

    return {
      totalSessions: sessions.length,
      totalInteractions: sessions.reduce((sum, s) => sum + s.stats.totalInteractions, 0),
      totalToolCalls: sessions.reduce((sum, s) => sum + s.stats.totalToolCalls, 0),
      totalPrompts: sessions.reduce((sum, s) => sum + s.stats.totalPrompts, 0),
      totalTokensUsed: sessions.reduce((sum, s) => sum + s.stats.totalTokensUsed, 0),
      averageInteractionsPerSession:
        sessions.length > 0
          ? sessions.reduce((sum, s) => sum + s.stats.totalInteractions, 0) / sessions.length
          : 0,
      dateRange:
        sessions.length > 0
          ? {
              earliest: sessions[sessions.length - 1].startTime,
              latest: sessions[0].startTime,
            }
          : null,
    };
  }

  /**
   * Generate HTML report for the current session
   */
  async generateHTMLReport(sessionId = null) {
    if (!this.htmlEnabled) {
      throw new Error("HTML reporting is disabled");
    }

    const targetSessionId = sessionId || this.sessionId;
    if (!targetSessionId) {
      throw new Error("No session ID provided and no active session");
    }

    const sessionData =
      targetSessionId === this.sessionId
        ? this.currentSession
        : await this.getSessionDetails(targetSessionId);

    if (!sessionData) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    return await this.htmlRenderer.renderSession(sessionData);
  }

  /**
   * Generate HTML reports for multiple sessions
   */
  async generateHTMLReports(sessionIds = null) {
    if (!this.htmlEnabled) {
      throw new Error("HTML reporting is disabled");
    }

    const targetSessions = sessionIds || (await this.getSessionLogs()).map(s => s.sessionId);
    const results = [];

    for (const sessionId of targetSessions) {
      try {
        const htmlPath = await this.generateHTMLReport(sessionId);
        results.push({ sessionId, htmlPath, success: true });
      } catch (error) {
        results.push({ sessionId, error: error.message, success: false });
      }
    }

    return results;
  }

  // Private methods

  generateSessionId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).slice(2, 8);
    return `${timestamp}-${random}`;
  }

  generateInteractionId() {
    return `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  generatePromptId() {
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  generateToolCallId() {
    return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create log directory:", error.message);
      // In Docker/container environments, disable logging if we can't create directories
      console.warn(
        "Disabling conversation logging due to permission issues in container environment"
      );
      this.enabled = false;
      this.htmlEnabled = false;
    }
  }

  async writeSessionLog() {
    if (!this.enabled || !this.currentSession) return;

    try {
      const sessionFile = path.join(this.logDir, `session-${this.sessionId}.json`);
      await fs.writeFile(sessionFile, JSON.stringify(this.currentSession, null, 2));
    } catch (error) {
      console.error("Failed to write session log:", error.message);
    }
  }

  async writeRawPromptLog(promptLog) {
    if (!this.enabled) return;

    try {
      const promptFile = path.join(this.logDir, "raw-prompts.jsonl");
      const line = JSON.stringify(promptLog) + "\n";
      await fs.appendFile(promptFile, line);
    } catch (error) {
      console.error("Failed to write prompt log:", error.message);
    }
  }

  async writeToolCallLog(toolLog) {
    if (!this.enabled) return;

    try {
      const toolFile = path.join(this.logDir, "tool-calls.jsonl");
      const line = JSON.stringify(toolLog) + "\n";
      await fs.appendFile(toolFile, line);
    } catch (error) {
      console.error("Failed to write tool call log:", error.message);
    }
  }

  matchesFilters(session, filters) {
    if (filters.dateFrom && new Date(session.startTime) < new Date(filters.dateFrom)) {
      return false;
    }
    if (filters.dateTo && new Date(session.startTime) > new Date(filters.dateTo)) {
      return false;
    }
    if (filters.minInteractions && session.stats.totalInteractions < filters.minInteractions) {
      return false;
    }
    if (filters.user && session.metadata.user !== filters.user) {
      return false;
    }
    return true;
  }

  async cleanupOldLogs() {
    try {
      const logFiles = await fs.readdir(this.logDir);
      const sessionFiles = logFiles
        .filter(file => file.startsWith("session-") && file.endsWith(".json"))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          stats: null,
        }));

      // Get file stats
      for (const file of sessionFiles) {
        try {
          file.stats = await fs.stat(file.path);
        } catch (error) {
          console.warn(`Failed to get stats for ${file.name}:`, error.message);
        }
      }

      // Sort by modification time, oldest first
      const validFiles = sessionFiles.filter(f => f.stats);
      validFiles.sort((a, b) => a.stats.mtime - b.stats.mtime);

      // Remove old files if we exceed the limit
      if (validFiles.length > this.maxLogFiles) {
        const filesToRemove = validFiles.slice(0, validFiles.length - this.maxLogFiles);
        for (const file of filesToRemove) {
          try {
            await fs.unlink(file.path);
            console.log(`Removed old log file: ${file.name}`);
          } catch (error) {
            console.warn(`Failed to remove old log file ${file.name}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error("Failed to cleanup old logs:", error.message);
    }
  }
}
