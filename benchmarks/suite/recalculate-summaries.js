#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SummaryRecalculator {
  constructor(config) {
    this.config = {
      outputDir: path.join(__dirname, '../results'),
      ...config
    };
  }

  async recalculateSummaries(runDirectory) {
    console.log(`📊 Recalculating summaries for: ${runDirectory}`);
    
    const runPath = path.join(this.config.outputDir, runDirectory);
    
    // Check if the run directory exists
    try {
      await fs.access(runPath);
    } catch (error) {
      throw new Error(`Run directory not found: ${runDirectory}`);
    }

    // Find all test case directories
    const entries = await fs.readdir(runPath, { withFileTypes: true });
    const testCaseDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    console.log(`📁 Found ${testCaseDirs.length} test case directories`);

    let totalRecalculated = 0;

    for (const testCaseDir of testCaseDirs) {
      console.log(`\n🔄 Processing test case: ${testCaseDir}`);
      const testCasePath = path.join(runPath, testCaseDir);
      
      const recalculated = await this.recalculateTestCase(testCasePath, testCaseDir);
      totalRecalculated += recalculated;
    }

    // Regenerate the benchmark report with corrected data
    console.log(`\n📊 Regenerating benchmark report...`);
    await this.regenerateBenchmarkReport(runPath);

    console.log(`\n✅ Recalculated ${totalRecalculated} summary files`);
    return totalRecalculated;
  }

  async recalculateTestCase(testCasePath, testCaseName) {
    try {
      // Load all shot files
      const files = await fs.readdir(testCasePath);
      const shotFiles = files.filter(file => 
        file.includes('_shot_') && file.endsWith('.json')
      );

      if (shotFiles.length === 0) {
        console.log(`  ⚠️ No shot files found in ${testCaseName}`);
        return 0;
      }

      // Group shots by schema type
      const schemaGroups = {};
      
      for (const shotFile of shotFiles) {
        const schemaType = this.extractSchemaFromFilename(shotFile);
        if (!schemaType) continue;

        if (!schemaGroups[schemaType]) {
          schemaGroups[schemaType] = [];
        }

        const shotPath = path.join(testCasePath, shotFile);
        const shotData = JSON.parse(await fs.readFile(shotPath, 'utf8'));
        schemaGroups[schemaType].push(shotData);
      }

      let recalculatedCount = 0;

      // Recalculate summary for each schema type
      for (const [schemaType, shots] of Object.entries(schemaGroups)) {
        const statistics = this.calculateStatistics(shots);
        
        const schemaSummary = {
          name: schemaType,
          schemaFile: this.getSchemaFileForType(schemaType),
          description: this.getSchemaDescription(schemaType),
          shots,
          statistics
        };

        // Write corrected summary file
        const summaryPath = path.join(testCasePath, `${schemaType}_summary.json`);
        await fs.writeFile(summaryPath, JSON.stringify(schemaSummary, null, 2));
        
        console.log(`  ✅ Recalculated ${schemaType}_summary.json (Success Rate: ${statistics.successRate.toFixed(1)}%)`);
        recalculatedCount++;
      }

      // Recalculate case summary
      await this.recalculateCaseSummary(testCasePath, testCaseName, Object.keys(schemaGroups));
      recalculatedCount++;

      return recalculatedCount;
      
    } catch (error) {
      console.error(`  ❌ Failed to recalculate ${testCaseName}: ${error.message}`);
      return 0;
    }
  }

  extractSchemaFromFilename(filename) {
    if (filename.includes('enhanced_consolidated')) {
      return 'enhanced_consolidated';
    } else if (filename.includes('enhanced_case1')) {
      return 'enhanced_case1';
    } else if (filename.includes('enhanced_case2')) {
      return 'enhanced_case2';
    } else if (filename.includes('enhanced_case3')) {
      return 'enhanced_case3';
    } else if (filename.includes('enhanced_case4')) {
      return 'enhanced_case4';
    } else if (filename.includes('original_')) {
      return 'original';
    }
    return null;
  }

  getSchemaFileForType(schemaType) {
    if (schemaType === 'enhanced_consolidated') {
      return 'schema_graph_consolidated.json';
    } else if (schemaType === 'enhanced_case1') {
      return 'schema_graph_case1.json';
    } else if (schemaType === 'enhanced_case2') {
      return 'schema_graph_case2.json';
    } else if (schemaType === 'enhanced_case3') {
      return 'schema_graph_case3.json';
    } else if (schemaType === 'enhanced_case4') {
      return 'schema_graph_case4.json';
    } else if (schemaType === 'original') {
      return 'schema_graph_original.json';
    }
    return 'schema_graph_full.json';
  }

  getSchemaDescription(schemaType) {
    if (schemaType.includes('enhanced')) {
      return 'Enhanced schema with additional knowledge nodes and relationships';
    } else if (schemaType === 'original') {
      return 'Original schema without enhancements';
    }
    return 'Schema description not available';
  }

  calculateStatistics(shots) {
    console.log(`    📊 Calculating stats for ${shots.length} shots`);
    
    // Count successful shots based on the success property
    const successful = shots.filter(s => s.success === true);
    console.log(`    ✅ ${successful.length} successful shots out of ${shots.length} total`);
    
    const executionTimes = successful.map(s => s.executionTime || 0);
    const toolCounts = successful.map(s => s.toolCalls || 0);
    
    const successRate = shots.length > 0 ? (successful.length / shots.length) * 100 : 0;
    
    return {
      successRate: successRate,
      averageExecutionTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length || 0,
      minExecutionTime: Math.min(...executionTimes) || 0,
      maxExecutionTime: Math.max(...executionTimes) || 0,
      averageToolCalls: toolCounts.reduce((a, b) => a + b, 0) / toolCounts.length || 0,
      minToolCalls: Math.min(...toolCounts) || 0,
      maxToolCalls: Math.max(...toolCounts) || 0,
      answers: successful.map(s => s.answer || s.error || 'No response'),
      answerConsistency: this.calculateAnswerConsistency(successful.map(s => s.answer || s.error || 'No response'))
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

  async recalculateCaseSummary(testCasePath, testCaseName, schemaTypes) {
    try {
      // Load all schema summaries
      const schemas = {};
      
      for (const schemaType of schemaTypes) {
        const summaryPath = path.join(testCasePath, `${schemaType}_summary.json`);
        try {
          const summaryData = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
          schemas[schemaType] = summaryData;
        } catch (error) {
          console.warn(`    ⚠️ Could not load summary for ${schemaType}: ${error.message}`);
        }
      }

      // Try to load existing case summary for question info
      let existingCaseSummary = null;
      try {
        const existingPath = path.join(testCasePath, 'case_summary.json');
        existingCaseSummary = JSON.parse(await fs.readFile(existingPath, 'utf8'));
      } catch (error) {
        // Ignore if doesn't exist
      }

      const caseSummary = {
        name: existingCaseSummary?.name || testCaseName,
        question: existingCaseSummary?.question || 'Question not available',
        schemas,
        metadata: {
          timestamp: new Date().toISOString(),
          shots: 3, // Default assumption
          schemaConfigs: schemaTypes,
          recalculated: true,
          recalculatedAt: new Date().toISOString()
        }
      };

      const caseSummaryPath = path.join(testCasePath, 'case_summary.json');
      await fs.writeFile(caseSummaryPath, JSON.stringify(caseSummary, null, 2));
      
      console.log(`  ✅ Recalculated case_summary.json`);
      
    } catch (error) {
      console.error(`  ❌ Failed to recalculate case summary: ${error.message}`);
    }
  }

  async regenerateBenchmarkReport(runPath) {
    try {
      // Import the report generator from the benchmark runner
      const { BenchmarkRunner } = await import('./benchmark-runner.js');
      const dummyRunner = new BenchmarkRunner({});

      // Load all test case results
      const entries = await fs.readdir(runPath, { withFileTypes: true });
      const testCaseDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      const results = [];
      
      for (const testCaseDir of testCaseDirs) {
        const caseSummaryPath = path.join(runPath, testCaseDir, 'case_summary.json');
        try {
          const caseData = JSON.parse(await fs.readFile(caseSummaryPath, 'utf8'));
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
📊 Summary Recalculator

Usage:
  node recalculate-summaries.js <run-directory>

Examples:
  node recalculate-summaries.js run_2025-07-26T00-06-46-586Z
  node recalculate-summaries.js run_2025-07-26T00-06-46-587Z

This tool will:
1. Load all shot files from each test case directory
2. Recalculate statistics with correct success rate calculations
3. Regenerate original_summary.json, enhanced_*_summary.json files
4. Regenerate case_summary.json with corrected data
5. Regenerate the overall benchmark_report.md

The tool will show the actual success rates as it processes each test case.
`);
    process.exit(1);
  }

  const runDirectory = args[0];
  const recalculator = new SummaryRecalculator();
  
  try {
    console.log(`🚀 Starting summary recalculation for: ${runDirectory}`);
    const totalRecalculated = await recalculator.recalculateSummaries(runDirectory);
    console.log('\n✅ Summary recalculation completed successfully!');
    console.log(`📊 Total files recalculated: ${totalRecalculated}`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Summary recalculation failed:', error.message);
    process.exit(1);
  }
}