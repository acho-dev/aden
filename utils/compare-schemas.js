#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🔍 Schema Graph Comparison Tool');
  console.log('================================');

  // Check if schema files exist
  const projectRoot = path.resolve(__dirname, '..');
  const originalSchemaPath = path.join(projectRoot, 'src/reference/schema_graph_original.json');
  const consolidatedSchemaPath = path.join(projectRoot, 'src/reference/schema_graph_consolidated.json');
  const comparisonHtmlPath = path.join(__dirname, 'schema-graph-comparison.html');

  try {
    // Verify schema files exist
    await fs.access(originalSchemaPath);
    await fs.access(consolidatedSchemaPath);
    await fs.access(comparisonHtmlPath);
    
    console.log('✅ Original schema found:', originalSchemaPath);
    console.log('✅ Consolidated schema found:', consolidatedSchemaPath);
    console.log('✅ Comparison tool found:', comparisonHtmlPath);
  } catch (error) {
    console.error('❌ Error: Required files not found');
    console.error('   Make sure both schema files exist in src/reference/');
    process.exit(1);
  }

  // Load and analyze schemas
  console.log('\n📊 Schema Analysis:');
  try {
    const originalData = JSON.parse(await fs.readFile(originalSchemaPath, 'utf8'));
    const consolidatedData = JSON.parse(await fs.readFile(consolidatedSchemaPath, 'utf8'));

    console.log(`   Original: ${originalData.nodes.length} nodes, ${originalData.edges.length} edges`);
    console.log(`   Consolidated: ${consolidatedData.nodes.length} nodes, ${consolidatedData.edges.length} edges`);
    
    // Count knowledge nodes
    const originalKnowledge = originalData.nodes.filter(n => n.kind === 'Knowledge').length;
    const consolidatedKnowledge = consolidatedData.nodes.filter(n => n.kind === 'Knowledge').length;
    
    console.log(`   Knowledge nodes - Original: ${originalKnowledge}, Consolidated: ${consolidatedKnowledge}`);
    
    if (consolidatedKnowledge > originalKnowledge) {
      console.log(`   ➕ ${consolidatedKnowledge - originalKnowledge} new knowledge nodes added in consolidation`);
    }

    // Show knowledge node details if they exist
    if (consolidatedKnowledge > 0) {
      console.log('\n🧠 Knowledge Nodes in Consolidated Schema:');
      consolidatedData.nodes
        .filter(n => n.kind === 'Knowledge')
        .slice(0, 5) // Show first 5
        .forEach(node => {
          console.log(`   • ${node.id}: "${node.data}"`);
        });
      
      if (consolidatedKnowledge > 5) {
        console.log(`   ... and ${consolidatedKnowledge - 5} more knowledge nodes`);
      }
    }

  } catch (error) {
    console.error('❌ Error analyzing schemas:', error.message);
    process.exit(1);
  }

  // Open the comparison tool in default browser
  console.log('\n🚀 Opening schema comparison tool in your browser...');
  console.log(`   File: ${comparisonHtmlPath}`);
  
  try {
    // Determine the command to open the file based on platform
    let openCommand;
    switch (process.platform) {
      case 'darwin':
        openCommand = 'open';
        break;
      case 'win32':
        openCommand = 'start';
        break;
      default:
        openCommand = 'xdg-open';
    }

    spawn(openCommand, [comparisonHtmlPath], { detached: true, stdio: 'ignore' });
    
    console.log('✅ Comparison tool opened successfully!');
    console.log('\n💡 Features:');
    console.log('   • Side-by-side force directed graphs');
    console.log('   • Interactive node filtering and controls');
    console.log('   • Difference summary with added/removed nodes');
    console.log('   • Hover tooltips for detailed node information');
    console.log('   • Color-coded node types (Entity, Property, Knowledge)');
    console.log('\n📝 Note: The tool loads schema files via relative paths.');
    console.log('   If graphs don\'t load, serve the HTML file from a web server.');

  } catch (error) {
    console.error('❌ Error opening browser:', error.message);
    console.log('\n📋 Manual Instructions:');
    console.log(`   1. Open your web browser`);
    console.log(`   2. Navigate to: file://${comparisonHtmlPath}`);
    console.log(`   3. Or drag and drop the HTML file into your browser`);
  }
}

main().catch(console.error);