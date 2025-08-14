#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function fixSchemaEdges(filePath, outputPath) {
    console.log(`\n🔧 Fixing schema: ${path.basename(filePath)}`);
    
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const nodeIds = new Set(data.nodes.map(n => n.id));
    
    console.log(`   📊 Original: ${data.nodes.length} nodes, ${data.edges.length} edges`);
    
    // Filter out invalid edges
    const validEdges = data.edges.filter(edge => {
        const hasFrom = nodeIds.has(edge.from);
        const hasTo = nodeIds.has(edge.to);
        
        if (!hasFrom || !hasTo) {
            console.log(`   ❌ Removing invalid edge: ${edge.from} -> ${edge.to}`);
            return false;
        }
        return true;
    });
    
    console.log(`   ✅ Fixed: ${data.nodes.length} nodes, ${validEdges.length} edges`);
    console.log(`   🗑️  Removed ${data.edges.length - validEdges.length} invalid edges`);
    
    const fixedData = {
        ...data,
        edges: validEdges
    };
    
    await fs.writeFile(outputPath, JSON.stringify(fixedData, null, 2));
    console.log(`   💾 Saved to: ${path.basename(outputPath)}`);
    
    return fixedData;
}

async function main() {
    console.log('🔧 Schema Edge Fixer');
    console.log('====================');
    
    const originalPath = path.join(projectRoot, 'src/reference/schema_graph_original.json');
    const consolidatedPath = path.join(projectRoot, 'src/reference/schema_graph_consolidated.json');
    
    // Create fixed versions
    const originalFixed = await fixSchemaEdges(originalPath, 
        path.join(projectRoot, 'src/reference/schema_graph_original_fixed.json'));
    
    const consolidatedFixed = await fixSchemaEdges(consolidatedPath,
        path.join(projectRoot, 'src/reference/schema_graph_consolidated_fixed.json'));
    
    console.log('\n✅ Schema edge fixing complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Review the fixed schemas');
    console.log('   2. Replace the original files if satisfied');
    console.log('   3. Refresh the comparison tool to see edges');
    
    // Validate the fixes
    console.log('\n🔍 Validating fixed schemas...');
    
    const originalNodeIds = new Set(originalFixed.nodes.map(n => n.id));
    const consolidatedNodeIds = new Set(consolidatedFixed.nodes.map(n => n.id));
    
    const originalValidEdges = originalFixed.edges.every(e => 
        originalNodeIds.has(e.from) && originalNodeIds.has(e.to));
    
    const consolidatedValidEdges = consolidatedFixed.edges.every(e =>
        consolidatedNodeIds.has(e.from) && consolidatedNodeIds.has(e.to));
    
    console.log(`   Original fixed: ${originalValidEdges ? '✅ Valid' : '❌ Still invalid'}`);
    console.log(`   Consolidated fixed: ${consolidatedValidEdges ? '✅ Valid' : '❌ Still invalid'}`);
}

main().catch(console.error);