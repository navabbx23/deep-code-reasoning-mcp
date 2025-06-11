#!/usr/bin/env node
import { DeepCodeReasonerV2 } from './dist/analyzers/DeepCodeReasonerV2.js';

async function quickTest() {
  console.log('Testing conversational features...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    return;
  }
  
  const reasoner = new DeepCodeReasonerV2(apiKey);
  
  try {
    // Test starting a conversation
    const result = await reasoner.startConversation(
      {
        attemptedApproaches: ["Pattern matching", "Static analysis"],
        partialFindings: [{ type: "performance", severity: "high", location: { file: "test.ts", line: 10 }, description: "N+1 query", evidence: [] }],
        stuckPoints: ["Can't trace async execution flow"],
        focusArea: { files: ["test.ts"], entryPoints: [] },
        analysisBudgetRemaining: 60
      },
      "performance",
      "Where are the database calls coming from?"
    );
    
    console.log('✅ Conversation started successfully!');
    console.log('Session ID:', result.sessionId);
    console.log('Initial response preview:', result.initialResponse.substring(0, 200) + '...');
    console.log('Suggested follow-ups:', result.suggestedFollowUps);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickTest();