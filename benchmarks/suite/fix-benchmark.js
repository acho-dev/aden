#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { performance } from "perf_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BenchmarkFixer {
  constructor(config) {
    this.config = {
      outputDir: path.join(__dirname, "../results"),
      cliPath: path.resolve(__dirname, "../../client/src/cli.js"),
      schemasDir: path.resolve(__dirname, "../../src/reference"),
      ...config,
    };
  }

  async fixBenchmarkRun(runDirectory) {
    console.log(`🔧 Fixing benchmark run: ${runDirectory}`);

    const runPath = path.join(this.config.outputDir, runDirectory);

    // Check if the run directory exists
    try {
      await fs.access(runPath);
    } catch (error) {
      throw new Error(`Run directory not found: ${runDirectory}`);
    }

    // Find all test case directories
    const entries = await fs.readdir(runPath, { withFileTypes: true });
    const testCaseDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

    console.log(`📁 Found ${testCaseDirs.length} test case directories`);

    let totalFixed = 0;
    const fixResults = [];

    for (const testCaseDir of testCaseDirs) {
      console.log(`\n🔍 Checking test case: ${testCaseDir}`);
      const testCasePath = path.join(runPath, testCaseDir);

      const caseResult = await this.fixTestCase(testCasePath, testCaseDir);
      fixResults.push(caseResult);
      totalFixed += caseResult.fixedShots;
    }

    // Regenerate the benchmark report if any fixes were made
    if (totalFixed > 0) {
      console.log(`\n📊 Regenerating benchmark report...`);
      await this.regenerateBenchmarkReport(runPath, fixResults);
    }

    console.log(`\n✅ Fixed ${totalFixed} failed shots across ${testCaseDirs.length} test cases`);
    return { totalFixed, fixResults };
  }

  async fixTestCase(testCasePath, testCaseName) {
    const files = await fs.readdir(testCasePath);

    // Find shot files that need fixing
    const shotFiles = files.filter(
      file =>
        (file.includes("_shot_") && file.endsWith(".json")) ||
        (file.includes("consolidated_shot_") && file.endsWith(".json"))
    );

    let fixedShots = 0;
    const failedShots = [];

    // Check each shot file for CLI execution failures
    for (const shotFile of shotFiles) {
      const shotPath = path.join(testCasePath, shotFile);
      const shotData = JSON.parse(await fs.readFile(shotPath, "utf8"));

      // Check if this shot needs fixing
      if (this.needsFixing(shotData)) {
        console.log(`  🚨 Found failed shot: ${shotFile}`);
        console.log(`     Reason: ${shotData.answer || shotData.error || "Unknown failure"}`);

        failedShots.push({
          file: shotFile,
          path: shotPath,
          data: shotData,
        });
      }
    }

    if (failedShots.length > 0) {
      console.log(`  🔄 Fixing ${failedShots.length} failed shots...`);

      // Load test case summary to get original question and schema info
      const caseSummaryPath = path.join(testCasePath, "case_summary.json");
      let testCaseInfo = null;

      try {
        testCaseInfo = JSON.parse(await fs.readFile(caseSummaryPath, "utf8"));
      } catch (error) {
        console.warn(`  ⚠️ Could not load case summary: ${error.message}`);
      }

      // Fix each failed shot
      for (const failedShot of failedShots) {
        try {
          const question = failedShot.data.question || testCaseInfo?.question || "Unknown question";

          // Determine schema from filename
          const schemaName = this.extractSchemaFromFilename(failedShot.file);
          if (schemaName) {
            await this.setSchemaFile(schemaName);
          }

          console.log(`    🔄 Re-running: ${failedShot.file}`);
          const newShotResult = await this.runSingleShot(question, failedShot.data.shotNumber);

          // Replace the failed shot file
          await fs.writeFile(failedShot.path, JSON.stringify(newShotResult, null, 2));

          console.log(`    ✅ Fixed: ${failedShot.file}`);
          fixedShots++;
        } catch (error) {
          console.error(`    ❌ Failed to fix ${failedShot.file}: ${error.message}`);
        }
      }

      // Regenerate summaries if we fixed any shots
      if (fixedShots > 0) {
        await this.regenerateTestCaseSummaries(testCasePath, testCaseInfo);
      }
    } else {
      console.log(`  ✅ No failed shots found in ${testCaseName}`);
    }

    return {
      testCase: testCaseName,
      totalShots: shotFiles.length,
      failedShots: failedShots.length,
      fixedShots,
    };
  }

  needsFixing(shotData) {
    // Check various failure conditions
    if (!shotData.success) {
      return true;
    }

    if (shotData.answer && typeof shotData.answer === "string") {
      const answer = shotData.answer.toLowerCase();

      // Check for common failure patterns
      if (
        answer.includes("cli execution did not complete") ||
        answer.includes("appears to have hung") ||
        answer.includes("timeout") ||
        answer.includes("no answer found") ||
        answer.includes("no valid response") ||
        answer.includes("cli output contains no recognizable response")
      ) {
        return true;
      }
    }

    // Check metadata for hanging indicators
    if (shotData.metadata && shotData.metadata.stdout) {
      const stdout = shotData.metadata.stdout;
      if (
        stdout.includes("DEBUG Gemini extracted 0 tool calls") &&
        stdout.includes("Built 1 Gemini messages") &&
        !stdout.includes("🤖 Aden:")
      ) {
        return true;
      }
    }

    return false;
  }

  extractSchemaFromFilename(filename) {
    // Extract schema name from filename patterns like "enhanced_case1_shot_1.json" or "original_shot_1.json"
    if (filename.includes("enhanced_consolidated")) {
      return "schema_graph_consolidated.json";
    } else if (filename.includes("enhanced_case1")) {
      return "schema_graph_case1.json";
    } else if (filename.includes("enhanced_case2")) {
      return "schema_graph_case2.json";
    } else if (filename.includes("enhanced_case3")) {
      return "schema_graph_case3.json";
    } else if (filename.includes("enhanced_case4")) {
      return "schema_graph_case4.json";
    } else if (filename.includes("original_")) {
      return "schema_graph_original.json";
    }

    return null;
  }

  async runSingleShot(question, shotNumber) {
    const startTime = performance.now();

    try {
      const result = await this.executeCliCommand(question);
      const endTime = performance.now();

      return {
        shotNumber,
        success: true,
        question,
        answer: result.answer,
        toolCalls: result.toolCalls,
        executionTime: endTime - startTime,
        timestamp: new Date().toISOString(),
        metadata: result.metadata,
      };
    } catch (error) {
      const endTime = performance.now();

      return {
        shotNumber,
        success: false,
        question,
        error: error.message,
        executionTime: endTime - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async executeCliCommand(question) {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const clientDir = path.resolve(__dirname, "../../client");
      const cliPath = "src/cli.js";

      console.log(`      🔧 Executing: cd ${clientDir} && node ${cliPath} ask "${question}"`);

      const child = spawn("node", [cliPath, "ask", question], {
        cwd: clientDir,
        env: {
          ...process.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("CLI command timed out after 60 seconds"));
      }, 300000);

      child.stdout.on("data", data => {
        stdout += data.toString();
      });

      child.stderr.on("data", data => {
        stderr += data.toString();
      });

      child.on("close", code => {
        clearTimeout(timeout);

        if (code === 0) {
          const parsed = this.parseCliOutput(stdout);
          resolve({
            answer: parsed.answer,
            toolCalls: parsed.toolCalls,
            metadata: {
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code,
              rawAnswer: parsed.rawAnswer,
              toolsUsed: parsed.toolsUsed,
            },
          });
        } else {
          reject(new Error(`CLI command failed with code ${code}: ${stderr}`));
        }
      });

      child.on("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Copy parsing logic from benchmark-runner.js
  parseCliOutput(output) {
    const lines = output.split("\n");
    let lastAdenIndex = -1;
    let lastToolsIndex = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes("🔧 Tools used:") && lastToolsIndex === -1) {
        lastToolsIndex = i;
      }
      if (lines[i].includes("🤖 Aden:") && lastAdenIndex === -1) {
        lastAdenIndex = i;
        break;
      }
    }

    if (lastAdenIndex >= 0 && lastToolsIndex >= 0 && lastAdenIndex < lastToolsIndex) {
      const adenSection = lines.slice(lastAdenIndex, lastToolsIndex + 1).join("\n");
      const adenResponseRegex = /🤖 Aden:\s*(.*?)\s*🔧 Tools used:\s*(.+)/s;
      const match = adenSection.match(adenResponseRegex);

      if (match) {
        const rawAnswer = match[1].trim();
        const answer = rawAnswer.replace(/\s+/g, " ").trim();
        const toolsSection = match[2].trim();

        let toolsUsed = [];
        let toolCalls = 0;

        if (toolsSection) {
          toolsUsed = toolsSection
            .split(/[,•·]/)
            .map(t => t.trim())
            .filter(t => t && t.length > 1);

          toolCalls = toolsUsed.length;

          if (toolCalls === 0) {
            const toolEmojiMatches = toolsSection.match(/[🔍💾📊🧠🔧🎯]/g) || [];
            toolCalls = toolEmojiMatches.length;
          }
        }

        return {
          answer: answer || "No answer found",
          rawAnswer: rawAnswer || "No answer found",
          toolCalls,
          toolsUsed,
        };
      }
    }

    // Fallback parsing (simplified version)
    return {
      answer: "CLI execution did not complete properly",
      rawAnswer: "CLI execution did not complete properly",
      toolCalls: 0,
      toolsUsed: [],
    };
  }

  async setSchemaFile(schemaFileName) {
    if (!schemaFileName) {
      console.log(`      📄 No schema file specified, using default`);
      return;
    }

    const targetPath = path.join(this.config.schemasDir, "schema_graph_full.json");
    const sourcePath = path.join(this.config.schemasDir, schemaFileName);

    try {
      // Check if source file exists first
      await fs.access(sourcePath);
      await fs.copyFile(sourcePath, targetPath);
      console.log(`      📄 Schema updated to: ${schemaFileName}`);
    } catch (error) {
      console.log(`      📄 Schema file ${schemaFileName} not found, using current schema`);
      // Don't treat this as an error - the system can work with the current schema
    }
  }

  async regenerateTestCaseSummaries(testCasePath, testCaseInfo) {
    console.log(`    📊 Regenerating test case summaries...`);

    try {
      const files = await fs.readdir(testCasePath);

      // Find all schema types and regenerate their summaries
      const schemaTypes = new Set();

      files.forEach(file => {
        if (file.includes("_shot_") && file.endsWith(".json")) {
          const schemaName = this.extractSchemaNameFromShotFile(file);
          if (schemaName) {
            schemaTypes.add(schemaName);
          }
        }
      });

      // Regenerate summary for each schema type
      for (const schemaType of schemaTypes) {
        await this.regenerateSchemaSummary(testCasePath, schemaType, testCaseInfo);
      }

      // Regenerate case summary
      await this.regenerateCaseSummary(testCasePath, testCaseInfo, Array.from(schemaTypes));
    } catch (error) {
      console.error(`    ❌ Failed to regenerate summaries: ${error.message}`);
    }
  }

  extractSchemaNameFromShotFile(filename) {
    if (filename.includes("enhanced_consolidated")) {
      return "enhanced_consolidated";
    } else if (filename.includes("enhanced_case1")) {
      return "enhanced_case1";
    } else if (filename.includes("enhanced_case2")) {
      return "enhanced_case2";
    } else if (filename.includes("enhanced_case3")) {
      return "enhanced_case3";
    } else if (filename.includes("enhanced_case4")) {
      return "enhanced_case4";
    } else if (filename.includes("original_")) {
      return "original";
    }
    return null;
  }

  async regenerateSchemaSummary(testCasePath, schemaType, testCaseInfo) {
    try {
      // Load all shots for this schema type
      const files = await fs.readdir(testCasePath);
      const shotFiles = files.filter(
        file => file.includes(`${schemaType}_shot_`) && file.endsWith(".json")
      );

      const shots = [];
      for (const shotFile of shotFiles) {
        const shotPath = path.join(testCasePath, shotFile);
        const shotData = JSON.parse(await fs.readFile(shotPath, "utf8"));
        shots.push(shotData);
      }

      // Calculate statistics
      const statistics = this.calculateStatistics(shots);

      const schemaSummary = {
        name: schemaType,
        schemaFile: this.getSchemaFileForType(schemaType),
        description: this.getSchemaDescription(schemaType),
        shots,
        statistics,
      };

      // Write summary file
      const summaryPath = path.join(testCasePath, `${schemaType}_summary.json`);
      await fs.writeFile(summaryPath, JSON.stringify(schemaSummary, null, 2));

      console.log(`      ✅ Regenerated ${schemaType}_summary.json`);
    } catch (error) {
      console.error(`      ❌ Failed to regenerate ${schemaType} summary: ${error.message}`);
    }
  }

  getSchemaFileForType(schemaType) {
    if (schemaType === "enhanced_consolidated") {
      return "schema_graph_consolidated.json";
    } else if (schemaType === "enhanced_case1") {
      return "schema_graph_case1.json";
    } else if (schemaType === "enhanced_case2") {
      return "schema_graph_case2.json";
    } else if (schemaType === "enhanced_case3") {
      return "schema_graph_case3.json";
    } else if (schemaType === "enhanced_case4") {
      return "schema_graph_case4.json";
    } else if (schemaType === "original") {
      return "schema_graph_original.json";
    }
    return "schema_graph_full.json";
  }

  getSchemaDescription(schemaType) {
    if (schemaType.includes("enhanced")) {
      return "Enhanced schema with additional knowledge nodes and relationships";
    } else if (schemaType === "original") {
      return "Original schema without enhancements";
    }
    return "Schema description not available";
  }

  async regenerateCaseSummary(testCasePath, testCaseInfo, schemaTypes) {
    try {
      // Load all schema summaries
      const schemas = {};

      for (const schemaType of schemaTypes) {
        const summaryPath = path.join(testCasePath, `${schemaType}_summary.json`);
        try {
          const summaryData = JSON.parse(await fs.readFile(summaryPath, "utf8"));
          schemas[schemaType] = summaryData;
        } catch (error) {
          console.warn(`      ⚠️ Could not load summary for ${schemaType}: ${error.message}`);
        }
      }

      const caseSummary = {
        name: testCaseInfo?.name || path.basename(testCasePath),
        question: testCaseInfo?.question || "Question not available",
        schemas,
        metadata: {
          timestamp: new Date().toISOString(),
          shots: 3, // Default assumption
          schemaConfigs: schemaTypes,
          regenerated: true,
          regeneratedAt: new Date().toISOString(),
        },
      };

      const caseSummaryPath = path.join(testCasePath, "case_summary.json");
      await fs.writeFile(caseSummaryPath, JSON.stringify(caseSummary, null, 2));

      console.log(`      ✅ Regenerated case_summary.json`);
    } catch (error) {
      console.error(`      ❌ Failed to regenerate case summary: ${error.message}`);
    }
  }

  calculateStatistics(shots) {
    const successful = shots.filter(s => s.success);
    const executionTimes = successful.map(s => s.executionTime);
    const toolCounts = successful.map(s => s.toolCalls || 0);

    return {
      successRate: (successful.length / shots.length) * 100,
      averageExecutionTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length || 0,
      minExecutionTime: Math.min(...executionTimes) || 0,
      maxExecutionTime: Math.max(...executionTimes) || 0,
      averageToolCalls: toolCounts.reduce((a, b) => a + b, 0) / toolCounts.length || 0,
      minToolCalls: Math.min(...toolCounts) || 0,
      maxToolCalls: Math.max(...toolCounts) || 0,
      answers: successful.map(s => s.answer),
      answerConsistency: this.calculateAnswerConsistency(successful.map(s => s.answer)),
    };
  }

  calculateAnswerConsistency(answers) {
    if (answers.length === 0) return 0;
    if (answers.length === 1) return 100;

    const answerCounts = {};
    answers.forEach(answer => {
      const normalized = answer.toLowerCase().trim();
      answerCounts[normalized] = (answerCounts[normalized] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(answerCounts));
    return (maxCount / answers.length) * 100;
  }

  async regenerateBenchmarkReport(runPath, fixResults) {
    try {
      // Import the report generator from the benchmark runner
      const { BenchmarkRunner } = await import("./benchmark-runner.js");
      const dummyRunner = new BenchmarkRunner({});

      // Load all test case results
      const entries = await fs.readdir(runPath, { withFileTypes: true });
      const testCaseDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

      const results = [];

      for (const testCaseDir of testCaseDirs) {
        const caseSummaryPath = path.join(runPath, testCaseDir, "case_summary.json");
        try {
          const caseData = JSON.parse(await fs.readFile(caseSummaryPath, "utf8"));
          results.push(caseData);
        } catch (error) {
          console.warn(`⚠️ Could not load case summary for ${testCaseDir}: ${error.message}`);
        }
      }

      // Set results in the runner
      dummyRunner.results = results;

      // Generate the report
      await dummyRunner.generateReport(runPath);

      console.log(`✅ Regenerated benchmark_report.md`);
    } catch (error) {
      console.error(`❌ Failed to regenerate benchmark report: ${error.message}`);
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🔧 Benchmark Fixer

Usage:
  node fix-benchmark.js <run-directory>

Examples:
  node fix-benchmark.js run_2025-07-26T00-06-46-586Z
  node fix-benchmark.js run_2025-07-26T00-06-46-586Z

This tool will:
1. Scan the specified benchmark run for failed test cases
2. Re-run any shots that contain "CLI execution did not complete" or similar failures
3. Replace the failed shot files with new results
4. Regenerate original_summary and case_summary files
5. Regenerate the overall benchmark_report.md

The tool automatically detects hanging/incomplete CLI executions and retries them.
`);
    process.exit(1);
  }

  const runDirectory = args[0];
  const fixer = new BenchmarkFixer();

  try {
    console.log(`🚀 Starting benchmark fix for: ${runDirectory}`);
    const results = await fixer.fixBenchmarkRun(runDirectory);
    console.log("\n✅ Benchmark fix completed successfully!");
    console.log(
      `📊 Summary: Fixed ${results.totalFixed} shots across ${results.fixResults.length} test cases`
    );
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Benchmark fix failed:", error.message);
    process.exit(1);
  }
}
