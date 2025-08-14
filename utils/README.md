# Schema Graph Comparison Utilities

Interactive visualization tools for comparing database schema graphs side-by-side.

## Overview

This directory contains utilities for visualizing and comparing the original schema graph with the consolidated schema graph that includes knowledge enhancements from multiple test cases.

## Files

- **`schema-graph-comparison.html`** - Interactive HTML visualization with D3.js force-directed graphs
- **`compare-schemas.js`** - Analysis script that examines schemas and opens the comparison tool
- **`serve-comparison.js`** - Local web server for proper CORS handling when loading JSON files

## Quick Start

### ⚡ Recommended: Local Web Server
```bash
# Run from project root  
node utils/serve-comparison.js
```

This will:
- Start a local web server on port 8080
- Automatically open the browser to the comparison tool
- Handle CORS issues with loading JSON files
- **This is the recommended method for full functionality**

### 📊 Analysis Only
```bash
# Run from project root
node utils/compare-schemas.js
```

This will:
- Analyze both schema files and show statistics
- List the knowledge nodes added in consolidation
- Attempt to open the comparison tool in your browser
- **Note**: May have CORS issues when loading graphs

## Features

### Interactive Visualization
- **Side-by-side graphs**: Original vs Consolidated schema
- **Force-directed layout**: Nodes repel each other for clear visualization
- **Color coding**: 
  - 🔵 Blue: Entity nodes
  - 🟢 Green: Property nodes  
  - 🔴 Red: Knowledge nodes (only in consolidated)
- **Edge types**:
  - Gray: HAS_PROPERTY relationships
  - Orange: RELATED_TO relationships
  - Purple: CORRELATE relationships

### Interactive Controls
- **Node Size**: Adjust node radius (4-20px)
- **Link Distance**: Control spacing between connected nodes (20-150px)
- **Show/Hide Labels**: Toggle node labels
- **Node Filter**: Show only specific node types (All, Entity, Property, Knowledge)

### Analysis Features
- **Difference Summary**: Lists added/removed nodes and edges
- **Statistics**: Node and edge counts by type
- **Hover Tooltips**: Detailed information for each node
- **Drag Interaction**: Click and drag nodes to explore relationships

## Schema Differences

The comparison reveals the enhancements made during consolidation:

### Added Knowledge Nodes (10 total)
- **ARR Calculation**: Rules for excluding churned revenue
- **Customer Status**: Definition of churned status ("02 Churned")
- **Revenue Analysis**: Current customer location (customers_1 table)
- **Team Information**: Frank is an engineer
- **Sales Pipeline**: Lead qualification and closing processes
- **Deal Scoring**: Importance of remarks and scores
- **Customer Relations**: Addressing customers by first name

### Enhanced Relationships
- **RELATED_TO edges**: Connect knowledge to relevant entities
- **CORRELATE edges**: Link knowledge across different domains

## Technical Details

### Data Structure
Both schemas follow the same format:
```json
{
  "nodes": [
    {
      "id": "entity_name",
      "kind": "Entity|Property|Knowledge",
      "datatype": "TEXT|NUMERIC|TIMESTAMP",  // for Properties
      "data": "knowledge content",           // for Knowledge nodes
      "entities": ["related_entities"],      // for Knowledge nodes
      "properties": ["related_properties"]   // for Knowledge nodes
    }
  ],
  "edges": [
    {
      "from": "source_node_id",
      "to": "target_node_id", 
      "label": "HAS_PROPERTY|RELATED_TO|CORRELATE",
      "score": 1.0
    }
  ]
}
```

### Browser Compatibility
- Modern browsers with ES6+ support
- D3.js v7 (loaded from CDN)
- Responsive design for different screen sizes

### Performance
- Handles 500+ nodes efficiently
- Force simulation with collision detection
- Optimized for interactive exploration

## Troubleshooting

### Graphs Not Loading
If the visualization shows "Loading comparison..." indefinitely:

1. **Use the web server**: Run `node utils/serve-comparison.js` instead of opening the HTML file directly
2. **Check console**: Open browser dev tools to see any error messages
3. **File paths**: Ensure schema files exist in `src/reference/`

### Browser Issues
- **CORS errors**: Use the local web server option
- **Performance**: Use node filtering for large schemas
- **Layout**: Refresh page if force simulation gets stuck

## Customization

### Styling
Edit the CSS in `schema-graph-comparison.html`:
- Colors: Modify `nodeColors` and `linkColors` objects
- Layout: Adjust force simulation parameters
- UI: Update control panel styling

### Data Processing
Modify the analysis functions:
- `analyzeSchema()`: Add new statistics
- `generateDifferenceSummary()`: Customize difference detection
- `filterData()`: Add new filtering options

## Examples

### Typical Usage Workflow
1. Run consolidation: Generate `schema_graph_consolidated.json`
2. Compare schemas: `node utils/compare-schemas.js`
3. Explore visually: Use interactive controls to focus on specific aspects
4. Analyze differences: Review the difference summary panel

### Investigation Scenarios
- **Knowledge Integration**: Filter to show only Knowledge nodes
- **Entity Relationships**: Examine how new knowledge connects to existing entities
- **Schema Evolution**: Compare node counts and relationship types
- **Domain Coverage**: Identify which business areas have knowledge enhancements

---

*Generated: 2025-07-24 - Schema comparison utilities for Aden MCP*