/**
 * Example of using the conversational MCP for AI-to-AI dialogue
 * between Claude and Gemini for deep code analysis
 */

// Example 1: Performance Analysis Conversation
async function performanceAnalysisExample() {
  // Claude starts the conversation
  const { sessionId, initialResponse, suggestedFollowUps } = await mcp.startConversation({
    claude_context: {
      attempted_approaches: [
        "Searched for N+1 query patterns",
        "Checked for obvious loops",
        "Analyzed database calls"
      ],
      partial_findings: [
        { type: "performance", description: "Found repeated DB calls in UserService" }
      ],
      stuck_description: "Can't determine if the performance issue is from algorithm complexity or I/O bottlenecks",
      code_scope: {
        files: ["src/services/UserService.ts", "src/repositories/UserRepository.ts"],
        entry_points: ["getUserWithDetails"]
      }
    },
    analysis_type: "performance",
    initial_question: "I see repeated database calls but can't trace the full execution flow. Are these calls necessary or could they be optimized?"
  });

  console.log("Gemini's initial analysis:", initialResponse);
  console.log("Suggested follow-ups:", suggestedFollowUps);

  // Claude provides more context based on Gemini's questions
  const response1 = await mcp.continueConversation({
    session_id: sessionId,
    message: "The getUserWithDetails function is called in a loop from the API handler. Each user triggers 3-4 additional queries for related data. The data volume is typically 100-1000 users per request.",
    include_code_snippets: true
  });

  // Gemini asks for specific runtime characteristics
  console.log("Gemini:", response1.response);
  // Expected: "That's a classic N+1 problem. Are these related queries for user roles, permissions, or preferences? Also, is there any caching layer between the service and database?"

  // Claude provides runtime details
  const response2 = await mcp.continueConversation({
    session_id: sessionId,
    message: "The queries are for: user roles (1 query), permissions (1-2 queries), and preferences (1 query). No caching layer currently exists. The database is PostgreSQL with average query time of 10-15ms."
  });

  // Gemini provides deeper analysis
  console.log("Gemini:", response2.response);
  console.log("Progress:", response2.analysisProgress);
  console.log("Can finalize:", response2.canFinalize);

  // Finalize the conversation
  const finalAnalysis = await mcp.finalizeConversation({
    session_id: sessionId,
    summary_format: "actionable"
  });

  console.log("Final recommendations:", finalAnalysis.recommendations);
}

// Example 2: Complex Execution Trace with Back-and-Forth
async function executionTraceExample() {
  // Claude initiates analysis of async execution flow
  const { sessionId, initialResponse } = await mcp.startConversation({
    claude_context: {
      attempted_approaches: [
        "Traced synchronous function calls",
        "Identified async/await patterns",
        "Looked for event emitters"
      ],
      partial_findings: [
        { type: "architecture", description: "Complex async flow with multiple event handlers" }
      ],
      stuck_description: "Lost track of execution when events are emitted - can't determine order of operations",
      code_scope: {
        files: ["src/workers/DataProcessor.ts", "src/events/EventBus.ts"],
        entry_points: ["processDataBatch"]
      }
    },
    analysis_type: "execution_trace"
  });

  // Conversational flow
  const conversation = [
    {
      claude: "I found event emitters for 'data.processed' and 'batch.complete' but can't trace their handlers",
      gemini: "I see the event handlers are registered dynamically. Are there any race conditions between these handlers?"
    },
    {
      claude: "Yes! Sometimes 'batch.complete' fires before all 'data.processed' events are handled. Here's the code where handlers are registered...",
      gemini: "This is a race condition. The batch completion check doesn't wait for pending promises. Let me trace the actual execution order..."
    }
  ];

  for (const turn of conversation) {
    const response = await mcp.continueConversation({
      session_id: sessionId,
      message: turn.claude,
      include_code_snippets: true
    });
    console.log("Gemini's response:", response.response);
  }

  // Get final execution trace
  const finalAnalysis = await mcp.finalizeConversation({
    session_id: sessionId,
    summary_format: "detailed"
  });

  console.log("Root causes found:", finalAnalysis.findings.rootCauses);
}

// Example 3: Hypothesis Testing Through Dialogue
async function hypothesisTestingExample() {
  const { sessionId } = await mcp.startConversation({
    claude_context: {
      attempted_approaches: ["Static analysis", "Pattern matching"],
      partial_findings: [
        { type: "bug", description: "Intermittent null pointer exceptions in production" }
      ],
      stuck_description: "Can't reproduce the issue locally - suspect it's related to concurrent access",
      code_scope: {
        files: ["src/cache/CacheManager.ts", "src/services/SessionService.ts"]
      }
    },
    analysis_type: "hypothesis_test",
    initial_question: "My hypothesis: the cache invalidation happens during read operations causing null returns. Can you help validate this?"
  });

  // Multi-turn hypothesis refinement
  await mcp.continueConversation({
    session_id: sessionId,
    message: "The cache uses a simple Map without synchronization. Multiple services access it concurrently."
  });

  const status = await mcp.getConversationStatus({ session_id: sessionId });
  console.log("Conversation status:", status);

  // Continue until ready to finalize
  while (!status.canFinalize) {
    // Continue conversation based on Gemini's questions
  }

  const result = await mcp.finalizeConversation({ session_id: sessionId });
  console.log("Validated hypotheses:", result.enrichedContext.validatedHypotheses);
}

// Example 4: Cross-System Impact Analysis with Progressive Discovery
async function crossSystemExample() {
  const { sessionId, initialResponse } = await mcp.startConversation({
    claude_context: {
      attempted_approaches: ["Checked API contracts", "Reviewed service dependencies"],
      partial_findings: [
        { type: "architecture", description: "API change in UserService affects multiple consumers" }
      ],
      stuck_description: "Can't trace all downstream impacts - some services use dynamic field access",
      code_scope: {
        files: ["src/api/UserAPI.ts"],
        service_names: ["UserService", "AuthService", "NotificationService"]
      }
    },
    analysis_type: "cross_system",
    initial_question: "Planning to change the user object structure. Which services will break?"
  });

  // Progressive discovery through conversation
  console.log("Initial impact assessment:", initialResponse);

  // Claude discovers new service dependencies during conversation
  await mcp.continueConversation({
    session_id: sessionId,
    message: "Just found that ReportingService also consumes user data through event streams. It expects the old field names."
  });

  await mcp.continueConversation({
    session_id: sessionId,
    message: "The AnalyticsService has a batch job that processes user updates. It uses reflection to access fields dynamically."
  });

  // Get comprehensive impact analysis
  const finalResult = await mcp.finalizeConversation({
    session_id: sessionId,
    summary_format: "detailed"
  });

  console.log("All affected services:", finalResult.findings.crossSystemImpacts);
  console.log("Breaking changes:", finalResult.recommendations.immediateActions);
}

export {
  performanceAnalysisExample,
  executionTraceExample,
  hypothesisTestingExample,
  crossSystemExample
};