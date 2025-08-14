#!/usr/bin/env node

/**
 * Example usage of the Aden MCP Client
 * This demonstrates various ways to use the client programmatically
 */

import { AdenMCPClient } from "../src/mcp-client.js";
import { ClaudeClient } from "../src/claude-client.js";
import { Config } from "../src/config.js";

async function exampleBasicConnection() {
  console.log("🔌 Example 1: Basic MCP Connection\n");

  const mcpClient = new AdenMCPClient("../src/index.js");

  try {
    await mcpClient.connect();
    console.log("✅ Connected to MCP server");

    const tools = mcpClient.getAvailableTools();
    console.log(`🔧 Available tools: ${tools.map(t => t.name).join(", ")}`);

    await mcpClient.disconnect();
    console.log("🔌 Disconnected from MCP server");
  } catch (error) {
    console.error("❌ Connection failed:", error.message);
  }

  console.log("---\n");
}

async function exampleDirectToolUsage() {
  console.log("🔧 Example 2: Direct Tool Usage\n");

  const mcpClient = new AdenMCPClient("../src/index.js");

  try {
    await mcpClient.connect();

    // Sequential thinking
    console.log("🧠 Sequential thinking example...");
    const thinkingResult = await mcpClient.thinkSequentially(
      "How to implement a caching strategy for a web application"
    );
    console.log("Result:", thinkingResult.text.substring(0, 200) + "...\n");

    // Task planning
    console.log("📋 Task planning example...");
    const planResult = await mcpClient.planTasks("Set up automated testing for a Node.js project");
    console.log("Result:", planResult.text.substring(0, 200) + "...\n");

    // Task status
    console.log("📊 Getting task status...");
    const statusResult = await mcpClient.getTaskStatus();
    console.log("Status:", statusResult.text.substring(0, 150) + "...\n");

    await mcpClient.disconnect();
  } catch (error) {
    console.error("❌ Tool usage failed:", error.message);
  }

  console.log("---\n");
}

async function exampleClaudeIntegration() {
  console.log("🤖 Example 3: Claude Integration (requires API key)\n");

  const config = new Config();
  const claudeConfig = config.getClaudeConfig();

  if (!claudeConfig.apiKey) {
    console.log("⚠️  Skipping Claude integration example - no API key configured");
    console.log("   Set ANTHROPIC_API_KEY environment variable to try this example\n");
    console.log("---\n");
    return;
  }

  const mcpClient = new AdenMCPClient("../src/index.js");
  const claudeClient = new ClaudeClient(claudeConfig.apiKey, claudeConfig);

  try {
    await mcpClient.connect();

    console.log("💬 Asking Claude to use MCP tools...");
    const response = await claudeClient.chat(
      "Help me understand the benefits of microservices architecture. Please think through this systematically.",
      mcpClient
    );

    console.log("Claude Response:");
    console.log(response.response.substring(0, 300) + "...\n");

    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(
        `🔧 Claude used ${response.toolCalls.length} tools: ${response.toolCalls.map(t => t.name).join(", ")}\n`
      );
    }

    await mcpClient.disconnect();
  } catch (error) {
    console.error("❌ Claude integration failed:", error.message);
  }

  console.log("---\n");
}

async function exampleConversationFlow() {
  console.log("💭 Example 4: Multi-turn Conversation (requires API key)\n");

  const config = new Config();
  const claudeConfig = config.getClaudeConfig();

  if (!claudeConfig.apiKey) {
    console.log("⚠️  Skipping conversation example - no API key configured\n");
    console.log("---\n");
    return;
  }

  const mcpClient = new AdenMCPClient("../src/index.js");
  const claudeClient = new ClaudeClient(claudeConfig.apiKey, claudeConfig);

  try {
    await mcpClient.connect();

    console.log("🎯 Starting multi-turn conversation...\n");

    // First message - problem analysis
    console.log("User: I need to build a real-time chat application");
    const response1 = await claudeClient.chat(
      "I need to build a real-time chat application. Can you help me think through the requirements and create a plan?",
      mcpClient
    );
    console.log("Aden:", response1.response.substring(0, 200) + "...\n");

    // Follow-up message
    console.log("User: What about security considerations?");
    const response2 = await claudeClient.chat(
      "What about security considerations for the chat application?",
      mcpClient
    );
    console.log("Aden:", response2.response.substring(0, 200) + "...\n");

    // Show conversation stats
    const stats = claudeClient.getStats();
    console.log(
      `📊 Conversation stats: ${stats.totalMessages} messages, ${stats.userMessages} from user\n`
    );

    await mcpClient.disconnect();
  } catch (error) {
    console.error("❌ Conversation failed:", error.message);
  }

  console.log("---\n");
}

async function exampleConfigurationManagement() {
  console.log("⚙️  Example 5: Configuration Management\n");

  const config = new Config();

  // Show current configuration
  console.log("Current configuration:");
  const claudeConfig = config.getClaudeConfig();
  const mcpConfig = config.getMCPConfig();
  const cliConfig = config.getCLIConfig();

  console.log(`  Claude Model: ${claudeConfig.model}`);
  console.log(`  Max Tokens: ${claudeConfig.maxTokens}`);
  console.log(`  Temperature: ${claudeConfig.temperature}`);
  console.log(`  MCP Server Path: ${mcpConfig.serverPath}`);
  console.log(`  CLI Prompt: ${cliConfig.prompt}`);
  console.log(`  Color Output: ${cliConfig.colorOutput}\n`);

  // Validate configuration
  const validation = config.validate();
  console.log(`Configuration valid: ${validation.isValid ? "✅" : "❌"}`);
  if (!validation.isValid) {
    console.log("Issues:");
    validation.errors.forEach(error => console.log(`  - ${error}`));
  }
  console.log();

  // Export configuration (safe - no API key)
  const exportedConfig = config.export();
  console.log("Exported config (API key hidden):");
  console.log(JSON.stringify(exportedConfig, null, 2).substring(0, 200) + "...\n");

  console.log("---\n");
}

async function exampleErrorHandling() {
  console.log("🚨 Example 6: Error Handling\n");

  const mcpClient = new AdenMCPClient("../src/index.js");

  try {
    await mcpClient.connect();

    // Test invalid tool call
    console.log("Testing invalid tool call...");
    try {
      await mcpClient.callTool("nonexistent_tool", {});
    } catch (error) {
      console.log("✅ Caught expected error:", error.message);
    }

    // Test invalid task execution
    console.log("Testing invalid task execution...");
    try {
      await mcpClient.executeTask("invalid_task_id");
    } catch (error) {
      console.log("✅ Caught expected error:", error.message);
    }

    // Test health check
    console.log("Testing health check...");
    const health = await mcpClient.healthCheck();
    console.log(`Health check result: ${health.healthy ? "Healthy" : "Unhealthy"}`);
    if (!health.healthy) {
      console.log(`Reason: ${health.reason}`);
    }

    await mcpClient.disconnect();
  } catch (error) {
    console.error("❌ Error handling test failed:", error.message);
  }

  console.log("\n---\n");
}

async function exampleTaskExecution() {
  console.log("⚡ Example 7: Complete Task Execution Workflow\n");

  const mcpClient = new AdenMCPClient("../src/index.js");

  try {
    await mcpClient.connect();

    // Step 1: Create a task plan
    console.log("📋 Step 1: Creating task plan...");
    const planResult = await mcpClient.planTasks("Optimize database performance");
    console.log("Plan created:", planResult.text.split("\n")[0]);

    // Step 2: Get task status
    console.log("\n📊 Step 2: Getting initial task status...");
    const initialStatus = await mcpClient.getTaskStatus();
    console.log("Initial status:", initialStatus.text.split("\n")[0]);

    // Step 3: Execute first task (if any tasks were created)
    console.log("\n⚡ Step 3: Attempting to execute a task...");
    try {
      // Note: This might fail if no tasks were actually created or if task IDs are dynamic
      const executeResult = await mcpClient.executeTask("task_1");
      console.log("Execution result:", executeResult.text.substring(0, 100) + "...");
    } catch (error) {
      console.log("Task execution note:", error.message);
    }

    // Step 4: Final status check
    console.log("\n📊 Step 4: Final status check...");
    const finalStatus = await mcpClient.getTaskStatus();
    console.log("Final status:", finalStatus.text.split("\n")[0]);

    await mcpClient.disconnect();
  } catch (error) {
    console.error("❌ Task execution workflow failed:", error.message);
  }

  console.log("\n---\n");
}

// Main execution
async function runAllExamples() {
  console.log("🎯 Aden MCP Client - Usage Examples\n");
  console.log("=".repeat(50) + "\n");

  try {
    await exampleBasicConnection();
    await exampleDirectToolUsage();
    await exampleClaudeIntegration();
    await exampleConversationFlow();
    await exampleConfigurationManagement();
    await exampleErrorHandling();
    await exampleTaskExecution();

    console.log("🎉 All examples completed!\n");
    console.log("To use the client:");
    console.log("1. Set up your configuration: node src/cli.js config");
    console.log("2. Start interactive chat: node src/cli.js chat");
    console.log('3. Or use one-shot commands: node src/cli.js ask "your question"');
    console.log("\nFor more information, see the README.md file.");
  } catch (error) {
    console.error("❌ Error running examples:", error.message);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}
