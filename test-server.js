#!/usr/bin/env node

// Simple test script to verify the MCP server is working
import { spawn } from 'child_process';

console.log('Testing Deep Code Reasoning MCP Server...');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send a list tools request
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
};

server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

// Handle responses
server.stdout.on('data', (data) => {
  console.log('Response:', data.toString());
});

server.stderr.on('data', (data) => {
  console.error('Server log:', data.toString());
});

// Clean exit after 2 seconds
setTimeout(() => {
  server.kill();
  process.exit(0);
}, 2000);