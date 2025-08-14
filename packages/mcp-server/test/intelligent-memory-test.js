#!/usr/bin/env node

/**
 * Test script for intelligent memory storage
 */

import { Mem0MemoryService } from "../src/mem0-memory-service.js";

async function testIntelligentMemory() {
  console.log("🧠 Testing Intelligent Memory Storage\n");

  const memoryService = new Mem0MemoryService("test-api-key");

  // Test user insight extraction
  console.log("Test 1: User insight extraction");

  const userTestCases = [
    {
      message: "What is your pricing model?",
      shouldStore: false,
      reason: "Question - not business info",
    },
    {
      message: "We use Salesforce for customer management and HubSpot for marketing automation",
      shouldStore: true,
      reason: "Business operations info",
    },
    {
      message: "Our customers often complain about long loading times in our app",
      shouldStore: true,
      reason: "Customer feedback insight",
    },
    {
      message: "I think we should focus more on enterprise clients rather than SMBs",
      shouldStore: true,
      reason: "Strategic opinion",
    },
    {
      message: "Can you help me analyze our sales data?",
      shouldStore: false,
      reason: "Question/request for help",
    },
    {
      message: "Our company's main challenge is scaling our support team as we grow",
      shouldStore: true,
      reason: "Business challenge",
    },
  ];

  userTestCases.forEach((testCase, index) => {
    const insight = memoryService.extractUserInsights(testCase.message);
    const shouldStore = insight !== null;

    if (shouldStore === testCase.shouldStore) {
      console.log(`✅ User test ${index + 1}: ${testCase.reason}`);
      if (insight) {
        console.log(`   - Category: ${insight.category}, Confidence: ${insight.confidence}`);
      }
    } else {
      console.log(
        `❌ User test ${index + 1}: Expected ${testCase.shouldStore ? "store" : "skip"} - ${testCase.reason}`
      );
    }
  });

  // Test assistant insight extraction
  console.log("\nTest 2: Assistant insight extraction");

  const assistantTestCases = [
    {
      response: "Based on the analysis of your sales data, revenue shows a 15% increase in Q3",
      metadata: { toolCalls: [{ name: "db_query" }] },
      shouldStore: true,
      reason: "Tool-based analysis with confident findings",
    },
    {
      response: "It depends on various factors and could potentially be improved",
      metadata: {},
      shouldStore: false,
      reason: "Uncertain language",
    },
    {
      response: "The recommendation is to implement automated customer onboarding",
      metadata: {},
      shouldStore: true,
      reason: "Clear recommendation",
    },
    {
      response: "I'm not sure about the exact numbers, but it might be around 20%",
      metadata: {},
      shouldStore: false,
      reason: "Uncertainty indicators",
    },
    {
      response: "Key insight: Customer retention improves significantly with proactive support",
      metadata: {},
      shouldStore: true,
      reason: "Confident key insight",
    },
  ];

  assistantTestCases.forEach((testCase, index) => {
    const insight = memoryService.extractAssistantInsights(testCase.response, testCase.metadata);
    const shouldStore = insight !== null;

    if (shouldStore === testCase.shouldStore) {
      console.log(`✅ Assistant test ${index + 1}: ${testCase.reason}`);
      if (insight) {
        console.log(`   - Category: ${insight.category}, Confidence: ${insight.confidence}`);
      }
    } else {
      console.log(
        `❌ Assistant test ${index + 1}: Expected ${testCase.shouldStore ? "store" : "skip"} - ${testCase.reason}`
      );
    }
  });

  // Test question detection
  console.log("\nTest 3: Question detection");

  const questionTestCases = [
    { message: "What is your pricing?", isQuestion: true },
    { message: "How do I configure this?", isQuestion: true },
    { message: "Can you help me?", isQuestion: true },
    { message: "We use React for frontend development", isQuestion: false },
    { message: "Show me the analytics dashboard", isQuestion: true },
    { message: "Our team consists of 5 developers", isQuestion: false },
  ];

  questionTestCases.forEach((testCase, index) => {
    const isQuestion = memoryService.isUserQuestion(testCase.message);

    if (isQuestion === testCase.isQuestion) {
      console.log(
        `✅ Question test ${index + 1}: "${testCase.message}" -> ${isQuestion ? "Question" : "Statement"}`
      );
    } else {
      console.log(
        `❌ Question test ${index + 1}: Expected ${testCase.isQuestion ? "Question" : "Statement"} for "${testCase.message}"`
      );
    }
  });

  console.log("\n🧠 Intelligent Memory Test Complete");
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testIntelligentMemory().catch(console.error);
}

export { testIntelligentMemory };
