#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import readline from "readline";
import { AdenMCPClient } from "./mcp-client.js";
import { LLMFactory } from "./llm/llm-factory.js";
import { Config } from "./config.js";
import { ConversationLogger } from "./conversation-logger.js";
import { parseJWTToken } from "./auth-utils.js";
import { getToolDisplayName } from "../../mcp-server/src/tool-display-names.js";
import { DecisionExecutor, DecisionContext } from "./decision-executor/index.js";
import { createAdenOrgTenantId } from "./utils/tenant-utils.js";

class AdenCLI {
  constructor() {
    this.config = new Config();
    this.mcpClient = null;
    this.llmClient = null;
    this.isConnected = false;
    this.conversationActive = false;
    this.sessionId = null; // Persistent session ID for conversation continuity
    this.userInfo = null; // Will store parsed JWT info including teamId
    this.logger = new ConversationLogger(
      this.config.get("conversationLogging"),
      this.config.get("htmlReporting")
    );
  }

  async initialize() {
    // Validate configuration
    const validation = this.config.validate();
    if (!validation.isValid) {
      console.log(chalk.red("❌ Configuration issues found:"));
      validation.errors.forEach(error => {
        console.log(chalk.red(`  - ${error}`));
      });

      const { setup } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setup",
          message: "Would you like to set up configuration now?",
          default: true,
        },
      ]);

      if (setup) {
        await this.config.setupInteractive();
      } else {
        console.log(chalk.yellow("Please configure the client before using it."));
        process.exit(1);
      }
    }

    // Parse JWT token if provided to extract teamId
    const authConfig = this.config.getAuthConfig();
    if (authConfig.jwtToken) {
      try {
        this.userInfo = await parseJWTToken(authConfig.jwtToken, authConfig.adenHost);
        console.log(
          chalk.green(
            `🔐 Logged in as user ${this.userInfo.userId} (team: ${this.userInfo.teamId})`
          )
        );
      } catch (error) {
        console.log(chalk.yellow(`⚠️  JWT token parsing failed: ${error.message}`));
        console.log(chalk.gray("Memory features will not be available"));
      }
    }

    // Initialize clients
    const llmConfig = this.config.getCurrentLLMConfig();
    const mcpConfig = this.config.getMCPConfig();
    const agentConfig = this.config.getAgentConfig();

    this.llmClient = await LLMFactory.create(
      llmConfig.provider,
      {
        model: llmConfig.model,
        maxTokens: llmConfig.maxTokens,
        temperature: llmConfig.temperature,
        // Pass agent configuration for multi-agent functionality
        ...agentConfig,
      },
      {
        apiKey: llmConfig.apiKey,
      }
    );

    // Set teamId on LLM client if available (for Neo4j tenant scoping)
    if (this.userInfo?.teamId && this.llmClient) {
      this.llmClient.teamId = this.userInfo.teamId;
    }

    // Pass JWT token and teamId to MCP client
    this.mcpClient = new AdenMCPClient(mcpConfig.serverPath, {
      jwtToken: authConfig.jwtToken,
      teamId: this.userInfo?.teamId,
    });
    this.mcpClient.setupCleanup();
  }

  async connect() {
    const spinner = ora("Connecting to MCP server...").start();

    try {
      await this.mcpClient.connect();
      this.isConnected = true;
      spinner.succeed("Connected to MCP server");

      // Show available tools
      const tools = this.mcpClient.getAvailableTools();
      console.log(chalk.blue(`\n🔧 Available tools: ${tools.map(t => t.name).join(", ")}\n`));
    } catch (error) {
      spinner.fail(`Failed to connect: ${error.message}`);
      throw error;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.mcpClient.disconnect();
      this.isConnected = false;
      console.log(chalk.yellow("Disconnected from MCP server"));
    }
  }

  async startInteractiveChat() {
    if (!this.isConnected) {
      await this.connect();
    }

    // Generate persistent session ID for this chat session
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(chalk.gray(`📝 Session ID: ${this.sessionId}`));

    // Set sessionId in LLM client (required by chatWithStreaming)
    this.llmClient.sessionId = this.sessionId;

    // Start logging session
    await this.logger.startSession({
      type: "interactive",
      llmProvider: this.config.getCurrentLLMConfig().provider,
      mcpServerPath: this.config.getMCPConfig().serverPath,
      userId: this.userInfo?.userId,
      teamId: this.userInfo?.teamId,
      sessionId: this.sessionId, // Include session ID in logging
    });

    console.log(chalk.green("\n🤖 Aden AI Assistant"));
    console.log(
      chalk.gray('Type your message and press Enter. Type "/help" for commands, "/quit" to exit.\n')
    );

    this.conversationActive = true;

    // Start the conversation loop
    await this.conversationLoop();
  }

  async conversationLoop() {
    while (this.conversationActive) {
      try {
        // Create fresh readline interface for each interaction
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        // Get user input
        const input = await new Promise(resolve => {
          rl.question(chalk.cyan(this.config.get("cli.prompt")), answer => {
            rl.close();
            resolve(answer.trim());
          });
        });

        // Handle the input
        if (input.startsWith("/")) {
          await this.handleCommand(input);
        } else if (input) {
          await this.processMessage(input);
        }
        // If empty input, just continue the loop
      } catch (error) {
        console.log(chalk.red(`\n❌ Error: ${error.message}`));
        console.log(chalk.yellow('Type "/help" for commands or try again.\n'));
      }
    }
  }

  createDecisionCallbacks() {
    return {
      onStatusChange: status => {
        console.log(chalk.gray(`💭 ${status}`));
      },
      onToolCall: toolCall => {
        console.log(chalk.cyan(`🔧 Using tool: ${getToolDisplayName(toolCall.name)}`));
      },
      onToolResult: (toolCall, result) => {
        if (!toolCall || !result) {
          console.log(chalk.yellow(`⚠️ Tool callback received invalid parameters`));
          return;
        }

        const toolName = toolCall.name || "unknown";
        if (!result.is_error) {
          console.log(chalk.green(`✅ Tool ${getToolDisplayName(toolName)} completed`));
        } else {
          console.log(chalk.red(`❌ Tool ${getToolDisplayName(toolName)} failed`));
        }
      },
      onPlanGenerated: plan => {
        console.log(chalk.blue(`📋 Plan: ${plan.understanding}`));
        if (plan.tasks && plan.tasks.length > 0) {
          console.log(chalk.gray(`   ${plan.tasks.length} tasks planned`));
        }
      },
      onGapAnalysis: analysis => {
        console.log(chalk.yellow(`🔍 Analysis: ${analysis.action}`));
      },
      onTaskQueueUpdate: taskInfo => {
        if (taskInfo.currentTask) {
          console.log(chalk.blue(`⚡ Task: ${taskInfo.currentTask.description}`));
          if (taskInfo.remainingTasks > 0) {
            console.log(chalk.gray(`   (${taskInfo.remainingTasks} remaining)`));
          }
        }
      },
      onComplete: result => {
        // Optional completion callback - can be used for final processing
        // The main result is returned by chatWithStreaming anyway
      },
    };
  }

  createDecisionContext() {
    const availableTools = this.mcpClient.getAvailableTools();
    const conversationHistory = this.llmClient.getHistory();

    const sessionId = this.sessionId || `session_${Date.now()}_oneshot`;

    return new DecisionContext({
      llmClient: this.llmClient,
      tools: availableTools,
      sessionId,
      mcpClient: this.mcpClient,
      logger: this.logger,
      callbacks: this.createDecisionCallbacks(),
      maxIterations: 10,
      conversationHistory,
      maxReplans: 3,
      maxTasks: 8,
      tenantId: this.userInfo?.teamId ? createAdenOrgTenantId(this.userInfo.teamId) : null, // Use namespaced tenant ID
    });
  }

  async processMessage(message) {
    // Show conversation context before processing
    this.showConversationContext();

    const spinner = ora("Processing message...").start();
    const startTime = Date.now();

    try {
      // Check connection health
      if (!this.isConnected) {
        console.log(chalk.yellow("⚠️  Reconnecting to server..."));
        await this.connect();
      }

      // Use the exact same approach as API server: chatWithStreaming with callbacks
      const callbacks = this.createDecisionCallbacks();
      const response = await this.llmClient.chatWithStreaming(
        message,
        this.mcpClient,
        this.logger,
        callbacks
      );

      spinner.stop();

      const responseTime = Date.now() - startTime;

      // LOG: Tool call analysis
      if (response.toolCalls && response.toolCalls.length > 0) {
        console.log(chalk.green(`\n✅ Used ${response.toolCalls.length} tool calls`));
        const uniqueTools = [...new Set(response.toolCalls.map(tc => tc.name))];
        console.log(
          chalk.cyan(`   Tools: ${uniqueTools.map(t => getToolDisplayName(t)).join(", ")}`)
        );
      } else {
        console.log(chalk.yellow("\n📝 Completed without tool usage"));
      }

      console.log(chalk.green("\n🤖 Aden:"));
      console.log(this.formatResponse(response.response));

      // Display data onboarding results if available
      if (response.dataOnboardingResults) {
        this.displayDataOnboardingResults(response.dataOnboardingResults);
      }

      // Check if response contains selectable options
      const hasOptions = await this.handleSelectableOptions(response.response);

      // Show meaningful tool usage summary
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.showToolUsageSummary(response.toolCalls);
      }

      if (!hasOptions) {
        console.log(); // Empty line for spacing only if no options were shown
      }

      // Calculate total tokens used across all API calls in this interaction
      const totalTokensUsed = this.calculateTotalTokens(response);

      // Log this interaction
      await this.logger.logInteraction(
        message,
        response.response,
        response.toolCalls || [],
        response.rawPrompts || [],
        {
          responseTime,
          tokensUsed: totalTokensUsed,
          toolCallsCount: response.toolCalls?.length || 0,
          error: null,
        }
      );
    } catch (error) {
      if (spinner.isSpinning) {
        spinner.stop();
      }
      console.log(chalk.red(`\n❌ Error: ${error.message}`));
      console.log(chalk.yellow('You can try again or type "/help" for commands.\n'));

      // Log error interaction
      await this.logger.logInteraction(message, `Error: ${error.message}`, [], [], {
        responseTime: Date.now() - startTime,
        error: error.message,
      });
    }
  }

  async handleCommand(command) {
    const [cmd] = command.split(" ");

    switch (cmd) {
      case "/help":
        this.showHelp();
        break;

      case "/quit":
      case "/exit":
        this.conversationActive = false;
        console.log(chalk.yellow("\n👋 Goodbye!"));
        await this.logger.endSession();
        await this.disconnect();
        break;

      case "/status":
        await this.showStatus();
        break;

      case "/context":
        this.showDetailedConversationContext();
        break;

      case "/clear":
        await this.confirmAndClearHistory();
        break;

      case "/logs":
        await this.showLogs(command);
        break;

      case "/sessions":
        await this.showSessions();
        break;

      case "/stats":
        await this.showLogStats();
        break;

      case "/html":
        await this.generateHTML(command);
        break;

      case "/switch":
        await this.switchLLMProvider(command);
        break;

      case "/providers":
        this.showProviders();
        break;

      default:
        console.log(chalk.red(`Unknown command: ${cmd}. Type "/help" for available commands.`));
    }
  }

  showConversationContext() {
    if (!this.llmClient) return;

    const stats = this.llmClient.getStats();
    const history = this.llmClient.getHistory();

    if (stats.totalMessages === 0) {
      console.log(chalk.gray("💭 Context: Starting new conversation"));
      return;
    }

    const userMessages = stats.userMessages;
    const assistantMessages = stats.assistantMessages;

    // Show last few topics/exchanges
    const recentHistory = history.slice(-6); // Last 6 messages (3 exchanges)
    let contextSummary = "";

    if (recentHistory.length > 0) {
      const recentTopics = recentHistory
        .filter(msg => msg.role === "user")
        .map(msg => {
          const content =
            typeof msg.content === "string"
              ? msg.content
              : msg.content.map(c => c.text || "").join(" ");
          return content.length > 40 ? content.slice(0, 40) + "..." : content;
        })
        .slice(-2); // Last 2 user messages

      if (recentTopics.length > 0) {
        contextSummary = ` | Recent: ${recentTopics.join(" → ")}`;
      }
    }

    console.log(chalk.gray(`💭 Context: ${userMessages} exchanges${contextSummary}`));
  }

  showDetailedConversationContext() {
    if (!this.llmClient) {
      console.log(chalk.yellow("📝 No conversation client available"));
      return;
    }

    const stats = this.llmClient.getStats();
    const history = this.llmClient.getHistory();

    console.log(chalk.blue("\n📖 Detailed Conversation Context:"));
    console.log(`  Total Messages: ${stats.totalMessages}`);
    console.log(`  User Messages: ${stats.userMessages}`);
    console.log(`  Assistant Messages: ${stats.assistantMessages}`);
    console.log(`  LLM Provider: ${stats.provider}`);
    console.log(`  Model: ${stats.model}`);

    if (history.length > 0) {
      console.log(chalk.blue("\n💬 Recent Conversation History:"));
      const recentHistory = history.slice(-10); // Last 10 messages

      recentHistory.forEach(msg => {
        const isUser = msg.role === "user";
        const prefix = isUser ? "👤" : "🤖";
        const color = isUser ? chalk.cyan : chalk.green;

        let content = "";
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content.map(c => c.text || c.type || "").join(" ");
        }

        const truncated = content.length > 100 ? content.slice(0, 100) + "..." : content;
        console.log(color(`  ${prefix} ${truncated}`));
      });
    } else {
      console.log(chalk.gray("  No conversation history yet"));
    }
    console.log();
  }

  async confirmAndClearHistory() {
    if (!this.llmClient) {
      console.log(chalk.yellow("📝 No conversation client available"));
      return;
    }

    const stats = this.llmClient.getStats();
    if (stats.totalMessages === 0) {
      console.log(chalk.gray("📝 No conversation history to clear"));
      return;
    }

    console.log(
      chalk.yellow(
        `\n⚠️  You are about to clear ${stats.totalMessages} messages from conversation history.`
      )
    );

    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "Are you sure you want to clear the conversation history?",
        default: false,
      },
    ]);

    if (confirmed) {
      this.llmClient.clearHistory();
      console.log(chalk.green("✅ Conversation history cleared"));
    } else {
      console.log(chalk.gray("Conversation history preserved"));
    }
  }

  showHelp() {
    console.log(chalk.blue("\n📚 Available Commands:"));
    console.log(chalk.gray("  /help        - Show this help message"));
    console.log(chalk.gray("  /status      - Show connection and system status"));
    console.log(chalk.gray("  /context     - Show current conversation context"));
    console.log(chalk.gray("  /clear       - Clear conversation history"));
    console.log(chalk.gray("  /logs        - Show recent logs"));
    console.log(chalk.gray("  /sessions    - Show conversation sessions"));
    console.log(chalk.gray("  /stats       - Show logging statistics"));
    console.log(chalk.gray("  /html        - Generate HTML reports"));
    console.log(chalk.gray("  /switch [provider] - Switch LLM provider (claude/openai/gemini)"));
    console.log(chalk.gray("  /providers   - Show available LLM providers"));
    console.log(chalk.gray("  /quit        - Exit the application"));
    console.log(chalk.blue("\nJust type your message to chat with Aden!"));

    if (this.userInfo) {
      console.log(
        chalk.green(
          `\n🔐 Authenticated as: ${this.userInfo.userId} (team: ${this.userInfo.teamId})`
        )
      );
      console.log(
        chalk.gray("Memory features are available - Aden can remember team context across sessions")
      );
    } else {
      console.log(chalk.yellow("\n⚠️  Not authenticated - Memory features unavailable"));
      console.log(chalk.gray("Use 'aden-client auth' to set up authentication for team memory"));
    }
    console.log();
  }

  async showStatus() {
    const health = await this.mcpClient.healthCheck();
    const stats = this.llmClient.getStats();

    console.log(chalk.blue("\n📊 System Status:"));
    console.log(
      `  MCP Server: ${health.healthy ? chalk.green("Connected") : chalk.red("Disconnected")}`
    );
    console.log(`  Tools Available: ${health.toolCount || 0}`);
    console.log(`  LLM Provider: ${stats.provider}`);
    console.log(`  Model: ${stats.model}`);
    console.log(`  Conversation Messages: ${stats.totalMessages}`);
    console.log(
      `  Logging: ${this.logger.enabled ? chalk.green("Enabled") : chalk.red("Disabled")}`
    );

    if (this.userInfo) {
      console.log(`  User: ${this.userInfo.userId} (Team: ${this.userInfo.teamId})`);
      console.log(`  Memory: ${chalk.green("Available")}`);
    } else {
      console.log(`  Authentication: ${chalk.yellow("Not configured")}`);
      console.log(`  Memory: ${chalk.red("Unavailable")}`);
    }
    console.log();
  }

  async showLogs(command) {
    if (!this.logger.enabled) {
      console.log(chalk.yellow("📝 Logging is disabled. Enable it in configuration to view logs."));
      return;
    }

    const parts = command.split(" ");
    const sessionId = parts[1];

    if (sessionId) {
      // Show specific session details
      const session = await this.logger.getSessionDetails(sessionId);
      if (!session) {
        console.log(chalk.red(`❌ Session ${sessionId} not found.`));
        return;
      }

      console.log(chalk.blue(`\n📋 Session Details: ${sessionId}`));
      console.log(`  Start Time: ${new Date(session.startTime).toLocaleString()}`);
      console.log(
        `  End Time: ${session.endTime ? new Date(session.endTime).toLocaleString() : "Active"}`
      );
      console.log(
        `  Duration: ${session.duration ? Math.round(session.duration / 1000) + "s" : "N/A"}`
      );
      console.log(`  Interactions: ${session.stats.totalInteractions}`);
      console.log(`  Tool Calls: ${session.stats.totalToolCalls}`);
      console.log(`  Tokens Used: ${session.stats.totalTokensUsed}`);

      console.log(chalk.blue("\n💬 Recent Interactions:"));
      const recentInteractions = session.interactions.slice(-5);
      recentInteractions.forEach((interaction, index) => {
        console.log(
          chalk.cyan(`\n  ${index + 1}. ${new Date(interaction.timestamp).toLocaleTimeString()}`)
        );
        console.log(
          `     User: ${interaction.userMessage.slice(0, 100)}${
            interaction.userMessage.length > 100 ? "..." : ""
          }`
        );
        console.log(
          `     Response: ${interaction.systemResponse.slice(0, 100)}${
            interaction.systemResponse.length > 100 ? "..." : ""
          }`
        );
        if (interaction.toolCalls.length > 0) {
          const toolDisplayNames = interaction.toolCalls.map(tc => getToolDisplayName(tc.name));
          console.log(chalk.gray(`     Tools: ${toolDisplayNames.join(", ")}`));
        }
      });
    } else {
      // Show recent sessions
      const sessions = await this.logger.getSessionLogs();
      const recentSessions = sessions.slice(0, 10);

      console.log(chalk.blue("\n📚 Recent Sessions:"));
      if (recentSessions.length === 0) {
        console.log(chalk.gray("  No sessions found."));
        return;
      }

      recentSessions.forEach((session, index) => {
        const startTime = new Date(session.startTime).toLocaleString();
        const duration = session.duration ? Math.round(session.duration / 1000) + "s" : "Active";
        console.log(chalk.cyan(`\n  ${index + 1}. ${session.sessionId}`));
        console.log(`     Time: ${startTime} (${duration})`);
        console.log(
          `     Interactions: ${session.stats.totalInteractions}, Tools: ${session.stats.totalToolCalls}`
        );
      });

      console.log(chalk.gray('\nUse "/logs <sessionId>" to view detailed session logs.'));
    }
    console.log();
  }

  async showSessions() {
    if (!this.logger.enabled) {
      console.log(
        chalk.yellow("📝 Logging is disabled. Enable it in configuration to view sessions.")
      );
      return;
    }

    const sessions = await this.logger.getSessionLogs();

    console.log(chalk.blue("\n📖 All Sessions:"));
    if (sessions.length === 0) {
      console.log(chalk.gray("  No sessions found."));
      return;
    }

    sessions.forEach((session, index) => {
      const startTime = new Date(session.startTime).toLocaleString();
      const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : "Active";
      const duration = session.duration ? Math.round(session.duration / 1000) + "s" : "N/A";

      console.log(chalk.cyan(`\n  ${index + 1}. ${session.sessionId}`));
      console.log(`     Start: ${startTime}`);
      console.log(`     End: ${endTime}`);
      console.log(`     Duration: ${duration}`);
      console.log(`     Type: ${session.metadata.type || "unknown"}`);
      console.log(`     LLM: ${session.metadata.llmProvider || "unknown"}`);
      console.log(`     Interactions: ${session.stats.totalInteractions}`);
      console.log(`     Tool Calls: ${session.stats.totalToolCalls}`);
      console.log(`     Tokens: ${session.stats.totalTokensUsed}`);
    });
    console.log();
  }

  async showLogStats() {
    if (!this.logger.enabled) {
      console.log(
        chalk.yellow("📝 Logging is disabled. Enable it in configuration to view statistics.")
      );
      return;
    }

    const stats = await this.logger.getStatistics();

    console.log(chalk.blue("\n📊 Logging Statistics:"));
    console.log(`  Total Sessions: ${stats.totalSessions}`);
    console.log(`  Total Interactions: ${stats.totalInteractions}`);
    console.log(`  Total Tool Calls: ${stats.totalToolCalls}`);
    console.log(`  Total Prompts: ${stats.totalPrompts}`);
    console.log(`  Total Tokens Used: ${stats.totalTokensUsed.toLocaleString()}`);
    console.log(`  Avg Interactions/Session: ${stats.averageInteractionsPerSession.toFixed(1)}`);

    if (stats.dateRange) {
      console.log(
        `  Date Range: ${new Date(stats.dateRange.earliest).toLocaleDateString()} - ${new Date(
          stats.dateRange.latest
        ).toLocaleDateString()}`
      );
    }
    console.log();
  }

  async generateHTML(command) {
    if (!this.logger.enabled) {
      console.log(
        chalk.yellow("📝 Logging is disabled. Enable it in configuration to generate HTML.")
      );
      return;
    }

    if (!this.logger.htmlEnabled) {
      console.log(
        chalk.yellow("📄 HTML reporting is disabled. Enable it in configuration to generate HTML.")
      );
      return;
    }

    const parts = command.split(" ");
    const sessionId = parts[1];

    try {
      if (sessionId) {
        // Generate HTML for specific session
        console.log(chalk.blue(`\n📄 Generating HTML report for session ${sessionId}...`));
        const htmlPath = await this.logger.generateHTMLReport(sessionId);
        console.log(chalk.green(`✅ HTML report generated: ${htmlPath}`));
      } else {
        // Generate HTML for all sessions
        console.log(chalk.blue("\n📄 Generating HTML reports for all sessions..."));
        const results = await this.logger.generateHTMLReports();

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(chalk.green(`✅ Generated ${successful.length} HTML reports`));

        if (failed.length > 0) {
          console.log(chalk.yellow(`⚠️  Failed to generate ${failed.length} reports:`));
          failed.forEach(result => {
            console.log(chalk.red(`  - ${result.sessionId}: ${result.error}`));
          });
        }

        if (successful.length > 0) {
          console.log(chalk.gray("\nGenerated files:"));
          successful.slice(0, 5).forEach(result => {
            console.log(chalk.gray(`  - ${result.htmlPath}`));
          });
          if (successful.length > 5) {
            console.log(chalk.gray(`  ... and ${successful.length - 5} more files`));
          }
        }
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error generating HTML: ${error.message}`));
    }

    console.log();
  }

  async handleSelectableOptions(responseText) {
    // Only detect options in specific contexts to avoid false positives
    let options = [];

    // Pattern 1: Look for explicit option sections after "Would you like me to:" or similar
    const explicitOptionPattern =
      /(?:Would you like me to|Choose an option|Select from|Options?):?\s*\n((?:\d+\.\s+.+\n?)+)/gi;
    let explicitMatch = explicitOptionPattern.exec(responseText);

    if (explicitMatch) {
      const optionText = explicitMatch[1];
      const optionMatches = [...optionText.matchAll(/^(\d+\.\s+(.+))$/gm)];
      if (optionMatches.length >= 2) {
        options = optionMatches.map((match, index) => ({
          index: index + 1,
          text: match[2].trim(),
          original: match[1],
        }));
      }
    }

    // Pattern 2: Look for recommendation sections at the end
    if (options.length === 0) {
      const recommendationPattern =
        /(?:Recommendations?|Next steps?|You can):?\s*\n((?:\d+\.\s+.+\n?)+)$/gim;
      let recMatch = recommendationPattern.exec(responseText);

      if (recMatch) {
        const recText = recMatch[1];
        const recMatches = [...recText.matchAll(/^(\d+\.\s+(.+))$/gm)];
        if (recMatches.length >= 2 && recMatches.length <= 5) {
          // Reasonable number of options
          options = recMatches.map((match, index) => ({
            index: index + 1,
            text: match[2].trim(),
            original: match[1],
          }));
        }
      }
    }

    // Pattern 3: Look for question with numbered options at the very end
    if (options.length === 0) {
      const questionPattern = /Would you like me to:\s*\n((?:\d+\.\s+.+(?:\?|!)?$\n?)+)$/gim;
      let questionMatch = questionPattern.exec(responseText);

      if (questionMatch) {
        const questionText = questionMatch[1];
        const questionMatches = [...questionText.matchAll(/^(\d+\.\s+(.+))$/gm)];
        if (questionMatches.length >= 2) {
          options = questionMatches.map((match, index) => ({
            index: index + 1,
            text: match[2].trim(),
            original: match[1],
          }));
        }
      }
    }

    if (options.length === 0) return false;

    // Display options for selection with better formatting
    console.log(chalk.yellow("\n🎯 Available options:"));
    options.forEach(option => {
      console.log(chalk.cyan(`  ${option.index}. ${option.text}`));
    });
    console.log(chalk.gray("  0. Continue without selection"));

    try {
      const { choice } = await inquirer.prompt([
        {
          type: "input",
          name: "choice",
          message: "Enter your choice (number):",
          validate: input => {
            const num = parseInt(input);
            if (isNaN(num) || num < 0 || num > options.length) {
              return `Please enter a number between 0 and ${options.length}`;
            }
            return true;
          },
        },
      ]);

      const selectedIndex = parseInt(choice);
      if (selectedIndex === 0) {
        console.log(chalk.gray("Continuing without selection...\n"));
        return true;
      }

      const selectedOption = options[selectedIndex - 1];
      console.log(chalk.green(`✅ Selected: ${selectedOption.text}\n`));

      // Process the selected option as a new message
      await this.processMessage(selectedOption.text);
      return true;
    } catch (error) {
      console.log(chalk.red(`Selection error: ${error.message}\n`));
      return false;
    }
  }

  showToolUsageSummary(toolCalls) {
    const toolSummary = toolCalls
      .map(tool => {
        const displayName = getToolDisplayName(tool.name);
        return displayName;
      })
      .join(", ");

    console.log(chalk.blue(`\n🔧 Tools used: ${toolSummary}`));
  }

  formatResponse(text) {
    if (!this.config.get("cli.colorOutput")) {
      return text;
    }

    // Enhanced formatting for better readability
    return text
      .replace(/^(Step \d+:.*?)$/gm, chalk.bold.blue("$1"))
      .replace(/^(- \[.*?\].*?)$/gm, chalk.cyan("$1"))
      .replace(/^(🧠 \*\*Thinking Process:\*\*)/gm, chalk.bold.magenta("$1"))
      .replace(/^(📋 \*\*Research Plan:\*\*)/gm, chalk.bold.cyan("$1"))
      .replace(/^(🔧 \*\*Task Execution.*?:\*\*)/gm, chalk.bold.green("$1"))
      .replace(/^(📊 \*\*Current Status:\*\*)/gm, chalk.bold.yellow("$1"))
      .replace(/^(\*\*Task \d+ Complete:\*\*)/gm, chalk.bold.green("$1"));
  }

  displayDataOnboardingResults(results) {
    if (!results) return;

    console.log(chalk.bold.cyan("\n📊 Data Onboarding Results:"));
    
    // Display mapping specification
    if (results.mappingSpecification) {
      console.log(chalk.cyan("\n📋 Mapping Specification:"));
      console.log(chalk.gray("  " + (results.mappingSpecification.description || "No description available")));
    }

    // Display column mappings
    if (results.columnMappings && Object.keys(results.columnMappings).length > 0) {
      console.log(chalk.cyan("\n🔗 Column Mappings:"));
      for (const [table, mappings] of Object.entries(results.columnMappings)) {
        console.log(chalk.yellow(`\n  Table: ${table}`));
        if (mappings.columns && mappings.columns.length > 0) {
          mappings.columns.forEach(mapping => {
            console.log(chalk.gray(`    ${mapping.sourceColumn} → ${mapping.targetColumn} (${mapping.dataType})`));
          });
        }
      }
    }

    // Display relationships
    if (results.relationships && results.relationships.length > 0) {
      console.log(chalk.cyan("\n🔑 Relationships:"));
      results.relationships.forEach(rel => {
        console.log(chalk.gray(`  ${rel.type}: ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn}`));
      });
    }

    // Display metadata
    if (results.metadata) {
      console.log(chalk.cyan("\n📈 Summary:"));
      console.log(chalk.gray(`  Files analyzed: ${results.metadata.filesAnalyzed}`));
      console.log(chalk.gray(`  Tables mapped: ${results.metadata.tablesTargeted}`));
      console.log(chalk.gray(`  Relationships found: ${results.metadata.relationshipsIdentified}`));
      if (results.metadata.validationScore) {
        console.log(chalk.gray(`  Validation score: ${results.metadata.validationScore}%`));
      }
    }

    console.log(); // Empty line for spacing
  }

  // One-shot methods using DecisionExecutor
  async runOneShot(message) {
    let connected = false;
    let originalLLMClient = null;
    const forceExitTimer = setTimeout(() => {
      console.log("\nForce exit due to timeout");
      process.exit(0);
    }, 300000); // Increased force exit timeout

    try {
      await this.connect();
      connected = true;

      // Temporarily switch to Claude for more reliable tool calling in ask commands
      // DISABLED: Force ask mode to use Gemini for benchmarking
      /*
      const currentProvider = this.config.getCurrentLLMConfig().provider;
      if (currentProvider === 'gemini') {
        console.log(chalk.yellow("🔄 Temporarily switching to Claude for more reliable ask command execution..."));
        originalLLMClient = this.llmClient;
        
        const claudeConfig = this.config.getLLMConfig().claude;
        if (claudeConfig && claudeConfig.apiKey) {
          const { LLMFactory } = await import("./llm/llm-factory.js");
          this.llmClient = await LLMFactory.create('claude', {
            model: claudeConfig.model,
            maxTokens: claudeConfig.maxTokens,
            temperature: claudeConfig.temperature,
          }, {
            apiKey: claudeConfig.apiKey,
          });
        }
      }
      */

      // Generate sessionId for one-shot mode (same as API server approach)
      const sessionId = `session_${Date.now()}_oneshot`;

      // Set sessionId in LLM client (required by chatWithStreaming)
      this.llmClient.sessionId = sessionId;

      // Start logging session for one-shot
      await this.logger.startSession({
        type: "one-shot",
        llmProvider: this.llmClient.getProviderName(),
        mcpServerPath: this.config.getMCPConfig().serverPath,
        userId: this.userInfo?.userId,
        teamId: this.userInfo?.teamId,
        sessionId: sessionId,
      });

      const spinner = ora("Processing message...").start();
      const startTime = Date.now();

      // Use the exact same approach as API server: chatWithStreaming with callbacks
      const callbacks = this.createDecisionCallbacks();
      const response = await this.llmClient.chatWithStreaming(
        message,
        this.mcpClient,
        this.logger,
        callbacks
      );

      spinner.stop();
      const responseTime = Date.now() - startTime;

      console.log(chalk.green("\n🤖 Aden:"));
      console.log(this.formatResponse(response.response));

      // Show tool usage summary for one-shot commands too
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.showToolUsageSummary(response.toolCalls);
      }

      // Log the interaction
      await this.logger.logInteraction(
        message,
        response.response,
        response.toolCalls || [],
        response.rawPrompts || [],
        {
          responseTime,
          tokensUsed: this.calculateTotalTokens(response),
          toolCallsCount: response.toolCalls?.length || 0,
          error: null,
        }
      );
    } catch (error) {
      console.error(`Error: ${error.message}`);
    } finally {
      clearTimeout(forceExitTimer);

      // Restore original LLM client if we switched
      // DISABLED: No switching occurring
      /*
      if (originalLLMClient) {
        this.llmClient = originalLLMClient;
      }
      */

      // End logging session
      await this.logger.endSession();

      if (connected) {
        try {
          await Promise.race([
            this.disconnect(),
            new Promise(resolve => setTimeout(resolve, 2000)),
          ]);
        } catch (e) {
          console.error("Disconnect error:", e.message);
        }
      }

      process.exit(0);
    }
  }

  async runThinking(problem) {
    let connected = false;
    const forceExitTimer = setTimeout(() => process.exit(0), 15000);

    try {
      await this.connect();
      connected = true;

      const result = await this.mcpClient.thinkSequentially(problem);
      console.log(result.text);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    } finally {
      clearTimeout(forceExitTimer);
      if (connected) {
        await this.disconnect().catch(() => {});
      }
      process.exit(0);
    }
  }

  async runPlanning(objective) {
    let connected = false;
    const forceExitTimer = setTimeout(() => process.exit(0), 15000);

    try {
      await this.connect();
      connected = true;

      const result = await this.mcpClient.planTasks(objective);
      console.log(result.text);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    } finally {
      clearTimeout(forceExitTimer);
      if (connected) {
        await this.disconnect().catch(() => {});
      }
      process.exit(0);
    }
  }

  /**
   * Calculate total tokens used across all API calls in a response
   * Handles both Claude and OpenAI API response formats
   */
  calculateTotalTokens(response) {
    let totalTokens = 0;

    // Add tokens from the main response usage (initial API call)
    if (response.usage) {
      if (response.usage.total_tokens) {
        // OpenAI format
        totalTokens += response.usage.total_tokens;
      } else if (
        response.usage.input_tokens !== undefined &&
        response.usage.output_tokens !== undefined
      ) {
        // Claude format
        totalTokens += response.usage.input_tokens + response.usage.output_tokens;
      }
    }

    // Add tokens from all raw prompts (follow-up API calls)
    if (response.rawPrompts && Array.isArray(response.rawPrompts)) {
      response.rawPrompts.forEach(prompt => {
        if (prompt.response && prompt.response.usage) {
          const usage = prompt.response.usage;
          if (usage.total_tokens) {
            // OpenAI format
            totalTokens += usage.total_tokens;
          } else if (usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
            // Claude format
            totalTokens += usage.input_tokens + usage.output_tokens;
          }
        }
      });
    }

    return totalTokens;
  }

  // LLM Provider management methods
  async switchLLMProvider(command) {
    const parts = command.split(" ");
    const targetProvider = parts[1];

    if (!targetProvider) {
      // Interactive provider selection
      const availableProviders = ["claude", "openai", "gemini"];
      const currentProvider = this.config.getCurrentLLMConfig().provider;

      const { provider } = await inquirer.prompt([
        {
          type: "list",
          name: "provider",
          message: "Choose LLM provider:",
          choices: availableProviders.map(p => ({
            name: `${p.charAt(0).toUpperCase() + p.slice(1)} ${
              p === currentProvider ? "(current)" : ""
            }`,
            value: p,
          })),
          default: currentProvider,
        },
      ]);

      if (provider === currentProvider) {
        console.log(chalk.yellow(`Already using ${provider}. No change needed.`));
        return;
      }

      await this.performProviderSwitch(provider);
    } else {
      // Direct provider switch
      const validProviders = ["claude", "openai", "gemini"];
      if (!validProviders.includes(targetProvider)) {
        console.log(chalk.red(`❌ Invalid provider: ${targetProvider}`));
        console.log(chalk.gray(`Valid providers: ${validProviders.join(", ")}`));
        return;
      }

      const currentProvider = this.config.getCurrentLLMConfig().provider;
      if (targetProvider === currentProvider) {
        console.log(chalk.yellow(`Already using ${targetProvider}. No change needed.`));
        return;
      }

      await this.performProviderSwitch(targetProvider);
    }
  }

  async performProviderSwitch(newProvider) {
    const spinner = ora(`Switching to ${newProvider}...`).start();

    try {
      // Update configuration
      const success = this.config.setLLMProvider(newProvider);
      if (!success) {
        throw new Error("Failed to save configuration");
      }

      // Validate new provider configuration
      const validation = this.config.validate();
      if (!validation.isValid) {
        spinner.fail(`Provider switch failed: ${validation.errors[0]}`);
        console.log(chalk.yellow("Configure API key first using 'aden-client config'"));
        return;
      }

      // Disconnect current MCP client
      if (this.isConnected) {
        await this.disconnect();
      }

      // Reinitialize with new provider
      const llmConfig = this.config.getCurrentLLMConfig();
      const { LLMFactory } = await import("./llm/llm-factory.js");

      this.llmClient = await LLMFactory.create(
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

      // Reconnect MCP client
      await this.connect();

      spinner.succeed(`Switched to ${newProvider} (${llmConfig.model})`);

      // Show provider capabilities
      this.showProviderInfo(newProvider);
    } catch (error) {
      spinner.fail(`Failed to switch provider: ${error.message}`);
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }
  }

  showProviders() {
    const currentProvider = this.config.getCurrentLLMConfig().provider;
    const llmConfig = this.config.getLLMConfig();

    console.log(chalk.blue("\n🔧 Available LLM Providers:"));

    const providers = [
      {
        name: "claude",
        display: "Claude (Anthropic)",
        capabilities: ["Intelligent Analytics", "Long Context", "Vision", "Function Calling"],
        models: [
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",
        ],
      },
      {
        name: "openai",
        display: "OpenAI GPT-4",
        capabilities: ["Function Calling", "Vision", "Code Execution", "Creative Writing"],
        models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4"],
      },
      {
        name: "gemini",
        display: "Gemini (Google)",
        capabilities: [
          "Ultra Long Context (2M+)",
          "Multi-modal",
          "Fast Processing",
          "Code Generation",
        ],
        models: [
          "gemini-2.5-pro",
          "gemini-2.5-flash",
          "gemini-1.5-pro",
          "gemini-1.5-flash",
          "gemini-pro",
        ],
      },
    ];

    providers.forEach(provider => {
      const isCurrent = provider.name === currentProvider;
      const hasApiKey = llmConfig[provider.name]?.apiKey ? true : false;
      const statusColor = isCurrent ? chalk.green : hasApiKey ? chalk.blue : chalk.gray;
      const statusText = isCurrent ? "(current)" : hasApiKey ? "(configured)" : "(needs API key)";

      console.log(statusColor(`\n  ${provider.display} ${statusText}`));
      console.log(chalk.gray(`    Current model: ${llmConfig[provider.name]?.model || "default"}`));
      console.log(chalk.gray(`    Capabilities: ${provider.capabilities.join(", ")}`));
      console.log(chalk.gray(`    Available models: ${provider.models.join(", ")}`));
    });

    console.log(chalk.blue(`\n💡 Use '/switch [provider]' to change providers`));
    console.log(chalk.gray(`   Example: /switch gemini`));
    console.log();
  }

  showProviderInfo(providerName) {
    const config = this.config.getCurrentLLMConfig();

    console.log(
      chalk.blue(
        `\n🔧 ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Configuration:`
      )
    );
    console.log(`  Model: ${config.model}`);
    console.log(`  Max Tokens: ${config.maxTokens}`);
    console.log(`  Temperature: ${config.temperature}`);

    if (this.llmClient && this.llmClient.capabilities) {
      const capabilities = this.llmClient.capabilities;
      console.log(
        `  Context Length: ${capabilities.maxContextLength?.toLocaleString() || "Unknown"} tokens`
      );
      console.log(`  Streaming: ${capabilities.streaming ? "✅" : "❌"}`);
      console.log(`  Function Calling: ${capabilities.functionCalling ? "✅" : "❌"}`);
      console.log(`  Vision: ${capabilities.vision ? "✅" : "❌"}`);
    }
    console.log();
  }
}

// CLI Program Setup
const program = new Command();

program
  .name("aden-client")
  .description("Command line client for Aden MCP Server with Claude API")
  .version("1.0.0");

program
  .command("chat")
  .description("Start interactive chat session")
  .option("-t, --token <jwt>", "JWT token for authentication")
  .action(async options => {
    const cli = new AdenCLI();
    if (options.token) {
      cli.config.setJWTToken(options.token);
    }
    await cli.initialize();
    await cli.startInteractiveChat();
  });

program
  .command("ask")
  .description("Ask a one-time question")
  .argument("<message>", "message to send")
  .option("-t, --token <jwt>", "JWT token for authentication")
  .action(async (message, options) => {
    try {
      const cli = new AdenCLI();
      if (options.token) {
        cli.config.setJWTToken(options.token);
      }
      await cli.initialize();
      await cli.runOneShot(message);
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("think")
  .description("Think through a problem sequentially")
  .argument("<problem>", "problem to analyze")
  .option("-t, --token <jwt>", "JWT token for authentication")
  .action(async (problem, options) => {
    try {
      const cli = new AdenCLI();
      if (options.token) {
        cli.config.setJWTToken(options.token);
      }
      await cli.initialize();
      await cli.runThinking(problem);
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("plan")
  .description("Create a task plan for an objective")
  .argument("<objective>", "objective to plan for")
  .option("-t, --token <jwt>", "JWT token for authentication")
  .action(async (objective, options) => {
    try {
      const cli = new AdenCLI();
      if (options.token) {
        cli.config.setJWTToken(options.token);
      }
      await cli.initialize();
      await cli.runPlanning(objective);
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Configure the client")
  .action(async () => {
    const config = new Config();
    await config.setupInteractive();
  });

program
  .command("init")
  .description("Initialize client configuration")
  .action(async () => {
    const config = new Config();
    config.createEnvFile();
    await config.setupInteractive();
  });

program
  .command("auth")
  .description("Set authentication credentials")
  .option("-t, --token <jwt>", "JWT token for authentication")
  .option("-h, --host <url>", "Aden API host URL")
  .action(async options => {
    const config = new Config();

    if (options.token) {
      try {
        // Test the JWT token by parsing it
        const userInfo = await parseJWTToken(options.token, options.host);
        config.setJWTToken(options.token);
        if (options.host) {
          config.setAdenHost(options.host);
        }
        console.log(
          chalk.green(
            `✅ Authentication configured for user ${userInfo.userId} (team: ${userInfo.teamId})`
          )
        );
      } catch (error) {
        console.error(chalk.red(`❌ Invalid JWT token: ${error.message}`));
        process.exit(1);
      }
    } else {
      // Interactive token setup
      const { token, host } = await inquirer.prompt([
        {
          type: "password",
          name: "token",
          message: "Enter your Aden JWT token:",
          validate: input => input.length > 0 || "JWT token is required",
        },
        {
          type: "input",
          name: "host",
          message: "Aden API host URL:",
          default: "https://your-api-host.com",
        },
      ]);

      try {
        const userInfo = await parseJWTToken(token, host);
        config.setJWTToken(token);
        config.setAdenHost(host);
        console.log(
          chalk.green(
            `✅ Authentication configured for user ${userInfo.userId} (team: ${userInfo.teamId})`
          )
        );
      } catch (error) {
        console.error(chalk.red(`❌ Invalid JWT token: ${error.message}`));
        process.exit(1);
      }
    }
  });

program
  .command("provider")
  .description("Switch LLM provider or show current provider")
  .option("-s, --set <provider>", "Set LLM provider (claude or openai)")
  .option("-l, --list", "List available providers")
  .action(async options => {
    const config = new Config();

    if (options.list) {
      console.log("Available LLM providers:");
      console.log("  • claude (Anthropic)");
      console.log("  • openai (OpenAI)");
      return;
    }

    if (options.set) {
      try {
        config.setLLMProvider(options.set);
        console.log(`✅ LLM provider set to: ${options.set}`);
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    } else {
      const currentConfig = config.getCurrentLLMConfig();
      console.log(`Current LLM provider: ${currentConfig.provider}`);
      console.log(`Model: ${currentConfig.model}`);
    }
  });

program
  .command("logs")
  .description("View conversation logs and sessions")
  .option("-s, --sessions", "Show all sessions")
  .option("-t, --stats", "Show logging statistics")
  .option("-d, --details <sessionId>", "Show details for specific session")
  .action(async options => {
    const cli = new AdenCLI();

    if (options.sessions) {
      await cli.showSessions();
    } else if (options.stats) {
      await cli.showLogStats();
    } else if (options.details) {
      await cli.showLogs(`/logs ${options.details}`);
    } else {
      await cli.showLogs("/logs");
    }
  });

program
  .command("html")
  .description("Generate HTML reports from conversation logs")
  .option("-a, --all", "Generate HTML for all sessions")
  .option("-s, --session <sessionId>", "Generate HTML for specific session")
  .action(async options => {
    const cli = new AdenCLI();

    if (options.session) {
      await cli.generateHTML(`/html ${options.session}`);
    } else {
      await cli.generateHTML("/html");
    }
  });

// Default to interactive chat if no command specified
if (process.argv.length === 2) {
  (async () => {
    const cli = new AdenCLI();
    await cli.initialize();
    await cli.startInteractiveChat();
  })();
} else {
  program.parse();
}
