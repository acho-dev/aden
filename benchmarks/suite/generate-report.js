#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PartialBenchmarkReportGenerator {
  constructor() {
    this.results = [];
  }

  async loadPartialResults(resultDir) {
    const entries = await fs.readdir(resultDir, { withFileTypes: true });
    const testCaseEntries = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'));
    
    for (const entry of testCaseEntries) {
      const testCasePath = path.join(resultDir, entry.name);
      try {
        const testResult = await this.loadTestCase(testCasePath, entry.name);
        if (testResult) {
          this.results.push(testResult);
        }
      } catch (error) {
        console.warn(`Skipping ${entry.name}: ${error.message}`);
      }
    }
    
    return this.results;
  }

  async loadTestCase(testCasePath, testName) {
    const files = await fs.readdir(testCasePath);
    
    // Look for case summary
    let question = testName;
    const caseSummaryPath = path.join(testCasePath, 'case_summary.json');
    try {
      const caseSummary = JSON.parse(await fs.readFile(caseSummaryPath, 'utf8'));
      question = caseSummary.question;
    } catch (e) {
      // No case summary, skip or use test name
    }
    
    // Find schema summaries
    const schemaSummaries = files.filter(file => file.endsWith('_summary.json') && file !== 'case_summary.json');
    
    if (schemaSummaries.length === 0) {
      console.warn(`No schema summaries found for ${testName}`);
      return null;
    }
    
    const schemas = {};
    for (const summaryFile of schemaSummaries) {
      const schemaName = summaryFile.replace('_summary.json', '');
      const summaryPath = path.join(testCasePath, summaryFile);
      
      try {
        const schemaData = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
        schemas[schemaName] = schemaData;
      } catch (error) {
        console.warn(`Error loading ${summaryFile}: ${error.message}`);
      }
    }
    
    return {
      name: testName,
      question,
      schemas
    };
  }

  compareSchemas(schemas) {
    const schemaNames = Object.keys(schemas);
    
    // Look for original vs enhanced comparison
    let originalSchema = null;
    let enhancedSchema = null;
    
    for (const name of schemaNames) {
      if (name === 'original') {
        originalSchema = schemas[name];
      } else if (name.startsWith('enhanced_')) {
        enhancedSchema = schemas[name];
      }
    }
    
    if (!originalSchema || !enhancedSchema) {
      return null;
    }
    
    const orig = originalSchema.statistics;
    const enh = enhancedSchema.statistics;
    
    const timeDelta = enh.averageExecutionTime - orig.averageExecutionTime;
    const toolsDelta = enh.averageToolCalls - orig.averageToolCalls;
    const successDelta = enh.successRate - orig.successRate;
    const consistencyDelta = enh.answerConsistency - orig.answerConsistency;
    
    return {
      original: {
        avgTime: Math.round(orig.averageExecutionTime),
        avgTools: orig.averageToolCalls.toFixed(1),
        successRate: orig.successRate.toFixed(0),
        consistency: orig.answerConsistency.toFixed(0)
      },
      enhanced: {
        avgTime: Math.round(enh.averageExecutionTime),
        avgTools: enh.averageToolCalls.toFixed(1),
        successRate: enh.successRate.toFixed(0),
        consistency: enh.answerConsistency.toFixed(0)
      },
      timeDelta: Math.round(timeDelta),
      toolsDelta: toolsDelta.toFixed(1),
      successDelta: successDelta.toFixed(1),
      consistencyDelta: consistencyDelta.toFixed(1),
      timeImpact: timeDelta < 0 ? '🟢 Faster' : timeDelta > 0 ? '🔴 Slower' : '⚪ Same',
      toolsImpact: toolsDelta < 0 ? '🟢 Fewer tools' : toolsDelta > 0 ? '🔴 More tools' : '⚪ Same',
      successImpact: successDelta > 0 ? '🟢 Better' : successDelta < 0 ? '🔴 Worse' : '⚪ Same',
      consistencyImpact: consistencyDelta > 0 ? '🟢 More consistent' : consistencyDelta < 0 ? '🔴 Less consistent' : '⚪ Same',
      overallAssessment: this.assessOverall(timeDelta, toolsDelta, successDelta, consistencyDelta)
    };
  }

  assessOverall(timeDelta, toolsDelta, successDelta, consistencyDelta) {
    let score = 0;
    
    // Weight factors: success > consistency > time > tools
    if (successDelta > 0) score += 3;
    else if (successDelta < 0) score -= 3;
    
    if (consistencyDelta > 5) score += 2;
    else if (consistencyDelta < -5) score -= 2;
    
    if (timeDelta < -5000) score += 1;
    else if (timeDelta > 10000) score -= 1;
    
    if (toolsDelta < -1) score += 1;
    else if (toolsDelta > 2) score -= 1;
    
    if (score >= 3) return "Enhanced schema shows significant improvement";
    else if (score >= 1) return "Enhanced schema shows moderate improvement";
    else if (score <= -3) return "Original schema performs significantly better";
    else if (score <= -1) return "Original schema performs moderately better";
    else return "Schemas show comparable performance";
  }

  calculateSummaryStats() {
    let totalComparisons = 0;
    let enhancedWins = 0;
    let totalImprovement = 0;
    
    for (const testResult of this.results) {
      const comparison = this.compareSchemas(testResult.schemas);
      if (comparison) {
        totalComparisons++;
        
        // Count as "win" if enhanced has better success rate or consistency
        if (parseFloat(comparison.successDelta) > 0 || 
            (parseFloat(comparison.successDelta) === 0 && parseFloat(comparison.consistencyDelta) > 0)) {
          enhancedWins++;
        }
        
        // Calculate improvement score (weighted)
        const improvement = 
          (parseFloat(comparison.successDelta) * 0.4) +
          (parseFloat(comparison.consistencyDelta) * 0.3) +
          (comparison.timeDelta < 0 ? 10 : -Math.abs(comparison.timeDelta / 1000)) * 0.2 +
          (parseFloat(comparison.toolsDelta) < 0 ? 5 : -Math.abs(parseFloat(comparison.toolsDelta))) * 0.1;
        
        totalImprovement += improvement;
      }
    }
    
    return {
      totalComparisons,
      enhancedWins,
      avgImprovement: totalComparisons > 0 ? totalImprovement / totalComparisons : 0
    };
  }

  async generateReport(resultDir) {
    await this.loadPartialResults(resultDir);
    
    let report = `# Benchmark Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Shots per test:** 3 (partial run)\n`;
    report += `**Results directory:** ${path.basename(resultDir)}\n\n`;
    
    // Executive Summary
    report += `## Executive Summary\n\n`;
    const summaryStats = this.calculateSummaryStats();
    report += `**Total Test Cases:** ${this.results.length}\n`;
    report += `**Average Performance Improvement:** ${summaryStats.avgImprovement.toFixed(1)}%\n`;
    report += `**Tests Where Enhanced Schema Performed Better:** ${summaryStats.enhancedWins}/${summaryStats.totalComparisons}\n`;
    report += `⚠️ **Note:** This is a partial run report generated from incomplete benchmark data.\n\n`;
    
    for (const testResult of this.results) {
      report += `## Test Case: ${testResult.name}\n\n`;
      report += `**Question:** ${testResult.question}\n\n`;
      
      // Schema Enhancement Impact Analysis
      const comparison = this.compareSchemas(testResult.schemas);
      if (comparison) {
        report += `### 📊 Schema Enhancement Impact\n\n`;
        report += `| Metric | Original | Enhanced | Improvement | Impact |\n`;
        report += `|--------|----------|----------|-------------|--------|\n`;
        report += `| Execution Time | ${comparison.original.avgTime}ms | ${comparison.enhanced.avgTime}ms | ${comparison.timeDelta > 0 ? '+' : ''}${comparison.timeDelta}ms | ${comparison.timeImpact} |\n`;
        report += `| Tool Calls | ${comparison.original.avgTools} | ${comparison.enhanced.avgTools} | ${comparison.toolsDelta > 0 ? '+' : ''}${comparison.toolsDelta} | ${comparison.toolsImpact} |\n`;
        report += `| Success Rate | ${comparison.original.successRate}% | ${comparison.enhanced.successRate}% | ${comparison.successDelta > 0 ? '+' : ''}${comparison.successDelta}% | ${comparison.successImpact} |\n`;
        report += `| Answer Consistency | ${comparison.original.consistency}% | ${comparison.enhanced.consistency}% | ${comparison.consistencyDelta > 0 ? '+' : ''}${comparison.consistencyDelta}% | ${comparison.consistencyImpact} |\n\n`;
        
        report += `**Overall Assessment:** ${comparison.overallAssessment}\n\n`;
      }
      
      // Create comparison table
      report += `### Results Comparison\n\n`;
      report += `| Schema | Avg Time (ms) | Avg Tool Calls | Success Rate | Answer Consistency | Sample Answer |\n`;
      report += `|--------|---------------|----------------|--------------|-------------------|---------------|\n`;
      
      for (const [schemaName, schemaResult] of Object.entries(testResult.schemas)) {
        const stats = schemaResult.statistics;
        const sampleAnswer = stats.answers && stats.answers[0] ? stats.answers[0] : 'N/A';
        // Keep sample answer truncated for table readability, but show full answers in detailed section
        const truncatedAnswer = sampleAnswer.length > 50 ? sampleAnswer.substring(0, 50) + '...' : sampleAnswer;
        report += `| ${schemaName} | ${stats.averageExecutionTime.toFixed(0)} | ${stats.averageToolCalls.toFixed(1)} | ${stats.successRate.toFixed(0)}% | ${stats.answerConsistency.toFixed(0)}% | ${truncatedAnswer} |\n`;
      }
      report += `\n`;
      
      // Detailed Results Section with Full Answers
      report += `### Detailed Results\n\n`;
      const schemaEntries = Object.entries(testResult.schemas);
      for (const [schemaName, schemaData] of schemaEntries) {
        report += `#### Schema: ${schemaName}\n\n`;
        report += `**Description:** Schema configuration not available from loaded data\n\n`;
        
        if (schemaData.shots && schemaData.shots.length > 0) {
          report += `**All Answers:**\n\n`;
          schemaData.shots.forEach((shot, index) => {
            const answer = shot.answer || 'No answer recorded';
            const toolCalls = shot.toolCalls || 0;
            // Show full answers without any truncation
            report += `${index + 1}. ${answer} (${toolCalls} tool calls)\n`;
          });
          report += `\n`;
        } else {
          report += `**No shots recorded**\n\n`;
        }
      }
    }
    
    // Additional insights
    report += `## Key Insights\n\n`;
    report += `### Performance Patterns\n`;
    let timeoutCount = 0;
    let avgTime = 0;
    let totalTests = 0;
    
    for (const testResult of this.results) {
      for (const [schemaName, schemaData] of Object.entries(testResult.schemas)) {
        if (schemaData.shots) {
          for (const shot of schemaData.shots) {
            totalTests++;
            avgTime += shot.executionTime || 0;
            if (shot.answer && shot.answer.includes('CLI execution did not complete')) {
              timeoutCount++;
            }
          }
        }
      }
    }
    
    if (totalTests > 0) {
      report += `- **Average execution time:** ${(avgTime / totalTests / 1000).toFixed(1)} seconds\n`;
      report += `- **Timeout/hang rate:** ${((timeoutCount / totalTests) * 100).toFixed(1)}%\n`;
    }
    
    if (timeoutCount > 0) {
      report += `- ⚠️ **High timeout rate detected** - This suggests CLI execution issues that may have been addressed in recent fixes\n`;
    }
    
    report += `\n---\n\n`;
    report += `*Report generated from partial benchmark run data. Some test cases may be incomplete.*\n`;
    
    return report;
  }
}

async function findLatestRun(resultsDir) {
  try {
    const entries = await fs.readdir(resultsDir, { withFileTypes: true });
    const runDirs = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('run_'))
      .map(entry => ({
        name: entry.name,
        path: path.join(resultsDir, entry.name),
        timestamp: entry.name.replace('run_', '')
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    return runDirs.length > 0 ? runDirs[0] : null;
  } catch (error) {
    throw new Error(`Failed to find latest run: ${error.message}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, runDir] = process.argv;
  
  try {
    let targetDir;
    
    if (runDir) {
      // Specific run directory provided
      targetDir = path.isAbsolute(runDir) ? runDir : path.join(process.cwd(), runDir);
    } else {
      // Find latest run
      const resultsDir = path.join(__dirname, '../results');
      const latestRun = await findLatestRun(resultsDir);
      
      if (!latestRun) {
        console.error('❌ No benchmark runs found in results directory');
        process.exit(1);
      }
      
      targetDir = latestRun.path;
      console.log(`📊 Generating report for latest run: ${latestRun.name}`);
    }
    
    // Check if directory exists
    try {
      await fs.access(targetDir);
    } catch (error) {
      console.error(`❌ Directory not found: ${targetDir}`);
      process.exit(1);
    }
    
    const generator = new PartialBenchmarkReportGenerator();
    const report = await generator.generateReport(targetDir);
    
    const outputPath = path.join(targetDir, 'benchmark_report.md');
    await fs.writeFile(outputPath, report);
    
    console.log(`✅ Benchmark report generated: ${outputPath}`);
    console.log(`📈 Summary: ${generator.results.length} test cases analyzed`);
    
    // Show path for easy access
    console.log(`\n📄 View report:`);
    console.log(`   cat "${outputPath}"`);
    
  } catch (error) {
    console.error(`❌ Error generating benchmark report: ${error.message}`);
    process.exit(1);
  }
}