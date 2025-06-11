#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Testing Deep Code Reasoning MCP Server with Gemini...\n');

// Start the server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

// Wait for server to start
await new Promise(resolve => setTimeout(resolve, 1000));

// Test 1: List tools
console.log('Test 1: Listing available tools...');
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
};

server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

// Test 2: Performance analysis
setTimeout(() => {
  console.log('\nTest 2: Testing performance bottleneck analysis...');
  
  // Create path to example file
  const exampleFile = join(__dirname, 'examples', 'performance-issue.ts');
  
  const performanceRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'performance_bottleneck',
      arguments: {
        code_path: {
          entry_point: {
            file: exampleFile,
            line: 15,
            function_name: 'getOrdersWithDetails'
          },
          suspected_issues: ['N+1 queries', 'memory leak']
        },
        profile_depth: 3
      }
    }
  };
  
  server.stdin.write(JSON.stringify(performanceRequest) + '\n');
}, 2000);

// Handle responses
let responseBuffer = '';
server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Try to parse complete JSON responses
  const lines = responseBuffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const response = JSON.parse(line);
        console.log('\nResponse received:');
        console.log(JSON.stringify(response, null, 2));
      } catch (e) {
        // Not complete JSON yet
      }
    }
  }
  responseBuffer = lines[lines.length - 1];
});

server.stderr.on('data', (data) => {
  console.error('Server log:', data.toString());
});

// Clean exit after 10 seconds
setTimeout(() => {
  console.log('\nTest completed. Shutting down server...');
  server.kill();
  process.exit(0);
}, 10000);