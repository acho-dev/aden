#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

export class ResultAnalyzer {
  constructor() {
    this.results = [];
  }

  async loadResults(resultDir) {
    const entries = await fs.readdir(resultDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('run_')) {
        const runPath = path.join(resultDir, entry.name);
        const run = await this.loadSingleRun(runPath);
        this.results.push(run);
      }
    }
    
    return this.results;
  }

  async loadSingleRun(runPath) {
    const entries = await fs.readdir(runPath, { withFileTypes: true });
    const run = {
      path: runPath,
      timestamp: path.basename(runPath).replace('run_', ''),
      testCases: []
    };

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const casePath = path.join(runPath, entry.name);
        const summaryPath = path.join(casePath, 'case_summary.json');
        
        try {
          const summaryContent = await fs.readFile(summaryPath, 'utf8');
          const caseData = JSON.parse(summaryContent);
          run.testCases.push(caseData);
        } catch (error) {
          console.warn(`Could not load case summary from ${summaryPath}: ${error.message}`);
        }
      }
    }

    return run;
  }

  analyzePerformanceTrends() {
    const trends = {};
    
    // Group by test case name across all runs
    for (const run of this.results) {
      for (const testCase of run.testCases) {
        if (!trends[testCase.name]) {
          trends[testCase.name] = [];
        }
        
        trends[testCase.name].push({
          timestamp: run.timestamp,
          schemas: testCase.schemas
        });
      }
    }
    
    // Analyze trends for each test case
    const analysis = {};
    for (const [testName, runData] of Object.entries(trends)) {
      analysis[testName] = this.analyzeTestCaseTrend(runData);
    }
    
    return analysis;
  }

  analyzeTestCaseTrend(runData) {
    const schemaAnalysis = {};
    
    // Group by schema type
    for (const run of runData) {
      for (const [schemaName, schemaData] of Object.entries(run.schemas)) {
        if (!schemaAnalysis[schemaName]) {
          schemaAnalysis[schemaName] = {
            executionTimes: [],
            toolCalls: [],
            successRates: [],
            answerConsistencies: []
          };
        }
        
        const stats = schemaData.statistics;
        schemaAnalysis[schemaName].executionTimes.push(stats.averageExecutionTime);
        schemaAnalysis[schemaName].toolCalls.push(stats.averageToolCalls);
        schemaAnalysis[schemaName].successRates.push(stats.successRate);
        schemaAnalysis[schemaName].answerConsistencies.push(stats.answerConsistency);
      }
    }
    
    // Calculate trends
    const trends = {};
    for (const [schemaName, data] of Object.entries(schemaAnalysis)) {
      trends[schemaName] = {
        avgExecutionTime: this.calculateAverage(data.executionTimes),
        avgToolCalls: this.calculateAverage(data.toolCalls),
        avgSuccessRate: this.calculateAverage(data.successRates),
        avgAnswerConsistency: this.calculateAverage(data.answerConsistencies),
        executionTimeStdDev: this.calculateStdDev(data.executionTimes),
        toolCallsStdDev: this.calculateStdDev(data.toolCalls),
        dataPoints: data.executionTimes.length
      };
    }
    
    return trends;
  }

  compareSchemaPerformance() {
    const comparison = {};
    
    for (const run of this.results) {
      for (const testCase of run.testCases) {
        if (!comparison[testCase.name]) {
          comparison[testCase.name] = {
            schemas: {},
            comparisons: []
          };
        }
        
        const schemas = Object.keys(testCase.schemas);
        if (schemas.length >= 2) {
          // Compare all schema pairs
          for (let i = 0; i < schemas.length; i++) {
            for (let j = i + 1; j < schemas.length; j++) {
              const schema1 = schemas[i];
              const schema2 = schemas[j];
              const stats1 = testCase.schemas[schema1].statistics;
              const stats2 = testCase.schemas[schema2].statistics;
              
              const pairComparison = {
                timestamp: run.timestamp,
                schemas: [schema1, schema2],
                executionTimeDiff: stats2.averageExecutionTime - stats1.averageExecutionTime,
                toolCallsDiff: stats2.averageToolCalls - stats1.averageToolCalls,
                successRateDiff: stats2.successRate - stats1.successRate,
                consistencyDiff: stats2.answerConsistency - stats1.answerConsistency,
                performanceDelta: this.calculatePerformanceDelta(stats1, stats2)
              };
              
              comparison[testCase.name].comparisons.push(pairComparison);
            }
          }
        }
        
        // Store individual schema data
        for (const [schemaName, schemaData] of Object.entries(testCase.schemas)) {
          if (!comparison[testCase.name].schemas[schemaName]) {
            comparison[testCase.name].schemas[schemaName] = [];
          }
          comparison[testCase.name].schemas[schemaName].push({
            timestamp: run.timestamp,
            statistics: schemaData.statistics
          });
        }
      }
    }
    
    return comparison;
  }

  calculatePerformanceDelta(stats1, stats2) {
    // Weighted performance score (lower is better for time, higher for success/consistency)
    const score1 = (1 / stats1.averageExecutionTime) * 0.3 + 
                   (1 / stats1.averageToolCalls) * 0.2 + 
                   stats1.successRate * 0.25 + 
                   stats1.answerConsistency * 0.25;
                   
    const score2 = (1 / stats2.averageExecutionTime) * 0.3 + 
                   (1 / stats2.averageToolCalls) * 0.2 + 
                   stats2.successRate * 0.25 + 
                   stats2.answerConsistency * 0.25;
    
    return ((score2 - score1) / score1) * 100; // Percentage improvement
  }

  calculateAverage(values) {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  calculateStdDev(values) {
    if (values.length <= 1) return 0;
    
    const avg = this.calculateAverage(values);
    const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquaredDiff = this.calculateAverage(squaredDiffs);
    
    return Math.sqrt(avgSquaredDiff);
  }

  async generateTrendReport(outputPath) {
    const trends = this.analyzePerformanceTrends();
    const comparisons = this.compareSchemaPerformance();
    
    let report = `# Performance Trend Analysis Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Total Runs Analyzed:** ${this.results.length}\n\n`;
    
    // Overall trends summary
    report += `## Executive Summary\n\n`;
    
    for (const [testName, testTrends] of Object.entries(trends)) {
      report += `### ${testName}\n\n`;
      
      // Create performance comparison table
      report += `| Schema | Avg Execution Time | Avg Tool Calls | Success Rate | Answer Consistency | Stability |\n`;
      report += `|--------|------------------|----------------|--------------|-------------------|----------|\n`;
      
      for (const [schemaName, data] of Object.entries(testTrends)) {
        const stability = data.executionTimeStdDev < (data.avgExecutionTime * 0.1) ? '🟢 Stable' : '🟡 Variable';
        report += `| ${schemaName} | ${data.avgExecutionTime.toFixed(0)}ms | ${data.avgToolCalls.toFixed(1)} | ${data.avgSuccessRate.toFixed(0)}% | ${data.avgAnswerConsistency.toFixed(0)}% | ${stability} |\n`;
      }
      report += `\n`;
    }
    
    // Detailed comparisons
    report += `## Detailed Schema Comparisons\n\n`;
    
    for (const [testName, testComparison] of Object.entries(comparisons)) {
      if (testComparison.comparisons.length > 0) {
        report += `### ${testName}\n\n`;
        
        // Group comparisons by schema pair
        const pairGroups = {};
        for (const comparison of testComparison.comparisons) {
          const pairKey = comparison.schemas.join(' vs ');
          if (!pairGroups[pairKey]) {
            pairGroups[pairKey] = [];
          }
          pairGroups[pairKey].push(comparison);
        }
        
        for (const [pairKey, pairComparisons] of Object.entries(pairGroups)) {
          const avgDelta = this.calculateAverage(pairComparisons.map(c => c.performanceDelta));
          const winCount = pairComparisons.filter(c => c.performanceDelta > 0).length;
          
          report += `#### ${pairKey}\n\n`;
          report += `**Average Performance Delta:** ${avgDelta.toFixed(2)}%\n`;
          report += `**Enhanced Schema Wins:** ${winCount}/${pairComparisons.length} runs\n\n`;
          
          if (pairComparisons.length > 1) {
            report += `**Run Details:**\n`;
            pairComparisons.forEach(comparison => {
              const trend = comparison.performanceDelta > 0 ? '📈' : '📉';
              report += `- ${comparison.timestamp}: ${trend} ${comparison.performanceDelta.toFixed(2)}% delta\n`;
            });
            report += `\n`;
          }
        }
      }
    }
    
    // Recommendations
    report += `## Recommendations\n\n`;
    
    for (const [testName, testTrends] of Object.entries(trends)) {
      const schemaNames = Object.keys(testTrends);
      if (schemaNames.length >= 2) {
        const bestSchema = this.findBestPerformingSchema(testTrends);
        report += `### ${testName}\n`;
        report += `**Recommended Schema:** ${bestSchema.name}\n`;
        report += `**Reason:** ${bestSchema.reason}\n\n`;
      }
    }
    
    await fs.writeFile(outputPath, report);
    return outputPath;
  }

  findBestPerformingSchema(trends) {
    let bestSchema = null;
    let bestScore = -Infinity;
    let reason = '';
    
    for (const [schemaName, data] of Object.entries(trends)) {
      // Composite score favoring consistency and success rate
      const score = (data.avgSuccessRate * 0.4) + 
                   (data.avgAnswerConsistency * 0.4) + 
                   ((1000 / Math.max(data.avgExecutionTime, 1)) * 0.2);
      
      if (score > bestScore) {
        bestScore = score;
        bestSchema = schemaName;
        
        if (data.avgSuccessRate >= 95 && data.avgAnswerConsistency >= 90) {
          reason = 'High reliability and consistency';
        } else if (data.avgExecutionTime < 2000) {
          reason = 'Fast execution time';
        } else {
          reason = 'Best overall performance balance';
        }
      }
    }
    
    return { name: bestSchema, reason };
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, resultsDir, outputPath] = process.argv;
  
  if (!resultsDir) {
    console.error('Usage: node result-analyzer.js <results-directory> [output.md]');
    process.exit(1);
  }

  const analyzer = new ResultAnalyzer();
  
  try {
    await analyzer.loadResults(resultsDir);
    
    if (outputPath) {
      await analyzer.generateTrendReport(outputPath);
      console.log(`Trend analysis report saved to: ${outputPath}`);
    } else {
      const trends = analyzer.analyzePerformanceTrends();
      console.log(JSON.stringify(trends, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}