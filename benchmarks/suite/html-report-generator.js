#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class HTMLReportGenerator {
  constructor(config) {
    this.config = {
      outputDir: path.join(__dirname, '../results'),
      ...config
    };
  }

  async generateHTML(runDirectory) {
    console.log(`📄 Generating HTML report for: ${runDirectory}`);
    
    const runPath = path.join(this.config.outputDir, runDirectory);
    
    // Check if the run directory exists
    try {
      await fs.access(runPath);
    } catch (error) {
      throw new Error(`Run directory not found: ${runDirectory}`);
    }

    // Load benchmark data
    const benchmarkData = await this.loadBenchmarkData(runPath);
    
    // Generate HTML content
    const htmlContent = await this.generateHTMLContent(benchmarkData, runDirectory);
    
    // Write HTML file
    const htmlPath = path.join(runPath, 'benchmark_report.html');
    await fs.writeFile(htmlPath, htmlContent);
    
    console.log(`✅ HTML report generated: ${htmlPath}`);
    return htmlPath;
  }

  async loadBenchmarkData(runPath) {
    const data = {
      runPath,
      runName: path.basename(runPath),
      timestamp: new Date().toISOString(),
      testCases: [],
      summary: {}
    };

    // Find all test case directories
    const entries = await fs.readdir(runPath, { withFileTypes: true });
    const testCaseDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    console.log(`📁 Loading ${testCaseDirs.length} test cases...`);

    for (const testCaseDir of testCaseDirs) {
      const testCasePath = path.join(runPath, testCaseDir);
      const testCase = await this.loadTestCase(testCasePath, testCaseDir);
      if (testCase) {
        data.testCases.push(testCase);
      }
    }

    // Calculate summary statistics
    data.summary = this.calculateSummaryStats(data.testCases);
    
    return data;
  }

  async loadTestCase(testCasePath, testCaseName) {
    try {
      const caseSummaryPath = path.join(testCasePath, 'case_summary.json');
      const caseData = JSON.parse(await fs.readFile(caseSummaryPath, 'utf8'));
      
      // Load individual shot files for detailed view
      const files = await fs.readdir(testCasePath);
      const shotFiles = files.filter(file => 
        file.includes('_shot_') && file.endsWith('.json')
      );

      const shots = [];
      for (const shotFile of shotFiles) {
        const shotPath = path.join(testCasePath, shotFile);
        const shotData = JSON.parse(await fs.readFile(shotPath, 'utf8'));
        shotData.fileName = shotFile;
        shots.push(shotData);
      }

      return {
        name: testCaseName,
        ...caseData,
        allShots: shots
      };
    } catch (error) {
      console.warn(`⚠️ Could not load test case ${testCaseName}: ${error.message}`);
      return null;
    }
  }

  calculateSummaryStats(testCases) {
    const totalTests = testCases.length;
    let totalShots = 0;
    let successfulShots = 0;
    let avgExecutionTime = 0;
    let avgToolCalls = 0;
    
    const schemaComparisons = [];

    testCases.forEach(testCase => {
      Object.values(testCase.schemas || {}).forEach(schema => {
        totalShots += schema.shots?.length || 0;
        successfulShots += schema.shots?.filter(s => s.success).length || 0;
        avgExecutionTime += schema.statistics?.averageExecutionTime || 0;
        avgToolCalls += schema.statistics?.averageToolCalls || 0;
      });

      // Schema comparison
      const schemas = Object.keys(testCase.schemas || {});
      if (schemas.includes('original') && schemas.length > 1) {
        const original = testCase.schemas.original.statistics;
        const enhanced = Object.values(testCase.schemas).find(s => s.name !== 'original')?.statistics;
        
        if (original && enhanced) {
          schemaComparisons.push({
            testCase: testCase.name,
            improvement: {
              successRate: enhanced.successRate - original.successRate,
              executionTime: original.averageExecutionTime - enhanced.averageExecutionTime,
              toolCalls: original.averageToolCalls - enhanced.averageToolCalls,
              consistency: enhanced.answerConsistency - original.answerConsistency
            }
          });
        }
      }
    });

    const totalSchemas = testCases.reduce((sum, tc) => sum + Object.keys(tc.schemas || {}).length, 0);

    return {
      totalTests,
      totalShots,
      totalSchemas: totalSchemas || 1,
      successRate: totalShots > 0 ? (successfulShots / totalShots) * 100 : 0,
      avgExecutionTime: totalSchemas > 0 ? avgExecutionTime / totalSchemas : 0,
      avgToolCalls: totalSchemas > 0 ? avgToolCalls / totalSchemas : 0,
      schemaComparisons
    };
  }

  async generateHTMLContent(data, runDirectory) {
    const css = this.generateCSS();
    const js = this.generateJS();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Benchmark Report - ${runDirectory}</title>
    
    <!-- External libraries for markdown rendering -->
    <script src="https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega@5.25.0/build/vega.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-lite@5.16.3/build/vega-lite.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-embed@6.24.0/build/vega-embed.min.js"></script>
    
    <!-- Prism CSS for syntax highlighting -->
    <link href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
    
    <style>${css}</style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🔬 Benchmark Report</h1>
            <div class="header-info">
                <span class="run-name">${runDirectory}</span>
                <span class="timestamp">Generated: ${new Date().toLocaleString()}</span>
            </div>
        </header>

        <div class="summary-cards">
            <div class="card">
                <div class="card-icon">📋</div>
                <div class="card-content">
                    <div class="card-value">${data.summary.totalTests}</div>
                    <div class="card-label">Test Cases</div>
                </div>
            </div>
            <div class="card">
                <div class="card-icon">🎯</div>
                <div class="card-content">
                    <div class="card-value">${data.summary.totalShots}</div>
                    <div class="card-label">Total Shots</div>
                </div>
            </div>
            <div class="card">
                <div class="card-icon">✅</div>
                <div class="card-content">
                    <div class="card-value">${data.summary.successRate.toFixed(1)}%</div>
                    <div class="card-label">Success Rate</div>
                </div>
            </div>
            <div class="card">
                <div class="card-icon">⚡</div>
                <div class="card-content">
                    <div class="card-value">${(data.summary.avgExecutionTime / 1000).toFixed(1)}s</div>
                    <div class="card-label">Avg Time</div>
                </div>
            </div>
        </div>

        ${this.generateSchemaComparisonSection(data.summary.schemaComparisons)}

        <div class="test-cases">
            ${data.testCases.map(testCase => this.generateTestCaseHTML(testCase)).join('')}
        </div>
    </div>

    <script>${js}</script>
</body>
</html>`;
  }

  generateSchemaComparisonSection(comparisons) {
    if (!comparisons.length) return '';

    const positiveImprovements = comparisons.filter(c => 
      c.improvement.successRate > 0 || c.improvement.executionTime > 0
    ).length;

    return `
        <div class="schema-analysis">
            <h2>📊 Schema Enhancement Analysis</h2>
            <div class="analysis-summary">
                <div class="improvement-stat">
                    <span class="stat-value">${positiveImprovements}/${comparisons.length}</span>
                    <span class="stat-label">tests improved</span>
                </div>
                <div class="improvement-chart">
                    ${comparisons.map((comp, index) => `
                        <div class="improvement-bar" data-tooltip="${comp.testCase}: ${comp.improvement.successRate > 0 ? '+' : ''}${comp.improvement.successRate.toFixed(1)}% success rate">
                            <div class="bar ${comp.improvement.successRate > 0 ? 'positive' : 'negative'}" 
                                 style="height: ${Math.min(Math.abs(comp.improvement.successRate) * 2, 50)}px;"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
  }

  generateTestCaseHTML(testCase) {
    const schemas = Object.entries(testCase.schemas || {});
    
    return `
        <div class="test-case" id="test-${testCase.name.replace(/\s+/g, '-')}">
            <div class="test-case-header" onclick="toggleTestCase('${testCase.name.replace(/\s+/g, '-')}')">
                <h3>${testCase.name}</h3>
                <div class="test-case-summary">
                    <span class="question-preview">${(testCase.question || '').substring(0, 100)}${testCase.question && testCase.question.length > 100 ? '...' : ''}</span>
                    <span class="schema-count">${schemas.length} schemas</span>
                    <span class="toggle-icon">▼</span>
                </div>
            </div>
            
            <div class="test-case-content">
                <div class="question-section">
                    <h4>❓ Question</h4>
                    <div class="question-text">${testCase.question || 'Question not available'}</div>
                </div>

                <div class="schemas-section">
                    <h4>🔧 Schema Results</h4>
                    <div class="schemas-grid">
                        ${schemas.map(([schemaName, schemaData]) => this.generateSchemaHTML(schemaName, schemaData)).join('')}
                    </div>
                </div>

                <div class="shots-section">
                    <h4>🎯 All Shots</h4>
                    <div class="shots-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Success</th>
                                    <th>Time (ms)</th>
                                    <th>Tools</th>
                                    <th>Answer Preview</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(testCase.allShots || []).map(shot => this.generateShotRowHTML(shot)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
  }

  generateSchemaHTML(schemaName, schemaData) {
    const stats = schemaData.statistics || {};
    const successRate = stats.successRate || 0;
    const avgTime = stats.averageExecutionTime || 0;
    const avgTools = stats.averageToolCalls || 0;
    
    return `
        <div class="schema-card">
            <div class="schema-header">
                <h5>${schemaName}</h5>
                <div class="schema-badge ${successRate >= 100 ? 'success' : successRate >= 80 ? 'warning' : 'error'}">
                    ${successRate.toFixed(0)}%
                </div>
            </div>
            <div class="schema-stats">
                <div class="stat">
                    <span class="stat-label">Avg Time</span>
                    <span class="stat-value">${(avgTime / 1000).toFixed(1)}s</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Avg Tools</span>
                    <span class="stat-value">${avgTools.toFixed(1)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Consistency</span>
                    <span class="stat-value">${(stats.answerConsistency || 0).toFixed(0)}%</span>
                </div>
            </div>
            <div class="schema-answers">
                <h6>Sample Answers:</h6>
                ${(stats.answers || []).slice(0, 2).map((answer, index) => `
                    <div class="answer-preview" data-answer="${this.escapeForAttribute(answer)}">
                        ${index + 1}. ${this.escapeHTML(answer.substring(0, 80))}${answer.length > 80 ? '...' : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
  }

  generateShotRowHTML(shot) {
    const success = shot.success ? '✅' : '❌';
    const successClass = shot.success ? 'success' : 'error';
    const answer = shot.answer || shot.error || 'No response';
    
    return `
        <tr class="shot-row ${successClass}">
            <td class="file-name">${shot.fileName}</td>
            <td class="success-indicator">${success}</td>
            <td class="execution-time">${(shot.executionTime || 0).toFixed(0)}</td>
            <td class="tool-calls">${shot.toolCalls || 0}</td>
            <td class="answer-preview">
                <div class="answer-text" data-answer="${this.escapeForAttribute(answer)}">
                    ${this.escapeHTML(answer.substring(0, 100))}${answer.length > 100 ? '...' : ''}
                </div>
            </td>
        </tr>
    `;
  }

  escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  escapeForAttribute(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r?\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  generateCSS() {
    return `
      * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
      }

      body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: #333;
      }

      .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
      }

      .header {
          background: white;
          border-radius: 15px;
          padding: 30px;
          margin-bottom: 30px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          text-align: center;
      }

      .header h1 {
          font-size: 2.5rem;
          margin-bottom: 15px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
      }

      .header-info {
          display: flex;
          justify-content: center;
          gap: 30px;
          flex-wrap: wrap;
      }

      .run-name {
          background: #e3f2fd;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          color: #1976d2;
      }

      .timestamp {
          color: #666;
          font-size: 0.9rem;
      }

      .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
      }

      .card {
          background: white;
          border-radius: 15px;
          padding: 25px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          gap: 15px;
          transition: transform 0.2s ease;
      }

      .card:hover {
          transform: translateY(-5px);
      }

      .card-icon {
          font-size: 2rem;
          opacity: 0.8;
      }

      .card-value {
          font-size: 1.8rem;
          font-weight: bold;
          color: #333;
      }

      .card-label {
          color: #666;
          font-size: 0.9rem;
      }

      .schema-analysis {
          background: white;
          border-radius: 15px;
          padding: 30px;
          margin-bottom: 30px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
      }

      .schema-analysis h2 {
          margin-bottom: 20px;
          color: #333;
      }

      .analysis-summary {
          display: flex;
          align-items: center;
          gap: 30px;
      }

      .improvement-stat {
          text-align: center;
      }

      .stat-value {
          display: block;
          font-size: 2rem;
          font-weight: bold;
          color: #4caf50;
      }

      .stat-label {
          color: #666;
          font-size: 0.9rem;
      }

      .improvement-chart {
          display: flex;
          align-items: flex-end;
          gap: 5px;
          height: 60px;
      }

      .improvement-bar {
          position: relative;
          display: flex;
          align-items: flex-end;
      }

      .bar {
          width: 20px;
          min-height: 5px;
          border-radius: 3px;
          transition: all 0.3s ease;
      }

      .bar.positive {
          background: linear-gradient(to top, #4caf50, #8bc34a);
      }

      .bar.negative {
          background: linear-gradient(to top, #f44336, #ff7043);
      }

      .test-cases {
          display: flex;
          flex-direction: column;
          gap: 20px;
      }

      .test-case {
          background: white;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          overflow: hidden;
      }

      .test-case-header {
          padding: 25px;
          cursor: pointer;
          background: linear-gradient(135deg, #f8f9fa, #e9ecef);
          border-bottom: 1px solid #dee2e6;
          transition: background 0.2s ease;
      }

      .test-case-header:hover {
          background: linear-gradient(135deg, #e9ecef, #dee2e6);
      }

      .test-case-header h3 {
          margin-bottom: 10px;
          color: #333;
      }

      .test-case-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 15px;
      }

      .question-preview {
          color: #666;
          font-style: italic;
          flex: 1;
          min-width: 200px;
      }

      .schema-count {
          background: #007bff;
          color: white;
          padding: 4px 12px;
          border-radius: 15px;
          font-size: 0.8rem;
          font-weight: 600;
      }

      .toggle-icon {
          font-size: 1.2rem;
          color: #666;
          transition: transform 0.3s ease;
      }

      .test-case.collapsed .toggle-icon {
          transform: rotate(-90deg);
      }

      .test-case-content {
          padding: 30px;
          display: none;
      }

      .test-case.expanded .test-case-content {
          display: block;
      }

      .question-section, .schemas-section, .shots-section {
          margin-bottom: 30px;
      }

      .question-section h4, .schemas-section h4, .shots-section h4 {
          margin-bottom: 15px;
          color: #333;
          font-size: 1.2rem;
      }

      .question-text {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          border-left: 4px solid #007bff;
          font-size: 1.1rem;
          line-height: 1.6;
      }

      .schemas-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
      }

      .schema-card {
          background: #f8f9fa;
          border-radius: 10px;
          padding: 20px;
          border: 1px solid #dee2e6;
      }

      .schema-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
      }

      .schema-header h5 {
          color: #333;
          font-size: 1.1rem;
      }

      .schema-badge {
          padding: 4px 10px;
          border-radius: 15px;
          font-size: 0.8rem;
          font-weight: bold;
      }

      .schema-badge.success {
          background: #d4edda;
          color: #155724;
      }

      .schema-badge.warning {
          background: #fff3cd;
          color: #856404;
      }

      .schema-badge.error {
          background: #f8d7da;
          color: #721c24;
      }

      .schema-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 15px;
      }

      .stat {
          text-align: center;
      }

      .stat-label {
          display: block;
          font-size: 0.8rem;
          color: #666;
          margin-bottom: 2px;
      }

      .stat-value {
          font-weight: bold;
          color: #333;
      }

      .schema-answers h6 {
          margin-bottom: 10px;
          color: #666;
          font-size: 0.9rem;
      }

      .answer-preview {
          background: white;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: background 0.2s ease;
          font-size: 0.9rem;
          line-height: 1.4;
      }

      .answer-preview:hover {
          background: #e3f2fd;
      }

      .shots-table {
          overflow-x: auto;
      }

      .shots-table table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }

      .shots-table th {
          background: #343a40;
          color: white;
          padding: 15px;
          text-align: left;
          font-weight: 600;
      }

      .shots-table td {
          padding: 12px 15px;
          border-bottom: 1px solid #dee2e6;
      }

      .shot-row.success {
          background: #f8fff8;
      }

      .shot-row.error {
          background: #fff5f5;
      }

      .file-name {
          font-family: monospace;
          font-size: 0.9rem;
          color: #495057;
      }

      .success-indicator {
          text-align: center;
          font-size: 1.2rem;
      }

      .execution-time, .tool-calls {
          text-align: center;
          font-weight: 600;
      }

      .answer-text {
          cursor: pointer;
          line-height: 1.4;
      }

      .answer-text:hover {
          background: #e3f2fd;
          border-radius: 3px;
      }

      .modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0,0,0,0.5);
      }

      .modal-content {
          background-color: white;
          margin: 2% auto;
          padding: 30px;
          border-radius: 15px;
          width: 95%;
          max-width: 1200px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
      }

      .close {
          position: absolute;
          right: 20px;
          top: 15px;
          font-size: 28px;
          font-weight: bold;
          cursor: pointer;
          color: #aaa;
      }

      .close:hover {
          color: #333;
      }

      .modal-text {
          line-height: 1.6;
          font-size: 1rem;
      }
      
      .markdown-content {
          line-height: 1.6;
          color: #333;
      }
      
      .markdown-content h1, .markdown-content h2, .markdown-content h3, 
      .markdown-content h4, .markdown-content h5, .markdown-content h6 {
          margin-top: 24px;
          margin-bottom: 16px;
          font-weight: 600;
          line-height: 1.25;
      }
      
      .markdown-content h1 {
          padding-bottom: 0.3em;
          border-bottom: 1px solid #eaecef;
      }
      
      .markdown-content h2 {
          padding-bottom: 0.3em;
          border-bottom: 1px solid #eaecef;
      }
      
      .markdown-content p {
          margin-bottom: 16px;
      }
      
      .markdown-content ul, .markdown-content ol {
          margin-bottom: 16px;
          padding-left: 30px;
      }
      
      .markdown-content li {
          margin-bottom: 8px;
      }
      
      .markdown-content blockquote {
          padding: 0 16px;
          margin: 0 0 16px 0;
          color: #6a737d;
          border-left: 4px solid #dfe2e5;
          background: #f8f9fa;
      }
      
      .markdown-content table {
          width: 100%;
          margin-bottom: 16px;
          border-collapse: collapse;
          border-spacing: 0;
      }
      
      .markdown-content table th,
      .markdown-content table td {
          padding: 12px;
          border: 1px solid #dfe2e5;
          text-align: left;
      }
      
      .markdown-content table th {
          background-color: #f6f8fa;
          font-weight: 600;
      }
      
      .markdown-content table tr:nth-child(even) {
          background-color: #f8f9fa;
      }
      
      .markdown-content pre {
          background: #f6f8fa;
          border-radius: 6px;
          padding: 16px;
          overflow-x: auto;
          margin-bottom: 16px;
          border: 1px solid #e1e4e8;
      }
      
      .markdown-content code {
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'SFMono-Regular', 'Monaco', 'Consolas', monospace;
          font-size: 0.9em;
      }
      
      .markdown-content pre code {
          background: transparent;
          padding: 0;
          border-radius: 0;
          color: inherit;
      }
      
      .vega-embed {
          margin: 20px 0;
      }
      
      .mermaid-container {
          text-align: center;
          margin: 20px 0;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
      }
      
      .code-block-header {
          background: #e9ecef;
          padding: 8px 16px;
          border-radius: 6px 6px 0 0;
          font-size: 0.8rem;
          font-weight: 600;
          color: #495057;
          border: 1px solid #e1e4e8;
          border-bottom: none;
      }
      
      .code-block-header + pre {
          margin-top: 0;
          border-radius: 0 0 6px 6px;
      }
      
      .error {
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 6px;
          padding: 16px;
          color: #c33;
          font-family: monospace;
          margin: 16px 0;
      }
      
      .loading {
          background: #f0f8ff;
          border: 1px solid #add8e6;
          border-radius: 6px;
          padding: 16px;
          color: #4682b4;
          text-align: center;
          margin: 16px 0;
      }
      
      /* Ensure tables are responsive in modal */
      .modal-content .markdown-content table {
          font-size: 0.9rem;
      }
      
      @media (max-width: 768px) {
          .modal-content {
              width: 98%;
              margin: 1% auto;
              padding: 15px;
          }
          
          .markdown-content table {
              font-size: 0.8rem;
          }
          
          .vega-embed {
              overflow-x: auto;
          }
      }

      @media (max-width: 768px) {
          .container {
              padding: 10px;
          }
          
          .header {
              padding: 20px;
          }
          
          .header h1 {
              font-size: 2rem;
          }
          
          .test-case-summary {
              flex-direction: column;
              align-items: flex-start;
          }
          
          .schemas-grid {
              grid-template-columns: 1fr;
          }
          
          .analysis-summary {
              flex-direction: column;
              text-align: center;
          }
      }
    `;
  }

  generateJS() {
    return `
      function toggleTestCase(testCaseId) {
          const testCase = document.getElementById('test-' + testCaseId);
          if (testCase.classList.contains('expanded')) {
              testCase.classList.remove('expanded');
              testCase.classList.add('collapsed');
          } else {
              testCase.classList.remove('collapsed');
              testCase.classList.add('expanded');
          }
      }

      async function showFullAnswer(answer) {
          const modal = document.getElementById('answerModal');
          const modalText = document.getElementById('modalAnswerText');
          
          // Show loading state
          modalText.innerHTML = '<div class="loading">Rendering markdown content...</div>';
          modal.style.display = 'block';
          
          try {
              // Render markdown content
              const renderedContent = await renderMarkdownContent(answer);
              modalText.innerHTML = renderedContent;
          } catch (error) {
              console.error('Error rendering markdown:', error);
              modalText.innerHTML = '<div class="error">Error rendering content: ' + error.message + '</div><pre>' + answer + '</pre>';
          }
      }
      
      async function renderMarkdownContent(content) {
          try {
              // Configure marked with custom renderer
              const renderer = new marked.Renderer();
              
              // Custom code block renderer
              const originalCode = renderer.code;
              renderer.code = function(code, language) {
                  const escapeHTML = (text) => text
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#39;');
                      
                  if (language === 'vega-lite' || language === 'vega-v5' || language === 'vega') {
                      const id = 'vega-' + Math.random().toString(36).substr(2, 9);
                      setTimeout(function() { renderVegaLite(id, code); }, 100);
                      return '<div id="' + id + '" class="vega-embed" data-spec="' + escapeHTML(code) + '"></div>';
                  } else if (language === 'mermaid') {
                      const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                      setTimeout(function() { renderMermaid(id, code); }, 100);
                      return '<div class="mermaid-container"><div id="' + id + '" class="mermaid">' + code + '</div></div>';
                  } else {
                      const header = language ? '<div class="code-block-header">' + language + '</div>' : '';
                      return header + originalCode.call(this, code, language);
                  }
              };
          
          // Configure marked options
          marked.setOptions({
              renderer: renderer,
              highlight: function(code, lang) {
                  if (Prism.languages[lang]) {
                      return Prism.highlight(code, Prism.languages[lang], lang);
                  }
                  return code;
              },
              breaks: true,
              gfm: true
          });
          
              const html = marked.parse(content);
              return '<div class="markdown-content">' + html + '</div>';
          } catch (error) {
              console.error('Markdown rendering error:', error);
              // Fallback to plain text with basic HTML escaping
              const escapeHTML = (text) => text
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
              return '<div class="markdown-content"><pre>' + escapeHTML(content) + '</pre></div>';
          }
      }
      
      function renderVegaLite(elementId, spec) {
          try {
              const vegaSpec = JSON.parse(spec);
              vegaEmbed('#' + elementId, vegaSpec, {
                  theme: 'default',
                  actions: {
                      export: true,
                      source: false,
                      compiled: false,
                      editor: false
                  }
              }).catch(error => {
                  console.error('Vega-Lite rendering error:', error);
                  document.getElementById(elementId).innerHTML = 
                      '<div class="error">Error rendering Vega-Lite chart: ' + error.message + '</div>';
              });
          } catch (error) {
              console.error('Vega-Lite parsing error:', error);
              document.getElementById(elementId).innerHTML = 
                  '<div class="error">Error parsing Vega-Lite spec: ' + error.message + '</div>';
          }
      }
      
      function renderMermaid(elementId, spec) {
          try {
              mermaid.render(elementId + '_svg', spec).then(function(result) {
                  document.getElementById(elementId).innerHTML = result.svg;
              }).catch(error => {
                  console.error('Mermaid rendering error:', error);
                  document.getElementById(elementId).innerHTML = 
                      '<div class="error">Error rendering Mermaid diagram: ' + error.message + '</div>';
              });
          } catch (error) {
              console.error('Mermaid parsing error:', error);
              document.getElementById(elementId).innerHTML = 
                  '<div class="error">Error parsing Mermaid spec: ' + error.message + '</div>';
          }
      }

      function closeModal() {
          const modal = document.getElementById('answerModal');
          modal.style.display = 'none';
      }

      // Initialize page
      document.addEventListener('DOMContentLoaded', function() {
          // Initialize Mermaid
          mermaid.initialize({ 
              startOnLoad: true,
              theme: 'default',
              securityLevel: 'loose'
          });
          // Create modal
          const modal = document.createElement('div');
          modal.id = 'answerModal';
          modal.className = 'modal';
          modal.innerHTML = 
              '<div class="modal-content">' +
                  '<span class="close" onclick="closeModal()">&times;</span>' +
                  '<h3>📄 Full Answer</h3>' +
                  '<div id="modalAnswerText" class="modal-text"></div>' +
              '</div>';
          document.body.appendChild(modal);

          // Close modal when clicking outside of it
          window.onclick = function(event) {
              if (event.target === modal) {
                  closeModal();
              }
          }
          
          // Add event delegation for answer previews
          document.addEventListener('click', function(event) {
              if (event.target.closest('.answer-preview[data-answer]') || event.target.closest('.answer-text[data-answer]')) {
                  const element = event.target.closest('[data-answer]');
                  const answer = element.getAttribute('data-answer');
                  if (answer) {
                      showFullAnswer(answer);
                  }
              }
          });

          // Add tooltips for improvement bars
          const bars = document.querySelectorAll('.improvement-bar');
          bars.forEach(bar => {
              bar.addEventListener('mouseenter', function() {
                  const tooltip = this.getAttribute('data-tooltip');
                  if (tooltip) {
                      const tooltipDiv = document.createElement('div');
                      tooltipDiv.className = 'tooltip';
                      tooltipDiv.textContent = tooltip;
                      tooltipDiv.style.cssText = 
                          'position: absolute;' +
                          'background: #333;' +
                          'color: white;' +
                          'padding: 8px 12px;' +
                          'border-radius: 5px;' +
                          'font-size: 0.8rem;' +
                          'z-index: 1000;' +
                          'pointer-events: none;' +
                          'white-space: nowrap;';
                      document.body.appendChild(tooltipDiv);

                      const rect = this.getBoundingClientRect();
                      tooltipDiv.style.left = rect.left + 'px';
                      tooltipDiv.style.top = (rect.top - 35) + 'px';

                      this._tooltip = tooltipDiv;
                  }
              });

              bar.addEventListener('mouseleave', function() {
                  if (this._tooltip) {
                      document.body.removeChild(this._tooltip);
                      this._tooltip = null;
                  }
              });
          });

          console.log('📄 HTML Benchmark Report loaded successfully');
          console.log('🎨 Markdown rendering libraries initialized');
      });
    `;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📄 HTML Report Generator

Usage:
  node html-report-generator.js <run-directory>

Examples:
  node html-report-generator.js run_2025-07-26T00-06-46-586Z
  node html-report-generator.js run_2025-07-26T00-06-46-587Z

This tool will:
1. Load all test case data from the specified benchmark run
2. Generate a comprehensive, interactive HTML report
3. Include performance charts, detailed results, and schema comparisons
4. Save the report as benchmark_report.html in the run directory

Features:
- Interactive collapsible test cases
- Performance comparison charts
- Full answer modal views
- Responsive design for mobile devices
- Beautiful modern UI with hover effects
`);
    process.exit(1);
  }

  const runDirectory = args[0];
  const generator = new HTMLReportGenerator();
  
  try {
    console.log(`🚀 Starting HTML report generation for: ${runDirectory}`);
    const reportPath = await generator.generateHTML(runDirectory);
    console.log('\n✅ HTML report generated successfully!');
    console.log(`🌐 Open in browser: file://${reportPath}`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ HTML report generation failed:', error.message);
    process.exit(1);
  }
}