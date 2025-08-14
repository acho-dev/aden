/**
 * Realistic business conversation scenarios for testing LLM integration
 * These tests simulate real-world multi-turn conversations with business queries
 */

import { LLMFactory } from "../../agent-client/src/llm/llm-factory.js";
import { MCPClient } from "../../agent-client/src/mcp-client.js";

class BusinessConversationTester {
  constructor() {
    this.scenarios = [];
    this.results = [];
  }

  addScenario(name, scenario) {
    this.scenarios.push({ name, scenario });
  }

  async runScenarios() {
    console.log(`\n💼 Running ${this.scenarios.length} Business Conversation Scenarios\n`);

    for (const { name, scenario } of this.scenarios) {
      try {
        console.log(`\n📋 Scenario: ${name}`);
        console.log("=" * 50);

        const startTime = Date.now();
        await scenario();
        const duration = Date.now() - startTime;

        this.results.push({ name, status: "PASS", duration });
        console.log(`\n✅ Scenario completed successfully (${duration}ms)\n`);
      } catch (error) {
        this.results.push({ name, status: "FAIL", error: error.message });
        console.log(`\n❌ Scenario failed: ${error.message}\n`);
      }
    }

    this.printResults();
  }

  printResults() {
    const passed = this.results.filter(r => r.status === "PASS").length;
    const failed = this.results.filter(r => r.status === "FAIL").length;

    console.log("\n📊 Business Scenario Results:");
    console.log(`   Total: ${this.results.length}`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}\n`);

    if (failed > 0) {
      console.log("❌ Failed Scenarios:");
      this.results
        .filter(r => r.status === "FAIL")
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }
  }
}

class ConversationContext {
  constructor(llm, mcpClient) {
    this.llm = llm;
    this.mcpClient = mcpClient;
    this.conversationLog = [];
  }

  async say(message, options = {}) {
    console.log(`\n👤 User: ${message}`);

    const response = await this.llm.chat(message, this.mcpClient);

    // Log response (truncated for readability)
    const displayResponse =
      response.response.length > 300
        ? response.response.substring(0, 300) + "..."
        : response.response;
    console.log(`🤖 Assistant: ${displayResponse}`);

    // Log tool usage
    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(`🔧 Tools: ${response.toolCalls.map(tc => tc.name).join(", ")}`);
    }

    // Validate expectations
    if (options.expectTools && (!response.toolCalls || response.toolCalls.length === 0)) {
      throw new Error(`Expected tool usage for: "${message}"`);
    }

    if (
      options.expectMemorySearch &&
      !response.toolCalls?.some(tc => tc.name === "search_memories")
    ) {
      throw new Error(`Expected memory search for: "${message}"`);
    }

    if (
      options.expectDatabase &&
      !response.toolCalls?.some(tc => ["db_query", "graph_export"].includes(tc.name))
    ) {
      throw new Error(`Expected database access for: "${message}"`);
    }

    if (options.minLength && response.response.length < options.minLength) {
      throw new Error(`Response too short (${response.response.length} < ${options.minLength})`);
    }

    if (options.mustContain) {
      const contains = Array.isArray(options.mustContain)
        ? options.mustContain
        : [options.mustContain];
      for (const term of contains) {
        if (!response.response.toLowerCase().includes(term.toLowerCase())) {
          throw new Error(`Response must contain "${term}"`);
        }
      }
    }

    this.conversationLog.push({ message, response });
    return response;
  }

  async expectAnalysis() {
    // Wait a moment for any async processing
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Initialize tester
const tester = new BusinessConversationTester();

// Scenario 1: Customer Performance Analysis
tester.addScenario("Customer Performance Deep Dive", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const llm = await LLMFactory.create("claude", {}, { apiKey: process.env.ANTHROPIC_API_KEY });
  const mcpClient = new MCPClient();
  // Note: In actual test, we'd set up MCP client properly

  const conv = new ConversationContext(llm, mcpClient);

  // Initial request
  await conv.say("I need to understand how our key customers are performing this quarter", {
    expectTools: true,
    expectMemorySearch: true,
  });

  // Follow-up for specifics
  await conv.say("Focus on customers with revenue above $100k", {
    expectDatabase: true,
  });

  // Request for insights
  await conv.say("What trends do you notice in customer behavior?", {
    minLength: 150,
  });

  // Ask for actionable recommendations
  await conv.say("Based on this analysis, what should our account management team prioritize?", {
    minLength: 200,
    mustContain: ["recommend", "should", "focus"],
  });

  // Test conversation memory
  await conv.say("Can you summarize the key findings from our customer analysis?", {
    minLength: 100,
    mustContain: ["customer", "performance"],
  });
});

// Scenario 2: Sales Pipeline Review
tester.addScenario("Sales Pipeline Strategy Session", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const llm = await LLMFactory.create("claude", {}, { apiKey: process.env.ANTHROPIC_API_KEY });
  const mcpClient = new MCPClient();

  const conv = new ConversationContext(llm, mcpClient);

  // Start with pipeline overview
  await conv.say("Show me our current sales pipeline status", {
    expectTools: true,
    expectDatabase: true,
  });

  // Drill down into stages
  await conv.say("Which deals are stuck in the proposal stage?", {
    expectDatabase: true,
  });

  // Ask for bottleneck analysis
  await conv.say("What are the main bottlenecks in our sales process?", {
    minLength: 150,
  });

  // Request specific actions
  await conv.say("What specific actions should we take to accelerate deals in Q4?", {
    minLength: 200,
    mustContain: ["action", "accelerate", "deals"],
  });

  // Follow up with prioritization
  await conv.say("Which deals should we prioritize and why?", {
    minLength: 100,
    mustContain: ["prioritize"],
  });
});

// Scenario 3: Market Research and Competitive Analysis
tester.addScenario("Market Research Discovery Session", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const llm = await LLMFactory.create("claude", {}, { apiKey: process.env.ANTHROPIC_API_KEY });
  const mcpClient = new MCPClient();

  const conv = new ConversationContext(llm, mcpClient);

  // Broad market research request
  await conv.say("I need to research the competitive landscape for enterprise software solutions", {
    expectTools: true,
  });

  // Focus on specific competitors
  await conv.say("Compare our pricing with top 3 competitors", {
    expectTools: true,
  });

  // Ask for market positioning advice
  await conv.say("How should we position ourselves in this market?", {
    minLength: 150,
    mustContain: ["position", "market"],
  });

  // Request strategic recommendations
  await conv.say("What market opportunities should we pursue next?", {
    minLength: 200,
    mustContain: ["opportunity", "pursue"],
  });

  // Test synthesis of research
  await conv.say("Summarize the key insights from this competitive analysis", {
    minLength: 150,
    mustContain: ["competitive", "insights"],
  });
});

// Scenario 4: Financial Performance Review
tester.addScenario("Financial Performance Analysis", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const llm = await LLMFactory.create("claude", {}, { apiKey: process.env.ANTHROPIC_API_KEY });
  const mcpClient = new MCPClient();

  const conv = new ConversationContext(llm, mcpClient);

  // Revenue analysis request
  await conv.say("Analyze our revenue performance for the last 6 months", {
    expectTools: true,
    expectDatabase: true,
  });

  // Drill into metrics
  await conv.say("What's our customer acquisition cost trend?", {
    expectDatabase: true,
  });

  // Ask for variance analysis
  await conv.say("Where are we over or under budget?", {
    minLength: 100,
  });

  // Request forecasting insights
  await conv.say("Based on current trends, what should we expect for Q4 revenue?", {
    minLength: 150,
    mustContain: ["Q4", "revenue", "expect"],
  });

  // Ask for cost optimization recommendations
  await conv.say("Where can we optimize costs without impacting growth?", {
    minLength: 200,
    mustContain: ["optimize", "costs", "growth"],
  });
});

// Scenario 5: Product Development Planning
tester.addScenario("Product Roadmap Strategy Discussion", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const llm = await LLMFactory.create("claude", {}, { apiKey: process.env.ANTHROPIC_API_KEY });
  const mcpClient = new MCPClient();

  const conv = new ConversationContext(llm, mcpClient);

  // Feature request analysis
  await conv.say("Help me analyze customer feature requests from the last quarter", {
    expectTools: true,
    expectDatabase: true,
  });

  // Prioritization discussion
  await conv.say("Which features would have the highest business impact?", {
    minLength: 150,
  });

  // Resource planning
  await conv.say(
    "Considering our development resources, what's a realistic roadmap for next quarter?",
    {
      minLength: 200,
      mustContain: ["roadmap", "quarter", "resources"],
    }
  );

  // Risk assessment
  await conv.say("What are the biggest risks to this product roadmap?", {
    minLength: 100,
    mustContain: ["risks", "roadmap"],
  });

  // Strategic alignment check
  await conv.say("How does this roadmap align with our overall business strategy?", {
    minLength: 150,
    mustContain: ["align", "strategy"],
  });
});

// Scenario 6: Cross-functional Analytics Session
tester.addScenario("Cross-functional Data Analysis", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const llm = await LLMFactory.create("claude", {}, { apiKey: process.env.ANTHROPIC_API_KEY });
  const mcpClient = new MCPClient();

  const conv = new ConversationContext(llm, mcpClient);

  // Comprehensive business review
  await conv.say(
    "I need a comprehensive view of how marketing, sales, and product metrics are interconnected",
    {
      expectTools: true,
      expectDatabase: true,
    }
  );

  // Correlation analysis
  await conv.say("Show me the correlation between marketing spend and sales outcomes", {
    expectDatabase: true,
  });

  // Identify disconnects
  await conv.say("Where do you see disconnects between our different business functions?", {
    minLength: 150,
    mustContain: ["disconnect"],
  });

  // Strategic recommendations
  await conv.say("What changes would improve alignment across these functions?", {
    minLength: 200,
    mustContain: ["alignment", "improve", "functions"],
  });

  // Action planning
  await conv.say("Create a priority action plan for the next 30 days", {
    minLength: 150,
    mustContain: ["action", "plan", "priority"],
  });
});

// Run scenarios if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  tester.runScenarios().catch(console.error);
}

export { tester as businessTester, ConversationContext };
