#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function debugSchema(filePath, name) {
    console.log(`\n🔍 Debugging ${name}:`);
    
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    console.log(`   📊 ${data.nodes.length} nodes, ${data.edges.length} edges`);
    
    // Check for problematic nodes
    const problematicNodes = [];
    const nodeIds = new Set();
    
    for (let i = 0; i < data.nodes.length; i++) {
        const node = data.nodes[i];
        
        if (!node) {
            problematicNodes.push(`Index ${i}: null/undefined node`);
            continue;
        }
        
        if (!node.id || node.id === undefined || node.id === null || node.id === '') {
            problematicNodes.push(`Index ${i}: missing/invalid id - ${JSON.stringify(node)}`);
            continue;
        }
        
        if (typeof node.id !== 'string') {
            problematicNodes.push(`Index ${i}: non-string id (${typeof node.id}) - ${JSON.stringify(node.id)}`);
            continue;
        }
        
        nodeIds.add(node.id);
    }
    
    if (problematicNodes.length > 0) {
        console.log(`   ❌ Found ${problematicNodes.length} problematic nodes:`);
        problematicNodes.slice(0, 10).forEach(issue => {
            console.log(`      • ${issue}`);
        });
        if (problematicNodes.length > 10) {
            console.log(`      ... and ${problematicNodes.length - 10} more`);
        }
    } else {
        console.log(`   ✅ All nodes have valid IDs`);
    }
    
    // Check for duplicate IDs
    const duplicates = [];
    const seenIds = new Set();
    data.nodes.forEach((node, i) => {
        if (node && node.id) {
            if (seenIds.has(node.id)) {
                duplicates.push(`${node.id} (index ${i})`);
            }
            seenIds.add(node.id);
        }
    });
    
    if (duplicates.length > 0) {
        console.log(`   ⚠️  Found ${duplicates.length} duplicate IDs:`);
        duplicates.slice(0, 10).forEach(dup => {
            console.log(`      • ${dup}`);
        });
    } else {
        console.log(`   ✅ No duplicate IDs found`);
    }
    
    // Check edges for problematic references
    const edgeIssues = [];
    data.edges.forEach((edge, i) => {
        if (!edge) {
            edgeIssues.push(`Index ${i}: null/undefined edge`);
            return;
        }
        
        if (!edge.from || edge.from === undefined || edge.from === null || edge.from === '') {
            edgeIssues.push(`Index ${i}: invalid 'from' - ${JSON.stringify(edge)}`);
            return;
        }
        
        if (!edge.to || edge.to === undefined || edge.to === null || edge.to === '') {
            edgeIssues.push(`Index ${i}: invalid 'to' - ${JSON.stringify(edge)}`);
            return;
        }
        
        if (typeof edge.from !== 'string') {
            edgeIssues.push(`Index ${i}: non-string 'from' (${typeof edge.from}) - ${JSON.stringify(edge.from)}`);
            return;
        }
        
        if (typeof edge.to !== 'string') {
            edgeIssues.push(`Index ${i}: non-string 'to' (${typeof edge.to}) - ${JSON.stringify(edge.to)}`);
            return;
        }
        
        if (!nodeIds.has(edge.from)) {
            edgeIssues.push(`Index ${i}: 'from' node not found: "${edge.from}"`);
        }
        
        if (!nodeIds.has(edge.to)) {
            edgeIssues.push(`Index ${i}: 'to' node not found: "${edge.to}"`);
        }
    });
    
    if (edgeIssues.length > 0) {
        console.log(`   ❌ Found ${edgeIssues.length} edge issues:`);
        edgeIssues.slice(0, 10).forEach(issue => {
            console.log(`      • ${issue}`);
        });
        if (edgeIssues.length > 10) {
            console.log(`      ... and ${edgeIssues.length - 10} more`);
        }
    } else {
        console.log(`   ✅ All edges reference valid nodes`);
    }
    
    // Sample first few nodes and edges for inspection
    console.log(`   📋 Sample nodes (first 3):`);
    data.nodes.slice(0, 3).forEach((node, i) => {
        console.log(`      ${i}: id="${node?.id}" kind="${node?.kind}" type=${typeof node?.id}`);
    });
    
    console.log(`   📋 Sample edges (first 3):`);
    data.edges.slice(0, 3).forEach((edge, i) => {
        console.log(`      ${i}: from="${edge?.from}" to="${edge?.to}" label="${edge?.label}"`);
        console.log(`         from_type=${typeof edge?.from} to_type=${typeof edge?.to}`);
    });
    
    return {
        nodeCount: data.nodes.length,
        edgeCount: data.edges.length,
        validNodes: data.nodes.length - problematicNodes.length,
        validEdges: data.edges.length - edgeIssues.length,
        issues: problematicNodes.length + edgeIssues.length
    };
}

async function main() {
    console.log('🐛 Schema Node Debugger');
    console.log('========================');
    
    const originalPath = path.join(projectRoot, 'src/reference/schema_graph_original.json');
    const consolidatedPath = path.join(projectRoot, 'src/reference/schema_graph_consolidated.json');
    
    const originalStats = await debugSchema(originalPath, 'Original Schema');
    const consolidatedStats = await debugSchema(consolidatedPath, 'Consolidated Schema');
    
    console.log('\n📋 Summary:');
    console.log(`   Original: ${originalStats.validNodes}/${originalStats.nodeCount} valid nodes, ${originalStats.validEdges}/${originalStats.edgeCount} valid edges`);
    console.log(`   Consolidated: ${consolidatedStats.validNodes}/${consolidatedStats.nodeCount} valid nodes, ${consolidatedStats.validEdges}/${consolidatedStats.edgeCount} valid edges`);
    
    if (originalStats.issues === 0 && consolidatedStats.issues === 0) {
        console.log('\n🎉 Both schemas appear to be clean!');
        console.log('   The D3.js issue might be in the visualization code itself.');
    } else {
        console.log(`\n⚠️  Found data issues that need fixing.`);
    }
}

main().catch(console.error);