# Aden Benchmark Suite

Automated testing suite for benchmarking the effects of schema enhancements on query performance and answer quality.

## Overview

This suite allows you to:
- Test multiple questions against different schema configurations
- Run multiple shots per test for statistical reliability  
- Compare performance metrics between schema versions
- Generate comprehensive reports with trend analysis
- Analyze the impact of knowledge graph enhancements

## Quick Start

1. **Install dependencies** (if needed):
   ```bash
   cd benchmarks/suite
   npm install
   ```

2. **Run the benchmark suite**:
   ```bash
   npm run benchmark
   ```

3. **Analyze results**:
   ```bash
   npm run analyze
   ```

## Architecture

### Core Components

- **`benchmark-runner.js`**: Main test runner that executes queries against different schemas
- **`test-cases.js`**: Configuration of test scenarios and questions
- **`result-analyzer.js`**: Performance trend analysis and reporting
- **`schema-differ.js`**: Schema comparison and diff generation

### Test Flow

```
Test Case → Schema Switch → Multiple Shots → Statistics → Comparison → Report
```

1. For each test case, switch to different schema files
2. Execute the same question multiple times (shots) for reliability
3. Collect performance metrics (execution time, tool calls, success rate)
4. Compare results between schema configurations
5. Generate comprehensive reports

## Configuration

### Test Cases

Edit `test-cases.js` to add new test scenarios:

```javascript
{
  name: "Your_Test_Name",
  question: "Your question here", 
  schemas: [
    {
      name: "baseline",
      file: "schema_graph_original.json",
      description: "Base schema without enhancements"
    },
    {
      name: "enhanced",
      file: "schema_graph_enhanced.json", 
      description: "Schema with knowledge nodes added"
    }
  ]
}
```

### Schema Files

The suite automatically switches between schema files by copying them to `schema_graph_full.json` before each test run. Ensure your schema files are in `src/reference/`:

- `schema_graph_original.json` - Base schema
- `schema_graph_case1.json` - Enhanced schema for case 1
- Add more schema variants as needed

## Usage

### Running Benchmarks

```bash
# Run with default settings (3 shots per test)
node benchmark-runner.js

# Run with custom shot count
node benchmark-runner.js --shots=5

# Quick test with single shot
npm run quick-test

# Comprehensive test with 5 shots
npm run full-test
```

### Analyzing Results

```bash
# Analyze all results and generate trend report
node result-analyzer.js ../results trend_report.md

# Compare two specific schema files
node schema-differ.js ../../src/reference/schema_graph_original.json ../../src/reference/schema_graph_case1.json comparison.md
```

### Custom Configuration

```javascript
import { BenchmarkRunner } from './benchmark-runner.js';

const runner = new BenchmarkRunner({
  shotsPerTest: 5,
  outputDir: './custom-results',
  cliPath: '../../client/src/cli.js'
});

const results = await runner.run(testCases);
```

## Metrics Collected

### Performance Metrics
- **Execution Time**: How long each query takes to complete
- **Tool Calls**: Number of tool invocations per query
- **Success Rate**: Percentage of successful query executions
- **Answer Consistency**: How consistent answers are across shots

### Quality Metrics
- **Answer Accuracy**: Manual review of answer correctness
- **Answer Completeness**: Whether answers include all expected information
- **Answer Consistency**: Variation in answers across multiple runs

## Output Structure

```
benchmarks/results/
├── run_2024-01-15T10-30-00-000Z/
│   ├── ARR_Calculation/
│   │   ├── original_shot_1.json
│   │   ├── original_shot_2.json
│   │   ├── original_shot_3.json
│   │   ├── original_summary.json
│   │   ├── enhanced_case1_shot_1.json
│   │   ├── enhanced_case1_shot_2.json
│   │   ├── enhanced_case1_shot_3.json
│   │   ├── enhanced_case1_summary.json
│   │   └── case_summary.json
│   ├── Customer_Revenue_Analysis/
│   │   └── ...
│   └── benchmark_report.md
└── trend_analysis.md
```

## Example Report Output

```markdown
# Benchmark Report

## Test Case: ARR_Calculation

**Question:** Calculate our ARR

### Results Comparison

| Schema | Avg Time (ms) | Avg Tool Calls | Success Rate | Answer Consistency | Sample Answer |
|--------|---------------|----------------|--------------|-------------------|---------------|
| original | 1250 | 1.7 | 100% | 100% | Your Annual Recurring Revenue (ARR) is $623,600... |
| enhanced_case1 | 980 | 1.3 | 100% | 100% | Based on the data I've retrieved, your Annual... |

### Analysis
- Enhanced schema reduces execution time by 22%
- Tool call efficiency improved by 24%
- Answer quality remains consistent
- Enhanced schema provides more contextual responses
```

## Schema Enhancement Workflow

1. **Baseline Testing**: Test with original schema to establish baseline
2. **Enhancement Design**: Add knowledge nodes and edges to schema
3. **Enhanced Testing**: Test with enhanced schema
4. **Comparison**: Use suite to compare performance and quality
5. **Iteration**: Refine enhancements based on results

## Best Practices

### Test Design
- Use realistic business questions that users actually ask
- Include edge cases and complex queries
- Test both simple and multi-step questions

### Schema Enhancement
- Add knowledge nodes that capture business rules and context
- Create meaningful relationships between knowledge and data entities
- Test incremental enhancements to understand individual impact

### Analysis
- Run sufficient shots (3-5) for statistical significance
- Look at both performance and answer quality metrics
- Consider consistency as important as speed

## Troubleshooting

### Common Issues

1. **Schema file not found**: Ensure schema files exist in `src/reference/`
2. **CLI errors**: Check that the client is properly configured with API keys
3. **Permission errors**: Ensure scripts have execute permissions

### Debug Mode

Add debug logging by setting environment variable:
```bash
DEBUG=1 node benchmark-runner.js
```

## Extending the Suite

### Adding New Metrics

Modify `calculateStatistics()` in `benchmark-runner.js` to add new metrics:

```javascript
calculateStatistics(shots) {
  // Add your custom metrics here
  return {
    // ... existing metrics
    customMetric: this.calculateCustomMetric(shots)
  };
}
```

### Custom Test Types

Create new test case types by extending the test case structure:

```javascript
{
  name: "Custom_Test_Type",
  type: "comparison", // or "performance", "accuracy", etc.
  question: "...",
  expectedAnswer: "...", // for accuracy testing
  schemas: [...],
  customConfig: {
    // test-specific configuration
  }
}
```

## Contributing

1. Add new test cases to `test-cases.js`
2. Enhance metrics collection in `benchmark-runner.js`
3. Improve analysis capabilities in `result-analyzer.js`
4. Update documentation as needed

## License

MIT