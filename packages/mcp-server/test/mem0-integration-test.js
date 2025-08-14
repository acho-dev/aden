#!/usr/bin/env node

/**
 * Test script for Mem0 integration
 */

import { Mem0MemoryService } from "../src/mem0-memory-service.js";

async function testMem0Integration() {
  console.log("🧠 Testing Mem0 Memory Service Integration\n");

  // Test 1: Service initialization without API key
  console.log("Test 1: Service initialization without API key");
  try {
    new Mem0MemoryService();
    console.log("❌ Should have thrown error for missing API key");
  } catch (error) {
    console.log("✅ Correctly rejected missing API key:", error.message);
  }

  // Test 2: Service initialization with mock API key
  console.log("\nTest 2: Service initialization with API key");
  try {
    const mockApiKey = "test-api-key-12345";
    const memoryService = new Mem0MemoryService(mockApiKey, {
      maxMemoriesPerSearch: 3,
      enableSessionSummaries: true,
    });
    console.log("✅ Memory service initialized successfully");
    console.log("  - Max memories per search:", memoryService.config.maxMemoriesPerSearch);
    console.log("  - Session summaries enabled:", memoryService.config.enableSessionSummaries);
  } catch (error) {
    console.log("❌ Failed to initialize memory service:", error.message);
  }

  // Test 3: Configuration validation
  console.log("\nTest 3: Configuration validation");
  try {
    const memoryService = new Mem0MemoryService("test-key", {
      maxMemoriesPerSearch: 10,
      memoryTtl: 60 * 60 * 24 * 7, // 1 week
      enableSessionSummaries: false,
    });

    if (memoryService.config.maxMemoriesPerSearch === 10) {
      console.log("✅ Custom max memories configuration applied");
    }

    if (memoryService.config.enableSessionSummaries === false) {
      console.log("✅ Session summaries disabled correctly");
    }

    if (memoryService.config.memoryTtl === 60 * 60 * 24 * 7) {
      console.log("✅ Custom TTL configuration applied");
    }
  } catch (error) {
    console.log("❌ Configuration validation failed:", error.message);
  }

  // Test 4: Method availability
  console.log("\nTest 4: Method availability check");
  try {
    const memoryService = new Mem0MemoryService("test-key");
    const requiredMethods = [
      "addConversationTurn",
      "searchMemories",
      "getSessionMemories",
      "addProjectMemory",
      "searchProjectMemories",
      "addUserMemory",
      "searchUserMemories",
      "createSessionSummary",
      "getConversationContext",
      "healthCheck",
    ];

    let methodsPresent = 0;
    for (const method of requiredMethods) {
      if (typeof memoryService[method] === "function") {
        methodsPresent++;
      } else {
        console.log(`❌ Missing method: ${method}`);
      }
    }

    if (methodsPresent === requiredMethods.length) {
      console.log(`✅ All ${requiredMethods.length} required methods are present`);
    } else {
      console.log(`❌ Only ${methodsPresent}/${requiredMethods.length} methods present`);
    }
  } catch (error) {
    console.log("❌ Method availability check failed:", error.message);
  }

  // Test 5: Conversation summary generation
  console.log("\nTest 5: Conversation summary generation");
  try {
    const memoryService = new Mem0MemoryService("test-key");

    const mockConversationHistory = [
      {
        role: "user",
        content: "Hello, I need help with JavaScript async programming",
      },
      {
        role: "assistant",
        content:
          "I can help you with async programming. What specific aspect would you like to learn about?",
      },
      { role: "user", content: "How do promises work?" },
      {
        role: "assistant",
        content:
          "Promises are objects that represent the eventual completion or failure of an asynchronous operation...",
      },
    ];

    const summary = memoryService.generateConversationSummary(mockConversationHistory);

    if (summary.includes("user messages") && summary.includes("assistant responses")) {
      console.log("✅ Conversation summary generated successfully");
      console.log("   Summary:", summary.substring(0, 100) + "...");
    } else {
      console.log("❌ Conversation summary format incorrect");
    }
  } catch (error) {
    console.log("❌ Conversation summary generation failed:", error.message);
  }

  // Test 6: Context summary building
  console.log("\nTest 6: Context summary building");
  try {
    const memoryService = new Mem0MemoryService("test-key");

    const mockSessionMemories = [
      { content: "Previous discussion about async/await", score: 0.9 },
      { content: "User prefers ES6 syntax", score: 0.8 },
    ];

    const mockUserMemories = [{ content: "User is learning JavaScript", score: 0.85 }];

    const mockProjectMemories = [{ content: "Working on a React application", score: 0.7 }];

    const contextSummary = memoryService.buildContextSummary(
      mockSessionMemories,
      mockUserMemories,
      mockProjectMemories
    );

    if (contextSummary && contextSummary.includes("2 relevant session memories")) {
      console.log("✅ Context summary built successfully");
      console.log("   Context:", contextSummary);
    } else {
      console.log("❌ Context summary format incorrect");
    }
  } catch (error) {
    console.log("❌ Context summary building failed:", error.message);
  }

  console.log("\n🧠 Mem0 Integration Test Complete");
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMem0Integration().catch(console.error);
}

export { testMem0Integration };
