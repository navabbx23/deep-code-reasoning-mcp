import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ConversationManager } from '../services/ConversationManager.js';
import { DeepCodeReasonerV2 } from '../analyzers/DeepCodeReasonerV2.js';
import type { ClaudeCodeContext } from '../models/types.js';

// Create mocks before importing
const mockContinueConversation = jest.fn();
const mockFinalizeConversation = jest.fn();
const mockStartConversation = jest.fn();
const mockReadFile = jest.fn();
const mockReadCodeFiles = jest.fn();
const mockFindRelatedFiles = jest.fn();

jest.mock('../services/ConversationalGeminiService.js', () => ({
  ConversationalGeminiService: jest.fn().mockImplementation(() => ({
    continueConversation: mockContinueConversation,
    finalizeConversation: mockFinalizeConversation,
    startConversation: mockStartConversation,
  })),
}));

jest.mock('../utils/CodeReader.js', () => ({
  CodeReader: jest.fn().mockImplementation(() => ({
    readFile: mockReadFile,
    readCodeFiles: mockReadCodeFiles,
    findRelatedFiles: mockFindRelatedFiles,
  })),
}));

jest.mock('../services/GeminiService.js', () => ({
  GeminiService: jest.fn().mockImplementation(() => ({
    analyzeWithGemini: jest.fn(),
    performPerformanceAnalysis: jest.fn(),
    testHypothesis: jest.fn(),
  })),
}));

// Import after mocking
import { ConversationalGeminiService } from '../services/ConversationalGeminiService.js';
import { CodeReader } from '../utils/CodeReader.js';
import { GeminiService } from '../services/GeminiService.js';

describe('Race Condition Prevention', () => {
  let deepReasoner: DeepCodeReasonerV2;
  let conversationManager: ConversationManager;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Create DeepCodeReasonerV2 with fake API key
    deepReasoner = new DeepCodeReasonerV2('fake-api-key');
    
    // Get the conversation manager from the reasoner
    conversationManager = (deepReasoner as any).conversationManager;

    // Mock CodeReader methods
    mockReadFile.mockResolvedValue('file content');
    mockReadCodeFiles.mockResolvedValue(new Map([['test.ts', 'content']]));
    mockFindRelatedFiles.mockResolvedValue([]);
  });

  afterEach(() => {
    // Clean up the ConversationManager to prevent Jest warning
    if (conversationManager) {
      conversationManager.destroy();
    }
  });

  it('should prevent concurrent access to the same session', async () => {
    // Create a session with proper context structure
    const context: ClaudeCodeContext = {
      attemptedApproaches: ['test approach'],
      partialFindings: [],
      stuckPoints: ['test stuck point'],
      focusArea: {
        files: ['test.ts'],
        entryPoints: []
      },
      analysisBudgetRemaining: 100
    };
    
    // We need to mock the ConversationalGeminiService to store sessions
    const mockSessions = new Map();
    const mockContexts = new Map();
    
    // Mock startConversation to create a session
    mockStartConversation.mockImplementation(async (sid, ctx) => {
      mockSessions.set(sid, { sessionId: sid });
      mockContexts.set(sid, { codeFiles: new Map() });
      return {
        response: 'Initial response',
        suggestedFollowUps: []
      };
    });
    
    // Mock continueConversation to check for session
    let geminiCallCount = 0;
    mockContinueConversation.mockImplementation(async (sid) => {
      if (!mockSessions.has(sid)) {
        throw new Error(`No active conversation found for session ${sid}`);
      }
      geminiCallCount++;
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        response: `Response ${geminiCallCount}`,
        analysisProgress: 0.5,
        canFinalize: false
      };
    });
    
    // First start a conversation to create the session
    const { sessionId } = await deepReasoner.startConversation(context, 'test');

    // Fire two requests - second one slightly delayed to ensure first acquires lock
    const promise1 = deepReasoner.continueConversation(sessionId, 'Message 1');
    const promise2 = new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
      deepReasoner.continueConversation(sessionId, 'Message 2')
    );

    // Wait for both to complete/fail
    const results = await Promise.allSettled([promise1, promise2]);

    // Log results for debugging
    console.log('Results:', results.map(r => r.status === 'rejected' ? `rejected: ${r.reason.message}` : 'fulfilled'));

    // Check that one succeeded and one failed
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    // Exactly one should succeed and one should fail
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // The failed one should have the lock error
    if (failed[0].status === 'rejected') {
      expect(failed[0].reason.message).toContain('currently processing another request');
    }

    // Only one Gemini call should have been made (from the successful request)
    expect(geminiCallCount).toBe(1);
  });

  it('should release lock even if operation fails', async () => {
    // Create a session
    const context: ClaudeCodeContext = {
      attemptedApproaches: ['test approach'],
      partialFindings: [],
      stuckPoints: ['test stuck point'],
      focusArea: {
        files: ['test.ts'],
        entryPoints: []
      },
      analysisBudgetRemaining: 100
    };
    const sessionId = conversationManager.createSession(context);

    // Mock Gemini to throw an error
    mockContinueConversation.mockRejectedValue(new Error('API Error'));

    // First request should fail but release lock
    await expect(deepReasoner.continueConversation(sessionId, 'Message 1')).rejects.toThrow('API Error');

    // Second request should be able to acquire lock
    mockContinueConversation.mockResolvedValue({
      response: 'Success',
      analysisProgress: 0.5,
      canFinalize: false
    });

    const result = await deepReasoner.continueConversation(sessionId, 'Message 2');
    expect(result.response).toBe('Success');
  });

  it('should handle session state correctly with locking', async () => {
    // Create a session
    const context: ClaudeCodeContext = {
      attemptedApproaches: ['test approach'],
      partialFindings: [],
      stuckPoints: ['test stuck point'],
      focusArea: {
        files: ['test.ts'],
        entryPoints: []
      },
      analysisBudgetRemaining: 100
    };
    const sessionId = conversationManager.createSession(context);

    // Mock successful Gemini response
    mockContinueConversation.mockResolvedValue({
      response: 'Test response',
      analysisProgress: 0.7,
      canFinalize: true
    });

    // Make a successful request
    const result = await deepReasoner.continueConversation(sessionId, 'Test message');

    // Verify the session has the correct turns
    const session = conversationManager.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.turns).toHaveLength(2); // Claude's message + Gemini's response
    expect(session!.turns[0].role).toBe('claude');
    expect(session!.turns[0].content).toBe('Test message');
    expect(session!.turns[1].role).toBe('gemini');
    expect(session!.turns[1].content).toBe('Test response');
  });

  it('should prevent race condition in finalize operation', async () => {
    // Create a session
    const context: ClaudeCodeContext = {
      attemptedApproaches: ['test approach'],
      partialFindings: [],
      stuckPoints: ['test stuck point'],
      focusArea: {
        files: ['test.ts'],
        entryPoints: []
      },
      analysisBudgetRemaining: 100
    };
    const sessionId = conversationManager.createSession(context);

    // Mock Gemini finalize with delay
    let finalizeCallCount = 0;
    mockFinalizeConversation.mockImplementation(async () => {
      finalizeCallCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        status: 'success',
        findings: {
          rootCauses: [],
          executionPaths: [],
          performanceBottlenecks: [],
          crossSystemImpacts: []
        },
        recommendations: {
          immediateActions: [],
          investigationNextSteps: [],
          codeChangesNeeded: []
        },
        enrichedContext: {
          newInsights: [],
          validatedHypotheses: [],
          ruledOutApproaches: []
        },
        metadata: {
          sessionId,
          totalTurns: 0,
          duration: 0,
          completedSteps: []
        }
      };
    });

    // Fire concurrent finalize requests with slight delay
    const promise1 = deepReasoner.finalizeConversation(sessionId);
    const promise2 = new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
      deepReasoner.finalizeConversation(sessionId)
    );

    const results = await Promise.allSettled([promise1, promise2]);

    // One should succeed, one should fail
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(finalizeCallCount).toBe(1);
  });
});