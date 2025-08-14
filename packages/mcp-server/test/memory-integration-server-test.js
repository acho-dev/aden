#!/usr/bin/env node

/**
 * Test script for memory integration with the actual conversation flow
 */

import { Mem0MemoryService } from "../src/mem0-memory-service.js";

async function testMemoryIntegration() {
  console.log("🧠 Testing Memory Integration with Conversation Flow\n");

  const memoryService = new Mem0MemoryService("test-api-key");

  // Test conversation flow scenarios
  console.log("Test 1: Business information conversation");

  const businessScenarios = [
    {
      userMessage: "We use Salesforce for CRM and are considering switching to HubSpot",
      assistantResponse:
        "Based on your requirements, I recommend evaluating both platforms carefully. Key factors to consider include integration capabilities, user experience, and cost.",
      metadata: { toolCalls: [], responseTime: 1500, tokensUsed: 250 },
    },
    {
      userMessage: "What are the main differences between Salesforce and HubSpot?",
      assistantResponse:
        "Salesforce offers more customization but has a steeper learning curve, while HubSpot provides better user experience out of the box.",
      metadata: { toolCalls: [], responseTime: 1200, tokensUsed: 180 },
    },
    {
      userMessage: "Our customers complain about slow response times from our support team",
      assistantResponse:
        "Analysis shows that implementing automated ticket routing and knowledge base search can reduce response times by 40-60%.",
      metadata: {
        toolCalls: [{ name: "think_sequentially" }],
        responseTime: 2200,
        tokensUsed: 320,
      },
    },
  ];

  for (let i = 0; i < businessScenarios.length; i++) {
    const scenario = businessScenarios[i];
    console.log(`\nScenario ${i + 1}:`);
    console.log(`User: "${scenario.userMessage}"`);
    console.log(`Assistant: "${scenario.assistantResponse}"`);

    try {
      const result = await memoryService.addConversationTurn(
        `test-session-${i}`,
        scenario.userMessage,
        scenario.assistantResponse,
        scenario.metadata
      );

      console.log(`✅ Stored ${result.length} memories`);
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  // Test conversation summary with various message formats
  console.log("\nTest 2: Conversation summary generation");

  const conversationFormats = [
    // Standard format
    [
      {
        role: "user",
        content: "What is our current customer satisfaction score?",
      },
      {
        role: "assistant",
        content: "Based on recent surveys, customer satisfaction is at 85%.",
      },
    ],
    // Array content format
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Our team is struggling with project management",
          },
        ],
      },
      {
        role: "assistant",
        content: "I recommend implementing agile methodologies.",
      },
    ],
    // Mixed format
    [
      { role: "user", content: "How can we improve our conversion rates?" },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Focus on optimizing your landing pages and A/B testing different CTAs.",
          },
        ],
      },
    ],
  ];

  conversationFormats.forEach((conversation, index) => {
    try {
      const summary = memoryService.generateConversationSummary(conversation);
      console.log(`✅ Summary ${index + 1}: ${summary}`);
    } catch (error) {
      console.log(`❌ Summary ${index + 1} failed: ${error.message}`);
    }
  });

  // Test metadata trimming
  console.log("\nTest 3: Metadata trimming");

  const largeMetadata = {
    type: "test",
    category: "test_category",
    confidence: 0.8,
    session_id: "very-long-session-id-that-might-be-too-long-for-storage",
    tools_used:
      "db_query,knowledge_search,think_sequentially,plan_tasks,execute_task,get_task_status,analyze_data,generate_report,create_visualization,export_data,import_data,sync_systems",
    large_field: "A".repeat(1000), // Very large field
    another_large_field: "B".repeat(800),
    timestamp: new Date().toISOString(),
  };

  const trimmed = memoryService.trimMetadata(largeMetadata);
  const trimmedSize = JSON.stringify(trimmed).length;

  console.log(`Original size: ${JSON.stringify(largeMetadata).length} chars`);
  console.log(`Trimmed size: ${trimmedSize} chars`);
  console.log(`✅ Metadata trimming ${trimmedSize <= 1800 ? "successful" : "failed"}`);

  console.log("\n🧠 Memory Integration Test Complete");
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMemoryIntegration().catch(console.error);
}

export { testMemoryIntegration };
