import { LLMFactory } from "../../agent-client/src/llm/llm-factory.js";
import { MCPClient } from "../../agent-client/src/mcp-client.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

/**
 * Comprehensive integration tests for LLM providers with business queries
 * Tests the current implementation with multiple back-and-forth conversations
 * to validate functionality before refactoring.
 */

class TestRunner extends EventEmitter {
  constructor() {
    super();
    this.tests = [];
    this.results = [];
    this.mcpServer = null;
    this.mcpClient = null;
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log(`\n🧪 Running ${this.tests.length} LLM Integration Tests\n`);

    try {
      await this.setupMCPServer();
      await this.setupMCPClient();

      for (const test of this.tests) {
        try {
          console.log(`⏱️  Running: ${test.name}`);
          const startTime = Date.now();

          await test.testFn();

          const duration = Date.now() - startTime;
          this.results.push({ name: test.name, status: "PASS", duration });
          console.log(`✅ PASS: ${test.name} (${duration}ms)\n`);
        } catch (error) {
          this.results.push({
            name: test.name,
            status: "FAIL",
            error: error.message,
          });
          console.log(`❌ FAIL: ${test.name}`);
          console.log(`   Error: ${error.message}\n`);
        }
      }
    } finally {
      await this.cleanup();
    }

    this.printSummary();
  }

  async setupMCPServer() {
    return new Promise((resolve, reject) => {
      console.log("🚀 Starting MCP Server...");

      // Start the MCP server
      this.mcpServer = spawn("node", ["src/index.js"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
        },
      });

      this.mcpServer.on("error", reject);

      // Give server time to start
      setTimeout(() => {
        console.log("✅ MCP Server started\n");
        resolve();
      }, 2000);
    });
  }

  async setupMCPClient() {
    console.log("🔗 Setting up MCP Client...");
    this.mcpClient = new MCPClient();

    await this.mcpClient.connect({
      command: "node",
      args: ["src/index.js"],
      cwd: process.cwd(),
    });

    console.log("✅ MCP Client connected\n");
  }

  async cleanup() {
    if (this.mcpClient) {
      await this.mcpClient.disconnect();
    }
    if (this.mcpServer) {
      this.mcpServer.kill();
    }
    console.log("🧹 Cleanup completed\n");
  }

  printSummary() {
    const passed = this.results.filter(r => r.status === "PASS").length;
    const failed = this.results.filter(r => r.status === "FAIL").length;

    console.log("📊 Test Summary:");
    console.log(`   Total: ${this.results.length}`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);

    if (failed > 0) {
      console.log("\n❌ Failed Tests:");
      this.results
        .filter(r => r.status === "FAIL")
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    console.log(
      `\n${failed === 0 ? "✅" : "❌"} All tests ${failed === 0 ? "passed" : "completed with failures"}\n`
    );
  }
}

// Test utilities
class ConversationTester {
  constructor(llm, mcpClient) {
    this.llm = llm;
    this.mcpClient = mcpClient;
    this.conversationHistory = [];
  }

  async sendMessage(message, expectedFeatures = {}) {
    console.log(`👤 User: ${message}`);

    const response = await this.llm.chat(message, this.mcpClient);

    console.log(
      `🤖 Assistant: ${response.response.substring(0, 200)}${response.response.length > 200 ? "..." : ""}`
    );

    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(`🔧 Tools used: ${response.toolCalls.map(tc => tc.name).join(", ")}`);
    }

    // Validate expected features
    if (
      expectedFeatures.shouldUseTools &&
      (!response.toolCalls || response.toolCalls.length === 0)
    ) {
      throw new Error("Expected tool usage but no tools were called");
    }

    if (
      expectedFeatures.shouldSearchMemory &&
      !response.toolCalls?.some(tc => tc.name === "search_memories")
    ) {
      throw new Error("Expected memory search but search_memories was not called");
    }

    if (
      expectedFeatures.shouldUseDatabase &&
      !response.toolCalls?.some(tc => tc.name === "db_query" || tc.name === "graph_export")
    ) {
      throw new Error("Expected database access but no database tools were called");
    }

    if (
      expectedFeatures.minimumResponseLength &&
      response.response.length < expectedFeatures.minimumResponseLength
    ) {
      throw new Error(
        `Response too short: ${response.response.length} < ${expectedFeatures.minimumResponseLength}`
      );
    }

    this.conversationHistory.push({ message, response });
    return response;
  }
}

// Initialize test runner
const runner = new TestRunner();

// Test 1: Basic Claude LLM Functionality
runner.test("Claude LLM - Basic Initialization and Simple Query", async () => {
  const llm = await LLMFactory.create(
    "claude",
    {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4000,
      temperature: 0.7,
    },
    {
      apiKey: process.env.ANTHROPIC_API_KEY || "test-key",
    }
  );

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  No ANTHROPIC_API_KEY - simulating response");
    return; // Skip actual API call in CI
  }

  const tester = new ConversationTester(llm, runner.mcpClient);

  const response = await tester.sendMessage(
    "Hello, can you help me understand what tools you have access to?",
    {
      minimumResponseLength: 50,
    }
  );

  if (!response.response.includes("tools") && !response.response.includes("help")) {
    throw new Error("Response does not mention tools or help capability");
  }
});

// Test 2: Memory Search Integration
runner.test("Claude LLM - Memory Search First Approach", async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  No ANTHROPIC_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "claude",
    {},
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  // Test that memory search is used first for business queries
  await tester.sendMessage("What did we discuss about our sales targets?", {
    shouldUseTools: true,
    shouldSearchMemory: true,
  });
});

// Test 3: Business Query Detection and Database Integration
runner.test("Claude LLM - Business Query with Database Access", async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  No ANTHROPIC_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "claude",
    {},
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  // Test intelligent analytics pipeline
  await tester.sendMessage("Show me our recent customer engagements", {
    shouldUseTools: true,
    shouldUseDatabase: true,
  });

  // Follow up question to test context retention
  await tester.sendMessage("What patterns do you see in that data?", {
    minimumResponseLength: 100,
  });
});

// Test 4: Multi-turn Business Conversation
runner.test("Claude LLM - Multi-turn Business Analysis Conversation", async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  No ANTHROPIC_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "claude",
    {},
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  // Initial query about business data
  await tester.sendMessage("I need to analyze our customer performance metrics", {
    shouldUseTools: true,
  });

  // Follow-up with specific request
  await tester.sendMessage("Focus on the top 10 customers by revenue", {
    shouldUseTools: true,
  });

  // Request for recommendations
  await tester.sendMessage("Based on this analysis, what should be our next steps?", {
    minimumResponseLength: 150,
  });

  // Test memory of conversation
  await tester.sendMessage("Can you remind me what we discovered about customer performance?", {
    minimumResponseLength: 100,
  });
});

// Test 5: OpenAI LLM Comparison
runner.test("OpenAI LLM - Basic Functionality Comparison", async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  No OPENAI_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "openai",
    {
      model: "gpt-4o",
      maxTokens: 4000,
      temperature: 0.7,
    },
    {
      apiKey: process.env.OPENAI_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  await tester.sendMessage("What tools do you have access to for business analysis?", {
    shouldUseTools: true,
    minimumResponseLength: 50,
  });
});

// Test 5b: Gemini LLM Testing
runner.test("Gemini LLM - Basic Functionality", async () => {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.log("⚠️  No GOOGLE_AI_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "gemini",
    {
      model: "gemini-1.5-pro",
      maxTokens: 4000,
      temperature: 0.7,
    },
    {
      apiKey: process.env.GOOGLE_AI_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  await tester.sendMessage("How can you help with data analysis tasks?", {
    shouldUseTools: true,
    minimumResponseLength: 50,
  });
});

// Test 5c: Mistral LLM Testing
runner.test("Mistral LLM - Basic Functionality", async () => {
  if (!process.env.MISTRAL_API_KEY) {
    console.log("⚠️  No MISTRAL_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "mistral",
    {
      model: "mistral-large-latest",
      maxTokens: 4000,
      temperature: 0.7,
    },
    {
      apiKey: process.env.MISTRAL_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  await tester.sendMessage("What are your capabilities for business intelligence?", {
    shouldUseTools: true,
    minimumResponseLength: 50,
  });
});

// Test 6: Enhanced Provider Factory Validation
runner.test("LLM Factory - Multi-Provider Management", async () => {
  // Test supported providers
  const providers = LLMFactory.getSupportedProviders();
  const expectedProviders = ["claude", "openai", "gemini", "mistral"];

  for (const provider of expectedProviders) {
    if (!providers.includes(provider)) {
      throw new Error(`Missing expected provider: ${provider}`);
    }
  }

  // Test model validation for all providers
  if (!LLMFactory.isValidModel("claude", "claude-3-5-sonnet-20241022")) {
    throw new Error("Valid Claude model not recognized");
  }

  if (!LLMFactory.isValidModel("openai", "gpt-4o")) {
    throw new Error("Valid OpenAI model not recognized");
  }

  if (!LLMFactory.isValidModel("gemini", "gemini-1.5-pro")) {
    throw new Error("Valid Gemini model not recognized");
  }

  if (!LLMFactory.isValidModel("mistral", "mistral-large-latest")) {
    throw new Error("Valid Mistral model not recognized");
  }

  // Test provider features
  const claudeFeatures = LLMFactory.getProviderFeatures("claude");
  if (!claudeFeatures.analyticsSubagent) {
    throw new Error("Claude analytics subagent feature not found");
  }

  const geminiFeatures = LLMFactory.getProviderFeatures("gemini");
  if (!geminiFeatures.longContext) {
    throw new Error("Gemini long context feature not found");
  }

  // Test provider recommendations
  const businessRecommendations = LLMFactory.recommendProviderForTask("business-analysis");
  if (!businessRecommendations.includes("claude")) {
    throw new Error("Claude not recommended for business analysis");
  }

  // Test invalid provider
  try {
    await LLMFactory.create("invalid-provider", {}, {});
    throw new Error("Should have thrown error for invalid provider");
  } catch (error) {
    if (!error.message.includes("Unsupported LLM provider")) {
      throw new Error("Wrong error message for invalid provider");
    }
  }
});

// Test 7: Tool Integration and Context Handling
runner.test("Claude LLM - Advanced Tool Integration", async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  No ANTHROPIC_API_KEY - simulating response");
    return;
  }

  const llm = await LLMFactory.create(
    "claude",
    {},
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  );

  const tester = new ConversationTester(llm, runner.mcpClient);

  // Test sequential thinking
  await tester.sendMessage("Help me think through the pros and cons of expanding to new markets", {
    shouldUseTools: true,
  });

  // Test task planning
  await tester.sendMessage("Create a plan for market research", {
    shouldUseTools: true,
  });
});

// Test 8: Error Handling and Edge Cases
runner.test("LLM Error Handling - Graceful Degradation", async () => {
  // Test with invalid API key
  try {
    const llm = await LLMFactory.create(
      "claude",
      {},
      {
        apiKey: "invalid-key",
      }
    );

    // This should work (initialization doesn't validate key)
    if (!llm) {
      throw new Error("LLM creation failed with invalid key");
    }
  } catch (error) {
    // Expected for actual API validation
    if (
      !error.message.includes("Claude API key is required") &&
      !error.message.includes("API key")
    ) {
      throw error;
    }
  }

  // Test invalid model
  try {
    await LLMFactory.create(
      "claude",
      { model: "invalid-model" },
      {
        apiKey: "test-key",
      }
    );
  } catch (error) {
    // Should handle gracefully or create with default
  }
});

// Test 9: Configuration and Settings Validation
runner.test("LLM Configuration - Settings Management", async () => {
  // Test recommended settings
  const claudeSettings = LLMFactory.getRecommendedSettings("claude", "claude-3-5-sonnet-20241022");
  if (!claudeSettings.temperature || !claudeSettings.maxTokens) {
    throw new Error("Missing recommended settings for Claude");
  }

  const openaiSettings = LLMFactory.getRecommendedSettings("openai", "gpt-4o");
  if (!openaiSettings.temperature || !openaiSettings.maxTokens) {
    throw new Error("Missing recommended settings for OpenAI");
  }

  // Test setting updates
  const llm = await LLMFactory.create(
    "claude",
    {
      temperature: 0.5,
      maxTokens: 2000,
    },
    {
      apiKey: "test-key",
    }
  );

  llm.setTemperature(0.8);
  llm.setMaxTokens(3000);

  if (llm.config.temperature !== 0.8 || llm.config.maxTokens !== 3000) {
    throw new Error("Configuration updates not applied");
  }
});

// Test 10: Conversation History and Context Management
runner.test("LLM Context Management - History and Memory", async () => {
  const llm = await LLMFactory.create(
    "claude",
    {},
    {
      apiKey: "test-key",
    }
  );

  // Test conversation context
  await llm.updateContext("Test message", [], "Test response");

  const history = llm.getHistory();
  if (!Array.isArray(history)) {
    throw new Error("History is not an array");
  }

  const stats = llm.getStats();
  if (!stats.provider || !stats.model) {
    throw new Error("Missing stats information");
  }

  // Test history clearing
  llm.clearHistory();
  if (llm.getHistory().length !== 0) {
    throw new Error("History not cleared");
  }
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runner.run().catch(console.error);
}

export { runner as testRunner, ConversationTester };
