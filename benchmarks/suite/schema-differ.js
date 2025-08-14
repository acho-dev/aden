#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

export class SchemaDiffer {
  constructor() {
    this.schemas = new Map();
  }

  async loadSchema(name, filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const schema = JSON.parse(content);
      this.schemas.set(name, schema);
      return schema;
    } catch (error) {
      throw new Error(`Failed to load schema ${name}: ${error.message}`);
    }
  }

  compareSchemas(schema1Name, schema2Name) {
    const schema1 = this.schemas.get(schema1Name);
    const schema2 = this.schemas.get(schema2Name);
    
    if (!schema1 || !schema2) {
      throw new Error('Both schemas must be loaded before comparison');
    }

    return {
      nodes: this.compareNodes(schema1.nodes, schema2.nodes),
      edges: this.compareEdges(schema1.edges, schema2.edges),
      summary: this.generateSummary(schema1, schema2)
    };
  }

  compareNodes(nodes1, nodes2) {
    const nodeMap1 = new Map(nodes1.map(n => [n.id, n]));
    const nodeMap2 = new Map(nodes2.map(n => [n.id, n]));
    
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Find added and modified nodes
    for (const [id, node2] of nodeMap2) {
      const node1 = nodeMap1.get(id);
      if (!node1) {
        added.push(node2);
      } else if (JSON.stringify(node1) !== JSON.stringify(node2)) {
        modified.push({ id, old: node1, new: node2 });
      } else {
        unchanged.push(node2);
      }
    }

    // Find removed nodes
    for (const [id, node1] of nodeMap1) {
      if (!nodeMap2.has(id)) {
        removed.push(node1);
      }
    }

    return { added, removed, modified, unchanged };
  }

  compareEdges(edges1, edges2) {
    const edgeKey = (edge) => `${edge.from}-${edge.label}-${edge.to}`;
    const edgeMap1 = new Map(edges1.map(e => [edgeKey(e), e]));
    const edgeMap2 = new Map(edges2.map(e => [edgeKey(e), e]));
    
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Find added and modified edges
    for (const [key, edge2] of edgeMap2) {
      const edge1 = edgeMap1.get(key);
      if (!edge1) {
        added.push(edge2);
      } else if (JSON.stringify(edge1) !== JSON.stringify(edge2)) {
        modified.push({ key, old: edge1, new: edge2 });
      } else {
        unchanged.push(edge2);
      }
    }

    // Find removed edges
    for (const [key, edge1] of edgeMap1) {
      if (!edgeMap2.has(key)) {
        removed.push(edge1);
      }
    }

    return { added, removed, modified, unchanged };
  }

  generateSummary(schema1, schema2) {
    const nodes1 = schema1.nodes || [];
    const nodes2 = schema2.nodes || [];
    const edges1 = schema1.edges || [];
    const edges2 = schema2.edges || [];

    const knowledgeNodes1 = nodes1.filter(n => n.kind === 'Knowledge');
    const knowledgeNodes2 = nodes2.filter(n => n.kind === 'Knowledge');
    
    return {
      schema1: {
        totalNodes: nodes1.length,
        totalEdges: edges1.length,
        knowledgeNodes: knowledgeNodes1.length,
        entities: nodes1.filter(n => n.kind === 'Entity').length,
        properties: nodes1.filter(n => n.kind === 'Property').length
      },
      schema2: {
        totalNodes: nodes2.length,
        totalEdges: edges2.length,
        knowledgeNodes: knowledgeNodes2.length,
        entities: nodes2.filter(n => n.kind === 'Entity').length,
        properties: nodes2.filter(n => n.kind === 'Property').length
      },
      differences: {
        nodesDelta: nodes2.length - nodes1.length,
        edgesDelta: edges2.length - edges1.length,
        knowledgeNodesDelta: knowledgeNodes2.length - knowledgeNodes1.length
      }
    };
  }

  generateReport(comparison, outputPath) {
    let report = `# Schema Comparison Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    
    // Summary section
    report += `## Summary\n\n`;
    const summary = comparison.summary;
    
    report += `| Metric | Schema 1 | Schema 2 | Delta |\n`;
    report += `|--------|----------|----------|-------|\n`;
    report += `| Total Nodes | ${summary.schema1.totalNodes} | ${summary.schema2.totalNodes} | ${summary.differences.nodesDelta > 0 ? '+' : ''}${summary.differences.nodesDelta} |\n`;
    report += `| Total Edges | ${summary.schema1.totalEdges} | ${summary.schema2.totalEdges} | ${summary.differences.edgesDelta > 0 ? '+' : ''}${summary.differences.edgesDelta} |\n`;
    report += `| Knowledge Nodes | ${summary.schema1.knowledgeNodes} | ${summary.schema2.knowledgeNodes} | ${summary.differences.knowledgeNodesDelta > 0 ? '+' : ''}${summary.differences.knowledgeNodesDelta} |\n`;
    report += `| Entities | ${summary.schema1.entities} | ${summary.schema2.entities} | ${summary.schema2.entities - summary.schema1.entities > 0 ? '+' : ''}${summary.schema2.entities - summary.schema1.entities} |\n`;
    report += `| Properties | ${summary.schema1.properties} | ${summary.schema2.properties} | ${summary.schema2.properties - summary.schema1.properties > 0 ? '+' : ''}${summary.schema2.properties - summary.schema1.properties} |\n\n`;

    // Nodes differences
    if (comparison.nodes.added.length > 0) {
      report += `## Added Nodes (${comparison.nodes.added.length})\n\n`;
      comparison.nodes.added.forEach(node => {
        report += `### ${node.id}\n`;
        report += `- **Kind:** ${node.kind}\n`;
        if (node.data) report += `- **Data:** ${node.data}\n`;
        if (node.datatype) report += `- **Datatype:** ${node.datatype}\n`;
        if (node.entities) report += `- **Entities:** ${node.entities.join(', ')}\n`;
        if (node.properties) report += `- **Properties:** ${node.properties.join(', ')}\n`;
        report += `\n`;
      });
    }

    if (comparison.nodes.removed.length > 0) {
      report += `## Removed Nodes (${comparison.nodes.removed.length})\n\n`;
      comparison.nodes.removed.forEach(node => {
        report += `- ${node.id} (${node.kind})\n`;
      });
      report += `\n`;
    }

    // Edges differences
    if (comparison.edges.added.length > 0) {
      report += `## Added Edges (${comparison.edges.added.length})\n\n`;
      comparison.edges.added.forEach(edge => {
        report += `- **${edge.from}** --[${edge.label}]--> **${edge.to}**`;
        if (edge.score) report += ` (score: ${edge.score})`;
        report += `\n`;
      });
      report += `\n`;
    }

    if (comparison.edges.removed.length > 0) {
      report += `## Removed Edges (${comparison.edges.removed.length})\n\n`;
      comparison.edges.removed.forEach(edge => {
        report += `- **${edge.from}** --[${edge.label}]--> **${edge.to}**\n`;
      });
      report += `\n`;
    }

    return fs.writeFile(outputPath, report);
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, schema1Path, schema2Path, outputPath] = process.argv;
  
  if (!schema1Path || !schema2Path) {
    console.error('Usage: node schema-differ.js <schema1.json> <schema2.json> [output.md]');
    process.exit(1);
  }

  const differ = new SchemaDiffer();
  
  try {
    await differ.loadSchema('schema1', schema1Path);
    await differ.loadSchema('schema2', schema2Path);
    
    const comparison = differ.compareSchemas('schema1', 'schema2');
    
    if (outputPath) {
      await differ.generateReport(comparison, outputPath);
      console.log(`Comparison report saved to: ${outputPath}`);
    } else {
      console.log(JSON.stringify(comparison, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}