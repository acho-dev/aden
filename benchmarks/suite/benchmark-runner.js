#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BenchmarkRunner {
  constructor(config) {
    this.config = {
      shotsPerTest: 3,
      outputDir: path.join(__dirname, '../results'),
      cliPath: path.resolve(__dirname, '../../client/src/cli.js'),
      schemasDir: path.resolve(__dirname, '../../src/reference'),
      ...config
    };
    
    this.results = [];
  }

  async run(testCases) {
    console.log('🚀 Starting benchmark suite...');
    
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultDir = path.join(this.config.outputDir, `run_${timestamp}`);
    await fs.mkdir(resultDir, { recursive: true });
    
    for (const testCase of testCases) {
      console.log(`\n📋 Running test case: ${testCase.name}`);
      const caseResults = await this.runTestCase(testCase, resultDir);
      this.results.push(caseResults);
    }
    
    // Generate comprehensive report
    const report = await this.generateReport(resultDir);
    console.log(`\n📊 Results saved to: ${resultDir}`);
    
    return {
      results: this.results,
      reportPath: path.join(resultDir, 'benchmark_report.md'),
      timestamp
    };
  }

  async runTestCase(testCase, resultDir) {
    const caseDir = path.join(resultDir, testCase.name.replace(/\s+/g, '_'));
    await fs.mkdir(caseDir, { recursive: true });
    
    const results = {
      name: testCase.name,
      question: testCase.question,
      schemas: {},
      metadata: {
        timestamp: new Date().toISOString(),
        shots: this.config.shotsPerTest,
        schemaConfigs: testCase.schemas.map(s => s.name)
      }
    };

    for (const schemaConfig of testCase.schemas) {
      console.log(`  🔧 Testing with schema: ${schemaConfig.name}`);
      
      // Update schema in DecisionContext
      await this.setSchemaFile(schemaConfig.file);
      
      const schemaResults = {
        name: schemaConfig.name,
        schemaFile: schemaConfig.file,
        description: schemaConfig.description,
        shots: [],
        statistics: {}
      };

      // Run multiple shots
      for (let shot = 1; shot <= this.config.shotsPerTest; shot++) {
        console.log(`    💫 Shot ${shot}/${this.config.shotsPerTest}`);
        
        const shotResult = await this.runSingleShot(testCase.question, shot);
        schemaResults.shots.push(shotResult);
        
        // Save individual shot result
        const shotFile = path.join(caseDir, `${schemaConfig.name}_shot_${shot}.json`);
        await fs.writeFile(shotFile, JSON.stringify(shotResult, null, 2));
      }

      // Calculate statistics
      schemaResults.statistics = this.calculateStatistics(schemaResults.shots);
      
      // Save schema results
      const schemaFile = path.join(caseDir, `${schemaConfig.name}_summary.json`);
      await fs.writeFile(schemaFile, JSON.stringify(schemaResults, null, 2));
      
      results.schemas[schemaConfig.name] = schemaResults;
    }
    
    // Save case results
    const caseFile = path.join(caseDir, 'case_summary.json');
    await fs.writeFile(caseFile, JSON.stringify(results, null, 2));
    
    return results;
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
        metadata: result.metadata
      };
    } catch (error) {
      const endTime = performance.now();
      
      return {
        shotNumber,
        success: false,
        question,
        error: error.message,
        executionTime: endTime - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  async executeCliCommand(question) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      
      // Use the client directory as working directory
      const clientDir = path.resolve(__dirname, '../../client');
      const cliPath = 'src/cli.js';  // Relative path from client directory
      
      console.log(`🔧 Executing: cd ${clientDir} && node ${cliPath} ask "${question}"`);
      
      const child = spawn('node', [cliPath, 'ask', question], {
        cwd: clientDir,  // Run from client directory
        env: { 
          ...process.env
          // Keep the original environment to ensure CLI works properly
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
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
              toolsUsed: parsed.toolsUsed
            }
          });
        } else {
          reject(new Error(`CLI command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  parseCliOutput(output) {
    // Look for the pattern: 🤖 Aden: ... 🔧 Tools used: ...
    // Use regex with newline matching since the answer might be on multiple lines
    // Find the LAST occurrence to avoid duplicates
    const lines = output.split('\n');
    let lastAdenIndex = -1;
    let lastToolsIndex = -1;
    
    // Find the last "🤖 Aden:" and corresponding "🔧 Tools used:"
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('🔧 Tools used:') && lastToolsIndex === -1) {
        lastToolsIndex = i;
      }
      if (lines[i].includes('🤖 Aden:') && lastAdenIndex === -1) {
        lastAdenIndex = i;
        break; // Stop at the last (most recent) Aden response
      }
    }
    
    if (lastAdenIndex >= 0 && lastToolsIndex >= 0 && lastAdenIndex < lastToolsIndex) {
      // Extract the section between the last Aden response and tools used
      const adenSection = lines.slice(lastAdenIndex, lastToolsIndex + 1).join('\n');
      const adenResponseRegex = /🤖 Aden:\s*(.*?)\s*🔧 Tools used:\s*(.+)/s;
      const match = adenSection.match(adenResponseRegex);
      
      if (match) {
        const rawAnswer = match[1].trim();
        const answer = rawAnswer.replace(/\s+/g, ' ').trim();
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
          answer: answer || 'No answer found',
          rawAnswer: rawAnswer || 'No answer found',
          toolCalls,
          toolsUsed
        };
      }
    }
    
    // Fallback to original regex approach if the above doesn't work
    const adenResponseRegex = /🤖 Aden:\s*(.*?)\s*🔧 Tools used:\s*([^\n]+)/s;
    const match = output.match(adenResponseRegex);
    
    let answer = '';
    let rawAnswer = '';
    let toolCalls = 0;
    let toolsUsed = [];
    
    if (match) {
      rawAnswer = match[1].trim();
      // Clean up the answer by removing extra whitespace and newlines
      answer = rawAnswer.replace(/\s+/g, ' ').trim();
      
      // Parse the tools section
      const toolsSection = match[2].trim();
      if (toolsSection) {
        // Split by common separators and clean up
        toolsUsed = toolsSection
          .split(/[,•·]/)
          .map(t => t.trim())
          .filter(t => t && t.length > 1);
        
        toolCalls = toolsUsed.length;
        
        // If no clear separation, count tool emojis
        if (toolCalls === 0) {
          const toolEmojiMatches = toolsSection.match(/[🔍💾📊🧠🔧🎯]/g) || [];
          toolCalls = toolEmojiMatches.length;
        }
      }
    } else {
      // Fallback parsing if the main regex doesn't match
      const lines = output.split('\n');
      
      // Find the Aden response line
      let adenLineIndex = -1;
      let toolsLineIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('🤖 Aden:')) {
          adenLineIndex = i;
        } else if (line.startsWith('🔧 Tools used:')) {
          toolsLineIndex = i;
          break;
        }
      }
      
      if (adenLineIndex >= 0) {
        // Extract the answer from the Aden line
        rawAnswer = lines[adenLineIndex].replace(/^🤖 Aden:\s*/, '').trim();
        answer = rawAnswer;
        
        // If there are additional lines before tools, include them
        if (toolsLineIndex > adenLineIndex + 1) {
          const additionalLines = [];
          for (let i = adenLineIndex + 1; i < toolsLineIndex; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('🐛') && !line.startsWith('🔐')) {
              additionalLines.push(line);
            }
          }
          if (additionalLines.length > 0) {
            rawAnswer += '\n' + additionalLines.join('\n');
            answer += ' ' + additionalLines.join(' ');
          }
        }
        
        // Parse tools if found
        if (toolsLineIndex >= 0) {
          const toolsLine = lines[toolsLineIndex];
          const toolsSection = toolsLine.replace(/^🔧 Tools used:\s*/, '').trim();
          
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
        }
      }
      
      // Ultimate fallback - try to find meaningful content
      if (!answer) {
        // Check if this appears to be an incomplete/hanging execution
        const hasHangingIndicators = output.includes('DEBUG Gemini extracted 0 tool calls') ||
                                   output.includes('Built 1 Gemini messages') ||
                                   output.includes('DecisionExecutor timeout');
        
        if (hasHangingIndicators) {
          answer = 'CLI execution did not complete - appears to have hung during processing';
          rawAnswer = 'CLI execution did not complete - appears to have hung during processing';
        } else {
          const substantialLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   !trimmed.startsWith('🔐') && 
                   !trimmed.startsWith('🐛') && 
                   !trimmed.startsWith('⠋') &&
                   !trimmed.startsWith('⠹') &&
                   !trimmed.startsWith('✅') &&
                   !trimmed.startsWith('🔧') &&
                   !trimmed.startsWith('📄') &&
                   !trimmed.startsWith('🔍') &&
                   !trimmed.startsWith('💭') &&
                   !trimmed.startsWith('⚡') &&
                   !trimmed.startsWith('Removed') &&
                   !trimmed.startsWith('Disconnected') &&
                   !trimmed.startsWith('-') &&
                   !trimmed.includes('Connecting to MCP') &&
                   !trimmed.includes('MCP Server running') &&
                   !trimmed.includes('Connected to MCP') &&
                   !trimmed.includes('Processing with Decision') &&
                   !trimmed.includes('DEBUG') &&
                   !trimmed.includes('GEMINI') &&
                   !trimmed.includes('Available tools:') &&
                   !trimmed.includes('DecisionExecutor') &&
                   !trimmed.includes('Generated initial plan') &&
                   !trimmed.includes('session ID:') &&
                   !trimmed.includes('Built 1 Gemini messages') &&
                   !trimmed.includes('Input messages:') &&
                   !trimmed.includes('Added string message:') &&
                   !trimmed.includes('extracted 0 tool calls') &&
                   !trimmed.includes('Starting iterative execution') &&
                   !trimmed.includes('GapAnalysis Analysis Result') &&
                   !trimmed.includes('Tool execution') &&
                   !trimmed.includes('MCP tool') &&
                   !trimmed.includes('EXECUTING') &&
                   trimmed.length > 10 &&
                   trimmed.length < 200; // Avoid huge debug dumps
          });
          
          if (substantialLines.length > 0) {
            // Find the actual answer - look for the last meaningful content line
            let bestAnswer = '';
            for (let i = substantialLines.length - 1; i >= 0; i--) {
              const line = substantialLines[i].trim();
              // Additional filtering for natural language content
              if (!line.match(/^[\{\[]/) && // Avoid JSON
                  (!line.includes(':') || line.includes('?') || line.includes('.'))) { // Prefer natural language
                bestAnswer = line;
                break;
              }
            }
            
            answer = bestAnswer || 'CLI output contains no recognizable response';
            rawAnswer = answer;
          } else {
            answer = 'No valid response found in CLI output';
            rawAnswer = 'No valid response found in CLI output';
          }
        }
      }
    }
    
    return {
      answer: answer || 'No answer found',
      rawAnswer: rawAnswer || 'No answer found',
      toolCalls,
      toolsUsed
    };
  }

  async setSchemaFile(schemaFileName) {
    const targetPath = path.join(this.config.schemasDir, 'schema_graph_full.json');
    const sourcePath = path.join(this.config.schemasDir, schemaFileName);
    
    // Copy the specified schema file to the target location
    try {
      await fs.copyFile(sourcePath, targetPath);
      console.log(`    📄 Schema updated to: ${schemaFileName}`);
    } catch (error) {
      throw new Error(`Failed to update schema file: ${error.message}`);
    }
  }

  calculateStatistics(shots) {
    const successful = shots.filter(s => s.success);
    const executionTimes = successful.map(s => s.executionTime);
    const toolCounts = successful.map(s => s.toolCalls);
    
    return {
      successRate: (successful.length / shots.length) * 100,
      averageExecutionTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length || 0,
      minExecutionTime: Math.min(...executionTimes) || 0,
      maxExecutionTime: Math.max(...executionTimes) || 0,
      averageToolCalls: toolCounts.reduce((a, b) => a + b, 0) / toolCounts.length || 0,
      minToolCalls: Math.min(...toolCounts) || 0,
      maxToolCalls: Math.max(...toolCounts) || 0,
      answers: successful.map(s => s.answer),
      answerConsistency: this.calculateAnswerConsistency(successful.map(s => s.answer))
    };
  }

  calculateAnswerConsistency(answers) {
    if (answers.length === 0) return 0;
    if (answers.length === 1) return 100;
    
    // Simple consistency check - count how many answers are identical
    const answerCounts = {};
    answers.forEach(answer => {
      const normalized = answer.toLowerCase().trim();
      answerCounts[normalized] = (answerCounts[normalized] || 0) + 1;
    });
    
    const maxCount = Math.max(...Object.values(answerCounts));
    return (maxCount / answers.length) * 100;
  }

  async generateReport(resultDir) {
    const reportPath = path.join(resultDir, 'benchmark_report.md');
    
    let report = `# Benchmark Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Shots per test:** ${this.config.shotsPerTest}\n\n`;
    
    // Executive Summary
    report += `## Executive Summary\n\n`;
    const summaryStats = this.calculateSummaryStats();
    report += `**Total Test Cases:** ${this.results.length}\n`;
    report += `**Average Performance Improvement:** ${summaryStats.avgImprovement.toFixed(1)}%\n`;
    report += `**Tests Where Enhanced Schema Performed Better:** ${summaryStats.enhancedWins}/${summaryStats.totalComparisons}\n\n`;
    
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
        const sampleAnswer = stats.answers[0] || 'N/A';
        report += `| ${schemaName} | ${stats.averageExecutionTime.toFixed(0)} | ${stats.averageToolCalls.toFixed(1)} | ${stats.successRate.toFixed(0)}% | ${stats.answerConsistency.toFixed(0)}% | ${sampleAnswer.substring(0, 50)}... |\n`;
      }
      
      // Answer Quality Analysis
      if (comparison && comparison.answerDifference) {
        report += `\n### 🎯 Answer Quality Analysis\n\n`;
        report += `**Answer Differences:**\n`;
        report += `- **Original Schema:** ${comparison.answerDifference.originalSample}\n`;
        report += `- **Enhanced Schema:** ${comparison.answerDifference.enhancedSample}\n\n`;
        report += `**Key Improvements:** ${comparison.answerDifference.improvements.join(', ')}\n\n`;
      }
      
      report += `\n### Detailed Results\n\n`;
      
      for (const [schemaName, schemaResult] of Object.entries(testResult.schemas)) {
        report += `#### Schema: ${schemaName}\n\n`;
        report += `**Description:** ${schemaResult.description}\n\n`;
        
        report += `**All Answers:**\n`;
        schemaResult.shots.forEach((shot, index) => {
          if (shot.success) {
            report += `${index + 1}. ${shot.answer} (${shot.toolCalls} tool calls)\n`;
          } else {
            report += `${index + 1}. ERROR: ${shot.error}\n`;
          }
        });
        report += `\n`;
      }
      
      report += `---\n\n`;
    }
    
    // Overall Conclusions
    report += `## 📈 Overall Conclusions\n\n`;
    const conclusions = this.generateConclusions();
    report += conclusions;
    
    await fs.writeFile(reportPath, report);
    return reportPath;
  }

  compareSchemas(schemas) {
    const schemaNames = Object.keys(schemas);
    if (schemaNames.length < 2) return null;
    
    // Find original and enhanced schemas
    const originalSchema = schemas['original'] || schemas[schemaNames[0]];
    const enhancedSchema = schemas['enhanced_case1'] || schemas[schemaNames[1]];
    
    if (!originalSchema || !enhancedSchema) return null;
    
    const originalStats = originalSchema.statistics;
    const enhancedStats = enhancedSchema.statistics;
    
    // Calculate deltas
    const timeDelta = enhancedStats.averageExecutionTime - originalStats.averageExecutionTime;
    const toolsDelta = enhancedStats.averageToolCalls - originalStats.averageToolCalls;
    const successDelta = enhancedStats.successRate - originalStats.successRate;
    const consistencyDelta = enhancedStats.answerConsistency - originalStats.answerConsistency;
    
    // Generate impact assessments
    const timeImpact = timeDelta < -100 ? '🟢 Faster' : timeDelta > 100 ? '🔴 Slower' : '🟡 Similar';
    const toolsImpact = toolsDelta < -0.5 ? '🟢 More Efficient' : toolsDelta > 0.5 ? '🔴 Less Efficient' : '🟡 Similar';
    const successImpact = successDelta > 5 ? '🟢 Better' : successDelta < -5 ? '🔴 Worse' : '🟡 Similar';
    const consistencyImpact = consistencyDelta > 5 ? '🟢 More Consistent' : consistencyDelta < -5 ? '🔴 Less Consistent' : '🟡 Similar';
    
    // Overall assessment
    let overallAssessment = '';
    const improvements = [timeImpact, toolsImpact, successImpact, consistencyImpact].filter(i => i.includes('🟢')).length;
    const degradations = [timeImpact, toolsImpact, successImpact, consistencyImpact].filter(i => i.includes('🔴')).length;
    
    if (improvements > degradations) {
      overallAssessment = '🟢 Enhanced schema shows overall improvement';
    } else if (degradations > improvements) {
      overallAssessment = '🔴 Enhanced schema shows overall degradation';
    } else {
      overallAssessment = '🟡 Mixed results - no clear winner';
    }
    
    // Analyze answer differences
    const answerDifference = this.analyzeAnswerDifferences(originalStats.answers, enhancedStats.answers);
    
    return {
      original: {
        avgTime: originalStats.averageExecutionTime.toFixed(0),
        avgTools: originalStats.averageToolCalls.toFixed(1),
        successRate: originalStats.successRate.toFixed(0),
        consistency: originalStats.answerConsistency.toFixed(0)
      },
      enhanced: {
        avgTime: enhancedStats.averageExecutionTime.toFixed(0),
        avgTools: enhancedStats.averageToolCalls.toFixed(1),
        successRate: enhancedStats.successRate.toFixed(0),
        consistency: enhancedStats.answerConsistency.toFixed(0)
      },
      timeDelta: timeDelta.toFixed(0),
      toolsDelta: toolsDelta.toFixed(1),
      successDelta: successDelta.toFixed(0),
      consistencyDelta: consistencyDelta.toFixed(0),
      timeImpact,
      toolsImpact,
      successImpact,
      consistencyImpact,
      overallAssessment,
      answerDifference
    };
  }

  analyzeAnswerDifferences(originalAnswers, enhancedAnswers) {
    if (!originalAnswers.length || !enhancedAnswers.length) return null;
    
    const originalSample = originalAnswers[0];
    const enhancedSample = enhancedAnswers[0];
    
    const improvements = [];
    
    // Check for common improvements
    if (enhancedSample.length > originalSample.length) {
      improvements.push('More detailed response');
    }
    
    if (enhancedSample.includes('Based on') && !originalSample.includes('Based on')) {
      improvements.push('Better context awareness');
    }
    
    if (enhancedSample.includes('$') && originalSample.includes('$')) {
      // Both have monetary values - check if they're different
      const originalValue = originalSample.match(/\$[\d,]+/)?.[0];
      const enhancedValue = enhancedSample.match(/\$[\d,]+/)?.[0];
      if (originalValue !== enhancedValue) {
        improvements.push('Different calculation result');
      }
    }
    
    return {
      originalSample: originalSample.substring(0, 100) + '...',
      enhancedSample: enhancedSample.substring(0, 100) + '...',
      improvements: improvements.length ? improvements : ['No significant differences detected']
    };
  }

  calculateSummaryStats() {
    let totalComparisons = 0;
    let enhancedWins = 0;
    let totalImprovement = 0;
    
    for (const testResult of this.results) {
      const comparison = this.compareSchemas(testResult.schemas);
      if (comparison) {
        totalComparisons++;
        
        // Calculate composite performance score
        const originalScore = this.calculatePerformanceScore(comparison.original);
        const enhancedScore = this.calculatePerformanceScore(comparison.enhanced);
        
        if (enhancedScore > originalScore) {
          enhancedWins++;
        }
        
        const improvement = ((enhancedScore - originalScore) / originalScore) * 100;
        totalImprovement += improvement;
      }
    }
    
    return {
      totalComparisons,
      enhancedWins,
      avgImprovement: totalComparisons > 0 ? totalImprovement / totalComparisons : 0
    };
  }

  calculatePerformanceScore(stats) {
    // Composite score: faster time, fewer tools, higher success rate, higher consistency
    const timeScore = 1000 / Math.max(parseFloat(stats.avgTime), 1);
    const toolScore = 10 / Math.max(parseFloat(stats.avgTools), 1);
    const successScore = parseFloat(stats.successRate) / 100;
    const consistencyScore = parseFloat(stats.consistency) / 100;
    
    return (timeScore * 0.3) + (toolScore * 0.2) + (successScore * 0.3) + (consistencyScore * 0.2);
  }

  generateConclusions() {
    const summaryStats = this.calculateSummaryStats();
    
    let conclusions = '';
    
    if (summaryStats.avgImprovement > 5) {
      conclusions += '✅ **Schema enhancements show significant positive impact** - Enhanced schemas consistently outperform original schemas.\n\n';
    } else if (summaryStats.avgImprovement < -5) {
      conclusions += '❌ **Schema enhancements show negative impact** - Original schemas generally perform better.\n\n';
    } else {
      conclusions += '⚖️ **Mixed results** - Schema enhancements show variable impact across different use cases.\n\n';
    }
    
    conclusions += `### Key Findings:\n`;
    conclusions += `- Enhanced schema wins in ${summaryStats.enhancedWins} out of ${summaryStats.totalComparisons} test cases\n`;
    conclusions += `- Average performance change: ${summaryStats.avgImprovement.toFixed(1)}%\n`;
    
    if (summaryStats.avgImprovement > 0) {
      conclusions += `- **Recommendation:** Deploy enhanced schema to production\n`;
    } else {
      conclusions += `- **Recommendation:** Review and refine knowledge node additions\n`;
    }
    
    conclusions += `\n### Next Steps:\n`;
    conclusions += `1. Review individual test case results for insights\n`;
    conclusions += `2. Identify which types of questions benefit most from enhancements\n`;
    conclusions += `3. Consider iterative improvements to knowledge graph structure\n`;
    conclusions += `4. Run additional test cases to validate findings\n`;
    
    return conclusions;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const testCases = await import('./test-cases.js');
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let selectedTests = testCases.default;
  let shotsPerTest = 3;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    if (arg === '--shots' && nextArg) {
      shotsPerTest = parseInt(nextArg);
      i++; // Skip next argument
    } else if (arg === '--test' && nextArg) {
      // Filter to specific test case
      const testName = nextArg;
      selectedTests = testCases.default.filter(tc => 
        tc.name === testName || 
        tc.name.toLowerCase().includes(testName.toLowerCase())
      );
      if (selectedTests.length === 0) {
        console.error(`❌ No test cases found matching "${testName}"`);
        console.log('Available tests:', testCases.default.map(tc => tc.name).join(', '));
        process.exit(1);
      }
      i++; // Skip next argument
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
🔧 Benchmark Runner

Usage:
  node benchmark-runner.js [options]

Options:
  --shots <number>    Number of shots per test (default: 3)
  --test <name>       Run only tests matching this name
  --help, -h          Show this help

Examples:
  node benchmark-runner.js --shots 1
  node benchmark-runner.js --test "Revenue_Financial"
  node benchmark-runner.js --test "Work_Assignment" --shots 2

Available Tests:
${testCases.default.map(tc => `  - ${tc.name}`).join('\n')}
`);
      process.exit(0);
    }
  }
  
  const runner = new BenchmarkRunner({ shotsPerTest });
  
  try {
    console.log(`🚀 Running ${selectedTests.length} test case(s) with ${shotsPerTest} shot(s) each`);
    const results = await runner.run(selectedTests);
    console.log('\n✅ Benchmark suite completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Benchmark suite failed:', error.message);
    process.exit(1);
  }
}