#!/usr/bin/env node

import { BenchmarkRunner } from './benchmark-runner.js';
import testCases from './test-cases.js';

function showUsage() {
  console.log(`
🔧 Single Test Runner

Usage:
  node single-test-runner.js <test-name> [options]
  node single-test-runner.js list                    # List all available tests
  node single-test-runner.js <test-name> --shots 1   # Run with custom shot count

Available Tests:
${testCases.map((tc, i) => `  ${i + 1}. ${tc.name}`).join('\n')}

Examples:
  node single-test-runner.js Work_Assignment_Projects
  node single-test-runner.js "Revenue_Financial_Analysis" --shots 1
  node single-test-runner.js 2                       # Run test case #2 by number
`);
}

function listTests() {
  console.log('\n📋 Available Test Cases:\n');
  testCases.forEach((testCase, index) => {
    console.log(`${index + 1}. ${testCase.name}`);
    console.log(`   Question: "${testCase.question}"`);
    console.log(`   Schemas: ${testCase.schemas.map(s => s.name).join(', ')}`);
    console.log('');
  });
}

async function runSingleTest(testIdentifier, options = {}) {
  let selectedTest = null;
  
  // Try to find test by name first
  selectedTest = testCases.find(tc => tc.name === testIdentifier);
  
  // If not found, try by partial name match
  if (!selectedTest) {
    selectedTest = testCases.find(tc => 
      tc.name.toLowerCase().includes(testIdentifier.toLowerCase())
    );
  }
  
  // If still not found, try by number
  if (!selectedTest) {
    const testNumber = parseInt(testIdentifier);
    if (!isNaN(testNumber) && testNumber >= 1 && testNumber <= testCases.length) {
      selectedTest = testCases[testNumber - 1];
    }
  }
  
  if (!selectedTest) {
    console.error(`❌ Test case "${testIdentifier}" not found.`);
    console.log('Use "node single-test-runner.js list" to see available tests.');
    process.exit(1);
  }
  
  console.log(`🚀 Running single test case: ${selectedTest.name}`);
  console.log(`📝 Question: "${selectedTest.question}"`);
  console.log(`🔧 Schemas: ${selectedTest.schemas.map(s => s.name).join(', ')}`);
  console.log('');
  
  const config = {
    shotsPerTest: options.shots || 3
  };
  
  const runner = new BenchmarkRunner(config);
  
  try {
    const results = await runner.run([selectedTest]);
    console.log(`\n✅ Single test completed successfully!`);
    console.log(`📊 Results saved to: ${results.reportPath}`);
    
    // Show quick summary
    const testResult = results.results[0];
    console.log('\n📈 Quick Summary:');
    for (const [schemaName, schemaResult] of Object.entries(testResult.schemas)) {
      const stats = schemaResult.statistics;
      console.log(`  ${schemaName}:`);
      console.log(`    Success Rate: ${stats.successRate.toFixed(0)}%`);
      console.log(`    Avg Time: ${stats.averageExecutionTime.toFixed(0)}ms`);
      console.log(`    Avg Tools: ${stats.averageToolCalls.toFixed(1)}`);
      console.log(`    Sample Answer: ${stats.answers[0]?.substring(0, 100)}...`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Single test failed:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  showUsage();
  process.exit(1);
}

const command = args[0];

if (command === 'list') {
  listTests();
  process.exit(0);
}

if (command === 'help' || command === '--help' || command === '-h') {
  showUsage();
  process.exit(0);
}

// Parse options
const options = {};
for (let i = 1; i < args.length; i += 2) {
  const flag = args[i];
  const value = args[i + 1];
  
  if (flag === '--shots' && value) {
    options.shots = parseInt(value);
  }
}

// Run the test
runSingleTest(command, options);