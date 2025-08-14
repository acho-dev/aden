#!/usr/bin/env node

/**
 * Example usage of the Aden MCP Server
 * This demonstrates how to use all the main components
 */

import { TaskPlanner } from "../src/task-planner.js";
import { SequentialThinker } from "../src/sequential-thinker.js";
import { ToolManager } from "../src/tool-manager.js";
import { LoopDetector } from "../src/loop-detector.js";

async function demonstrateSequentialThinking() {
  console.log("🧠 Sequential Thinking Example\n");

  const thinker = new SequentialThinker();
  const problem = "Design a recommendation system for an e-commerce platform";

  console.log(`Problem: ${problem}\n`);

  const steps = await thinker.think(problem);

  steps.forEach((step, index) => {
    console.log(`${index + 1}. ${step}\n`);
  });

  console.log("---\n");
}

async function demonstrateTaskPlanning() {
  console.log("📋 Task Planning Example\n");

  const planner = new TaskPlanner();
  const objective = "Implement user authentication with JWT tokens";

  console.log(`Objective: ${objective}\n`);

  // Create task plan
  const tasks = await planner.createTaskPlan(objective);

  console.log("Generated Task Plan:");
  tasks.forEach(task => {
    console.log(`- [${task.status}] ${task.id}: ${task.description} (Priority: ${task.priority})`);
  });

  console.log("\nExecuting first task...");

  // Execute the first task
  const firstTask = tasks[0];
  const result = await planner.executeTask(firstTask.id);
  console.log(`Result: ${result}`);

  // Show updated status
  console.log("\nUpdated Task Status:");
  const status = planner.getTaskStatus();
  status.forEach(task => {
    console.log(`- [${task.status}] ${task.id}: ${task.description}`);
  });

  console.log("---\n");
}

async function demonstrateToolUsage() {
  console.log("🔧 Tool Usage Example\n");

  const toolManager = new ToolManager();

  // Show available tools
  console.log("Available Tools:");
  const tools = toolManager.getAvailableTools();
  tools.slice(0, 5).forEach(tool => {
    console.log(`- ${tool.name}: ${tool.description} (Category: ${tool.category})`);
  });

  console.log("\nAnalyzing text...");

  // Use text analysis tool
  const textResult = await toolManager.useTool(
    "text_analyze",
    "The quick brown fox jumps over the lazy dog. This is a sample text for analysis."
  );

  console.log("Text Analysis Result:");
  console.log(textResult.summary);

  console.log("\nPerforming calculation...");

  // Use math tool
  const mathResult = await toolManager.useTool("math_calculate", "15 * 7 + 25");
  console.log(`Math Result: ${mathResult.expression} = ${mathResult.result}`);

  console.log("\nValidating data...");

  // Use data validation tool
  const dataResult = await toolManager.useTool("data_validate", {
    data: { name: "John", age: 30, email: "john@example.com" },
  });

  console.log(`Data Validation: ${dataResult.isValid ? "Valid" : "Invalid"}`);
  console.log(`Data Type: ${dataResult.statistics.type}`);

  console.log("---\n");
}

async function demonstrateLoopDetection() {
  console.log("🔄 Loop Detection Example\n");

  const detector = new LoopDetector({ maxRetries: 3 });

  console.log("Simulating task executions...");

  // Simulate normal execution
  detector.recordExecution("normal_task", { attempt: 1 });
  console.log("Execution 1: normal_task - No loop detected");

  // Simulate potential loop
  detector.recordExecution("problematic_task", { data: "same_input" });
  detector.recordExecution("problematic_task", { data: "same_input" });
  detector.recordExecution("problematic_task", { data: "same_input" });

  const isInLoop = detector.isInLoop("problematic_task");
  console.log(`problematic_task loop status: ${isInLoop ? "LOOP DETECTED" : "No loop"}`);

  if (isInLoop) {
    console.log("\nGenerating help request...");
    const helpRequest = await detector.requestUserHelp("problematic_task");

    console.log(`Help Request ID: ${helpRequest.id}`);
    console.log(`Reason: ${helpRequest.requestReason}`);
    console.log("Suggested Actions:");
    helpRequest.suggestedActions.forEach((action, index) => {
      console.log(`  ${index + 1}. ${action}`);
    });
  }

  // Show statistics
  console.log("\nLoop Detection Statistics:");
  const stats = detector.getStatistics();
  console.log(`Total Executions: ${stats.totalExecutions}`);
  console.log(`Active Loops: ${stats.activeLoops}`);
  console.log(`Pending Help Requests: ${stats.pendingHelpRequests}`);

  console.log("---\n");
}

async function demonstrateIntegratedWorkflow() {
  console.log("🚀 Integrated Workflow Example\n");

  const planner = new TaskPlanner();
  const thinker = new SequentialThinker();
  const toolManager = new ToolManager();
  const detector = new LoopDetector();

  const objective = "Build a simple chat application";

  console.log(`Objective: ${objective}\n`);

  // Step 1: Think through the problem
  console.log("Step 1: Sequential thinking...");
  const thinkingSteps = await thinker.think(objective);
  console.log(`Generated ${thinkingSteps.length} thinking steps\n`);

  // Step 2: Create task plan
  console.log("Step 2: Creating task plan...");
  const tasks = await planner.createTaskPlan(objective);
  console.log(`Created ${tasks.length} tasks\n`);

  // Step 3: Get tool recommendations
  console.log("Step 3: Getting tool recommendations...");
  const recommendedTools = toolManager.recommendTools(objective);
  console.log(`Recommended ${recommendedTools.length} tools for this objective\n`);

  // Step 4: Execute tasks with monitoring
  console.log("Step 4: Executing tasks with loop monitoring...");

  for (const task of tasks.slice(0, 2)) {
    // Execute first 2 tasks as example
    console.log(`Executing: ${task.description}`);

    // Record execution for loop detection
    detector.recordExecution(task.id, { objective, timestamp: Date.now() });

    // Check for loops before execution
    if (detector.isInLoop(task.id)) {
      console.log(`⚠️  Loop detected for task ${task.id}, requesting help...`);
      await detector.requestUserHelp(task.id);
      continue;
    }

    // Execute the task
    const result = await planner.executeTask(task.id);
    console.log(`✅ Completed: ${result}\n`);
  }

  // Step 5: Show final status
  console.log("Step 5: Final status report...");
  const taskStatus = planner.getTaskStatus();
  const loopStats = detector.getStatistics();

  console.log("\nTask Completion Status:");
  taskStatus.forEach(task => {
    const status = task.status === "completed" ? "✅" : task.status === "in_progress" ? "🔄" : "⏳";
    console.log(`${status} ${task.description} (${task.status})`);
  });

  console.log(`\nLoop Detection Summary:`);
  console.log(`- Total executions monitored: ${loopStats.totalExecutions}`);
  console.log(`- Loops detected: ${loopStats.totalLoopsDetected}`);
  console.log(
    `- Help requests generated: ${loopStats.pendingHelpRequests + loopStats.resolvedHelpRequests}`
  );

  console.log("---\n");
}

async function demonstrateErrorHandling() {
  console.log("⚠️  Error Handling Examples\n");

  const planner = new TaskPlanner();
  const toolManager = new ToolManager();

  // Example 1: Invalid task execution
  try {
    await planner.executeTask("nonexistent_task_123");
  } catch (error) {
    console.log(`✅ Caught expected error: ${error.message}`);
  }

  // Example 2: Invalid tool usage
  try {
    await toolManager.useTool("nonexistent_tool", "test input");
  } catch (error) {
    console.log(`✅ Caught expected error: ${error.message}`);
  }

  // Example 3: Invalid math expression
  const mathResult = await toolManager.useTool("math_calculate", "invalid + expression * @#$");
  console.log(
    `✅ Handled invalid math gracefully: ${mathResult.isValid ? "Valid" : "Invalid"} - ${mathResult.error || "No error"}`
  );

  console.log("---\n");
}

// Main execution
async function runAllExamples() {
  console.log("🎯 Aden MCP Server - Complete Usage Examples\n");
  console.log("=".repeat(50) + "\n");

  try {
    await demonstrateSequentialThinking();
    await demonstrateTaskPlanning();
    await demonstrateToolUsage();
    await demonstrateLoopDetection();
    await demonstrateIntegratedWorkflow();
    await demonstrateErrorHandling();

    console.log("🎉 All examples completed successfully!");
    console.log("\nTo use this MCP server:");
    console.log("1. Run: npm install");
    console.log("2. Start server: npm start");
    console.log("3. Connect your MCP client to stdio");
    console.log("\nFor testing: npm test");
  } catch (error) {
    console.error("❌ Error running examples:", error.message);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}
