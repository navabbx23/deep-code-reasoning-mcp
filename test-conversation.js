#!/usr/bin/env node
import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env }
});

// Helper to send JSON-RPC request
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
  
  return new Promise((resolve) => {
    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === request.id) {
          server.stdout.off('data', handler);
          resolve(response);
        }
      } catch (e) {
        // Ignore non-JSON output
      }
    };
    server.stdout.on('data', handler);
  });
}

async function testConversationalMCP() {
  console.log('Testing Conversational MCP...\n');
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // List available tools
  console.log('1. Listing available tools...');
  const toolsResponse = await sendRequest('tools/list');
  const conversationalTools = toolsResponse.result.tools.filter(t => 
    ['start_conversation', 'continue_conversation', 'finalize_conversation', 'get_conversation_status'].includes(t.name)
  );
  
  console.log(`Found ${conversationalTools.length} conversational tools:`, 
    conversationalTools.map(t => t.name).join(', '));
  
  // Start a conversation
  console.log('\n2. Starting a conversation...');
  const startResponse = await sendRequest('tools/call', {
    name: 'start_conversation',
    arguments: {
      claude_context: {
        attempted_approaches: ["Traced function calls", "Checked for loops"],
        partial_findings: [{ type: "performance", description: "Found N+1 queries" }],
        stuck_description: "Can't determine the full impact of these queries",
        code_scope: {
          files: ["src/services/UserService.ts"],
          entry_points: []
        }
      },
      analysis_type: "performance",
      initial_question: "How severe is the performance impact of these N+1 queries?"
    }
  });
  
  if (startResponse.error) {
    console.error('Error starting conversation:', startResponse.error);
  } else {
    console.log('Conversation started successfully!');
    console.log('Response preview:', startResponse.result.content[0].text.substring(0, 200) + '...');
  }
  
  // Clean up
  server.kill();
  process.exit(0);
}

// Handle errors
server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.includes('MCP server running') || line.includes('Deep Code Reasoning')) {
      testConversationalMCP().catch(console.error);
      return;
    }
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('Timeout: Server did not start');
  server.kill();
  process.exit(1);
}, 10000);