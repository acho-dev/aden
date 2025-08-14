#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function validateSchema(filePath, name) {
    console.log(`\n🔍 Validating ${name}:`);
    console.log(`   File: ${filePath}`);
    
    try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        
        console.log(`   ✅ JSON is valid`);
        console.log(`   📊 ${data.nodes.length} nodes, ${data.edges.length} edges`);
        
        // Check for required properties
        if (!data.nodes || !Array.isArray(data.nodes)) {
            throw new Error('Missing or invalid nodes array');
        }
        
        if (!data.edges || !Array.isArray(data.edges)) {
            throw new Error('Missing or invalid edges array');
        }
        
        // Validate nodes
        const nodeIds = new Set();
        const nodesByKind = {};
        
        for (let i = 0; i < data.nodes.length; i++) {
            const node = data.nodes[i];
            
            if (!node.id) {
                console.warn(`   ⚠️  Node ${i} missing id`);
                continue;
            }
            
            if (nodeIds.has(node.id)) {
                console.warn(`   ⚠️  Duplicate node id: ${node.id}`);
            }
            
            nodeIds.add(node.id);
            nodesByKind[node.kind] = (nodesByKind[node.kind] || 0) + 1;
        }
        
        console.log(`   📈 Node types: ${Object.entries(nodesByKind).map(([k,v]) => `${k}(${v})`).join(', ')}`);
        
        // Validate edges
        const invalidEdges = [];
        const edgesByLabel = {};
        
        for (let i = 0; i < data.edges.length; i++) {
            const edge = data.edges[i];
            
            if (!edge.from || !edge.to) {
                console.warn(`   ⚠️  Edge ${i} missing from/to: ${JSON.stringify(edge)}`);
                continue;
            }
            
            if (!nodeIds.has(edge.from)) {
                invalidEdges.push(`${edge.from} -> ${edge.to} (missing source node: ${edge.from})`);
            }
            
            if (!nodeIds.has(edge.to)) {
                invalidEdges.push(`${edge.from} -> ${edge.to} (missing target node: ${edge.to})`);
            }
            
            edgesByLabel[edge.label] = (edgesByLabel[edge.label] || 0) + 1;
        }
        
        console.log(`   🔗 Edge types: ${Object.entries(edgesByLabel).map(([k,v]) => `${k}(${v})`).join(', ')}`);
        
        if (invalidEdges.length > 0) {
            console.log(`   ❌ Invalid edges found (${invalidEdges.length}):`);
            invalidEdges.slice(0, 10).forEach(edge => {
                console.log(`      • ${edge}`);
            });
            if (invalidEdges.length > 10) {
                console.log(`      ... and ${invalidEdges.length - 10} more`);
            }
            return false;
        } else {
            console.log(`   ✅ All edges are valid`);
            return true;
        }
        
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🔍 Schema Validation Tool');
    console.log('=========================');
    
    const originalPath = path.join(projectRoot, 'src/reference/schema_graph_original.json');
    const consolidatedPath = path.join(projectRoot, 'src/reference/schema_graph_consolidated.json');
    
    const originalValid = await validateSchema(originalPath, 'Original Schema');
    const consolidatedValid = await validateSchema(consolidatedPath, 'Consolidated Schema');
    
    console.log('\n📋 Summary:');
    console.log(`   Original Schema: ${originalValid ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`   Consolidated Schema: ${consolidatedValid ? '✅ Valid' : '❌ Invalid'}`);
    
    if (originalValid && consolidatedValid) {
        console.log('\n🎉 Both schemas are valid! The comparison tool should work properly.');
    } else {
        console.log('\n⚠️  Schema validation issues found. Fix these before using the comparison tool.');
    }
}

main().catch(console.error);