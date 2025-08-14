#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'text/plain';
}

function createServer(port = 8080) {
  const server = http.createServer((req, res) => {
    // Parse URL and handle root
    let filePath = req.url === '/' ? '/utils/schema-graph-comparison.html' : req.url;
    
    // Remove query parameters if any
    const urlPath = filePath.split('?')[0];
    const fullPath = path.join(projectRoot, urlPath);
    
    console.log(`📥 ${new Date().toLocaleTimeString()} - ${req.method} ${req.url} -> ${fullPath}`);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(projectRoot)) {
      console.log(`🚫 Forbidden: ${fullPath}`);
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.log(`❌ File not found: ${fullPath}`);
        res.writeHead(404);
        res.end(`File not found: ${urlPath}`);
        return;
      }

      // Read and serve file
      fs.readFile(fullPath, (err, data) => {
        if (err) {
          console.log(`💥 Server error reading: ${fullPath}`, err);
          res.writeHead(500);
          res.end(`Server error: ${err.message}`);
          return;
        }

        const mimeType = getMimeType(fullPath);
        console.log(`✅ Serving: ${urlPath} (${mimeType})`);
        
        res.writeHead(200, { 
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end(data);
      });
    });
  });

  return server;
}

async function main() {
  const PORT = 8080;
  
  console.log('🚀 Schema Graph Comparison Server');
  console.log('=================================');
  console.log(`📁 Serving from: ${projectRoot}`);
  
  // Check if required files exist
  const requiredFiles = [
    'src/reference/schema_graph_original.json',
    'src/reference/schema_graph_consolidated.json',
    'utils/schema-graph-comparison.html'
  ];

  const missingFiles = [];
  for (const filePath of requiredFiles) {
    const fullPath = path.join(projectRoot, filePath);
    try {
      await fs.promises.access(fullPath);
    } catch {
      missingFiles.push(filePath);
    }
  }

  if (missingFiles.length > 0) {
    console.error('❌ Error: Missing required files:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    process.exit(1);
  }

  console.log('✅ All required files found');

  // Start server
  const server = createServer(PORT);
  
  server.listen(PORT, (err) => {
    if (err) {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Error: Port ${PORT} is already in use`);
        console.error('   Try stopping other servers or use a different port');
      } else {
        console.error(`❌ Error starting server: ${err.message}`);
      }
      process.exit(1);
    }

    const url = `http://localhost:${PORT}`;
    console.log(`🌐 Server running at: ${url}`);
    console.log(`🔍 Opening comparison tool...`);

    // Open browser
    const openCommand = process.platform === 'darwin' ? 'open' : 
                      process.platform === 'win32' ? 'start' : 'xdg-open';
    
    try {
      spawn(openCommand, [url], { detached: true, stdio: 'ignore' });
      console.log('✅ Browser opened successfully!');
    } catch (error) {
      console.log(`⚠️  Could not auto-open browser. Please visit: ${url}`);
    }

    console.log('\n💡 Features:');
    console.log('   • Side-by-side force directed graphs');
    console.log('   • Interactive controls (node size, link distance, filters)');
    console.log('   • Difference summary with added/removed nodes');
    console.log('   • Hover tooltips for node details');
    console.log('   • Color-coded node types (Entity, Property, Knowledge)');
    console.log('\n⚡ Server is running. Press Ctrl+C to stop.');
  });

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.close(() => {
      console.log('✅ Server stopped');
      process.exit(0);
    });
  });
}

main().catch(console.error);