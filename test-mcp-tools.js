#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Start the MCP server
const server = spawn('node', [join(__dirname, 'dist/index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

let buffer = '';

server.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        if (msg.jsonrpc) {
          console.log('Response:', JSON.stringify(msg, null, 2));
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
  }
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('MCP server running')) {
    // Server is ready, send initialize request
    sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {}
    });
    
    // Then list tools
    setTimeout(() => {
      sendRequest('tools/list', {});
    }, 100);
    
    // Exit after a moment
    setTimeout(() => {
      server.kill();
      process.exit(0);
    }, 2000);
  }
});

function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  
  const message = JSON.stringify(request) + '\n';
  console.log('Sending:', method);
  server.stdin.write(message);
}

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});