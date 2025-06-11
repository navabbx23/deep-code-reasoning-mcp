#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Testing Gemini Analysis...\n');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

// Wait for server to start
await new Promise(resolve => setTimeout(resolve, 1000));

// Test with a simple performance analysis
const exampleFile = join(__dirname, 'examples', 'performance-issue.ts');

const request = {
  jsonrpc: '2.0',
  id: 1,
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

console.log('Sending performance analysis request...\n');
server.stdin.write(JSON.stringify(request) + '\n');

// Handle response
let responseBuffer = '';
let responseReceived = false;

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Try to parse complete JSON responses
  const lines = responseBuffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const response = JSON.parse(line);
        if (response.id === 1) {
          responseReceived = true;
          console.log('=== GEMINI ANALYSIS RESULT ===\n');
          
          if (response.result?.content?.[0]?.text) {
            const result = JSON.parse(response.result.content[0].text);
            console.log('Analysis:', result.analysis);
            console.log('\nFiles analyzed:', result.filesAnalyzed);
          } else if (response.error) {
            console.error('Error:', response.error.message);
          }
        }
      } catch (e) {
        // Not complete JSON yet
      }
    }
  }
  responseBuffer = lines[lines.length - 1];
});

server.stderr.on('data', (data) => {
  const message = data.toString();
  if (!message.includes('Deep Code Reasoning MCP server')) {
    console.error('Server log:', message);
  }
});

// Wait for response or timeout
setTimeout(() => {
  if (!responseReceived) {
    console.log('\nNo response received within timeout.');
  }
  console.log('\nShutting down...');
  server.kill();
  process.exit(0);
}, 15000);