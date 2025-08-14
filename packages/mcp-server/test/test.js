#!/usr/bin/env node

import { TaskPlanner } from "../src/task-planner.js";
import { SequentialThinker } from "../src/sequential-thinker.js";
import { ToolManager } from "../src/tool-manager.js";
import { LoopDetector } from "../src/loop-detector.js";

// Simple test framework
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log("🚀 Running Aden MCP Server Tests\n");

    for (const test of this.tests) {
      try {
        console.log(`Testing: ${test.name}`);
        await test.testFn();
        console.log(`✅ ${test.name} - PASSED\n`);
        this.results.push({ name: test.name, status: "PASSED" });
      } catch (error) {
        console.log(`❌ ${test.name} - FAILED: ${error.message}\n`);
        this.results.push({
          name: test.name,
          status: "FAILED",
          error: error.message,
        });
      }
    }

    this.printSummary();
  }

  printSummary() {
    const passed = this.results.filter(r => r.status === "PASSED").length;
    const failed = this.results.filter(r => r.status === "FAILED").length;

    console.log("📊 Test Summary:");
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
      console.log("\n❌ Failed Tests:");
      this.results
        .filter(r => r.status === "FAILED")
        .forEach(result => {
          console.log(`  - ${result.name}: ${result.error}`);
        });
    }

    console.log(failed === 0 ? "\n🎉 All tests passed!" : "\n⚠️  Some tests failed");
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed");
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertNotNull(value, message) {
    if (value === null || value === undefined) {
      throw new Error(message || "Value should not be null or undefined");
    }
  }

  assertArrayLength(array, expectedLength, message) {
    if (!Array.isArray(array) || array.length !== expectedLength) {
      throw new Error(
        message ||
          `Expected array of length ${expectedLength}, got ${array?.length || "not an array"}`
      );
    }
  }
}

const runner = new TestRunner();

// TaskPlanner Tests
runner.test("TaskPlanner - Create Task Plan", async () => {
  const planner = new TaskPlanner();
  const tasks = await planner.createTaskPlan("Build a web application");

  runner.assert(Array.isArray(tasks), "Should return an array of tasks");
  runner.assert(tasks.length > 0, "Should create at least one task");
  runner.assert(tasks[0].id, "Task should have an ID");
  runner.assert(tasks[0].description, "Task should have a description");
  runner.assert(tasks[0].status === "pending", "New task should have pending status");
});

runner.test("TaskPlanner - Execute Task", async () => {
  const planner = new TaskPlanner();
  const tasks = await planner.createTaskPlan("Simple test task");
  const taskId = tasks[0].id;

  const result = await planner.executeTask(taskId);
  runner.assertNotNull(result, "Task execution should return a result");

  const task = planner.getTask(taskId);
  runner.assertEqual(task.status, "completed", "Task should be marked as completed");
});

runner.test("TaskPlanner - Get Task Status", async () => {
  const planner = new TaskPlanner();
  await planner.createTaskPlan("Test objective");

  const status = planner.getTaskStatus();
  runner.assert(Array.isArray(status), "Should return array of task statuses");
  runner.assert(status.length > 0, "Should have at least one task");
});

runner.test("TaskPlanner - Get Next Task", async () => {
  const planner = new TaskPlanner();
  await planner.createTaskPlan("Get next task test");

  const nextTask = planner.getNextTask();
  runner.assertNotNull(nextTask, "Should return next available task");
  runner.assertEqual(nextTask.status, "pending", "Next task should be pending");
});

// SequentialThinker Tests
runner.test("SequentialThinker - Basic Thinking", async () => {
  const thinker = new SequentialThinker();
  const steps = await thinker.think("How to make a sandwich");

  runner.assert(Array.isArray(steps), "Should return array of thinking steps");
  runner.assert(steps.length >= 5, "Should have at least 5 thinking steps");
  runner.assert(steps[0].includes("Problem Analysis"), "First step should be problem analysis");
});

runner.test("SequentialThinker - Thinking History", async () => {
  const thinker = new SequentialThinker();
  await thinker.think("Test problem");

  const history = thinker.getThinkingHistory();
  runner.assert(Array.isArray(history), "Should return thinking history array");
  runner.assert(history.length > 0, "Should have at least one thinking session");
  runner.assertEqual(history[0].status, "completed", "Thinking session should be completed");
});

// ToolManager Tests
runner.test("ToolManager - Get Available Tools", async () => {
  const toolManager = new ToolManager();
  const tools = toolManager.getAvailableTools();

  runner.assert(Array.isArray(tools), "Should return array of tools");
  runner.assert(tools.length > 0, "Should have built-in tools available");
  runner.assert(tools[0].name, "Tools should have names");
  runner.assert(tools[0].description, "Tools should have descriptions");
});

runner.test("ToolManager - Use Text Analysis Tool", async () => {
  const toolManager = new ToolManager();
  const result = await toolManager.useTool("text_analyze", "This is a test text for analysis.");

  runner.assertNotNull(result, "Tool should return result");
  runner.assertNotNull(result.analysis, "Should return analysis object");
  runner.assert(result.analysis.wordCount > 0, "Should count words");
});

runner.test("ToolManager - Use Math Tool", async () => {
  const toolManager = new ToolManager();
  const result = await toolManager.useTool("math_calculate", "2 + 2");

  runner.assertNotNull(result, "Math tool should return result");
  runner.assertEqual(result.result, 4, "Should calculate 2 + 2 = 4");
  runner.assert(result.isValid, "Result should be valid");
});

runner.test("ToolManager - Tool Recommendations", async () => {
  const toolManager = new ToolManager();
  const recommendations = toolManager.recommendTools("analyze this text document");

  runner.assert(Array.isArray(recommendations), "Should return array of recommendations");
  runner.assert(recommendations.length > 0, "Should recommend tools for text analysis");
});

runner.test("ToolManager - Invalid Tool Usage", async () => {
  const toolManager = new ToolManager();

  try {
    await toolManager.useTool("nonexistent_tool", "test");
    runner.assert(false, "Should throw error for nonexistent tool");
  } catch (error) {
    runner.assert(error.message.includes("not found"), "Should throw appropriate error message");
  }
});

// LoopDetector Tests
runner.test("LoopDetector - Basic Loop Detection", async () => {
  const detector = new LoopDetector({ maxRetries: 2 });

  // Simulate multiple executions of the same task
  detector.recordExecution("test_task_1");
  detector.recordExecution("test_task_1");
  detector.recordExecution("test_task_1");

  const isInLoop = detector.isInLoop("test_task_1");
  runner.assert(isInLoop, "Should detect loop after multiple executions");
});

runner.test("LoopDetector - Loop Status", async () => {
  const detector = new LoopDetector();
  detector.recordExecution("test_task_2");

  const status = detector.getLoopStatus();
  runner.assertNotNull(status, "Should return loop status");
  runner.assert(
    typeof status.executionHistory === "number",
    "Should include execution history count"
  );
});

runner.test("LoopDetector - Help Request", async () => {
  const detector = new LoopDetector();
  const helpRequest = await detector.requestUserHelp("stuck_task");

  runner.assertNotNull(helpRequest, "Should create help request");
  runner.assert(helpRequest.id, "Help request should have ID");
  runner.assertEqual(helpRequest.status, "pending", "Help request should be pending");
  runner.assert(helpRequest.suggestedActions.length > 0, "Should include suggested actions");
});

runner.test("LoopDetector - Resolve Loop", async () => {
  const detector = new LoopDetector({ maxRetries: 1 });

  // Create a loop
  detector.recordExecution("loop_task");
  detector.recordExecution("loop_task");
  runner.assert(detector.isInLoop("loop_task"), "Should detect loop");

  // Resolve the loop
  detector.resolveLoop("loop_task", { method: "user_intervention" });
  runner.assert(!detector.isInLoop("loop_task"), "Loop should be resolved");
});

runner.test("LoopDetector - Statistics", async () => {
  const detector = new LoopDetector();
  detector.recordExecution("stats_task");

  const stats = detector.getStatistics();
  runner.assertNotNull(stats, "Should return statistics");
  runner.assert(typeof stats.totalExecutions === "number", "Should include execution count");
  runner.assert(Array.isArray(stats.mostProblematicTasks), "Should include problematic tasks list");
});

// Integration Tests
runner.test("Integration - Task Planning with Tool Usage", async () => {
  const planner = new TaskPlanner();
  const toolManager = new ToolManager();

  // Create a task plan
  const tasks = await planner.createTaskPlan("Analyze user feedback data");
  runner.assert(tasks.length > 0, "Should create tasks");

  // Get tool recommendations for the objective
  const recommendations = toolManager.recommendTools("Analyze user feedback data");
  runner.assert(recommendations.length > 0, "Should recommend appropriate tools");

  // Execute a task
  const result = await planner.executeTask(tasks[0].id);
  runner.assertNotNull(result, "Task execution should succeed");
});

runner.test("Integration - Sequential Thinking with Loop Detection", async () => {
  const thinker = new SequentialThinker();
  const detector = new LoopDetector();

  // Perform thinking
  const steps = await thinker.think("Solve a complex problem");
  runner.assert(steps.length > 0, "Should generate thinking steps");

  // Simulate task execution monitoring
  detector.recordExecution("thinking_task", { problem: "complex problem" });
  const status = detector.getLoopStatus("thinking_task");
  runner.assertNotNull(status, "Should track execution status");
});

runner.test("Integration - Complete Workflow", async () => {
  const planner = new TaskPlanner();
  const thinker = new SequentialThinker();
  const toolManager = new ToolManager();
  const detector = new LoopDetector();

  // 1. Think about the problem
  const thinkingSteps = await thinker.think("Create a user authentication system");
  runner.assert(thinkingSteps.length > 0, "Should complete thinking process");

  // 2. Plan tasks
  const tasks = await planner.createTaskPlan("Create a user authentication system");
  runner.assert(tasks.length > 0, "Should create task plan");

  // 3. Get tool recommendations
  const tools = toolManager.recommendTools("Create a user authentication system");
  runner.assert(tools.length > 0, "Should recommend tools");

  // 4. Execute first task with monitoring
  const taskId = tasks[0].id;
  detector.recordExecution(taskId, { workflow: "authentication_system" });

  const result = await planner.executeTask(taskId);
  runner.assertNotNull(result, "Should execute task successfully");

  // 5. Verify no loops detected
  runner.assert(!detector.isInLoop(taskId), "Should not detect loops in normal execution");
});

// Error Handling Tests
runner.test("Error Handling - Invalid Task Execution", async () => {
  const planner = new TaskPlanner();

  try {
    await planner.executeTask("nonexistent_task");
    runner.assert(false, "Should throw error for nonexistent task");
  } catch (error) {
    runner.assert(error.message.includes("not found"), "Should throw appropriate error");
  }
});

runner.test("Error Handling - Invalid Math Expression", async () => {
  const toolManager = new ToolManager();
  const result = await toolManager.useTool("math_calculate", "invalid expression");

  runner.assert(!result.isValid, "Should mark invalid expression as invalid");
  runner.assertNotNull(result.error, "Should include error message");
});

// Run all tests
runner.run().catch(console.error);
