import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ConversationalGeminiService } from '../services/ConversationalGeminiService.js';
import type { ClaudeCodeContext } from '../models/types.js';

// Mock GoogleGenerativeAI at module level
const mockSendMessage = jest.fn();
const mockStartChat = jest.fn();
const mockGetGenerativeModel = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe('ConversationalGeminiService', () => {
  let service: ConversationalGeminiService;
  let mockChat: any;

  const testContext: ClaudeCodeContext = {
    attemptedApproaches: ['Test approach 1', 'Test approach 2'],
    partialFindings: [{ type: 'test', description: 'Test finding' }],
    stuckPoints: ['Stuck on test issue'],
    codeScope: {
      files: ['test.ts'],
      entryPoints: [{ file: 'test.ts', line: 10, functionName: 'testFunc' }],
    },
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockSendMessage.mockReset();
    mockStartChat.mockReset();
    mockGetGenerativeModel.mockReset();

    // Setup mock sendMessage
    mockSendMessage.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue('Test response from Gemini'),
      },
    });

    // Create mock chat session
    mockChat = {
      sendMessage: mockSendMessage,
    };

    // Setup mock returns
    mockStartChat.mockReturnValue(mockChat);
    mockGetGenerativeModel.mockReturnValue({
      startChat: mockStartChat,
    });

    // Create service instance
    service = new ConversationalGeminiService('test-api-key');
  });

  describe('startConversation', () => {
    it('should start a new conversation session', async () => {
      const sessionId = 'test-session-123';
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      const result = await service.startConversation(
        sessionId,
        testContext,
        'performance',
        codeContent,
        'Why is this slow?'
      );

      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('suggestedFollowUps');
      expect(result.response).toBe('Test response from Gemini');
      expect(Array.isArray(result.suggestedFollowUps)).toBe(true);
      
      // Verify chat was started with proper history
      expect(mockStartChat).toHaveBeenCalledWith(
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
            expect.objectContaining({ role: 'model' }),
          ]),
        })
      );

      // Verify session was stored
      expect(service.getActiveSessionCount()).toBe(1);
    });

    it('should handle different analysis types', async () => {
      const analysisTypes = ['execution_trace', 'cross_system', 'performance', 'hypothesis_test'];
      const codeContent = new Map([['test.ts', 'const test = 123;']]);

      for (const analysisType of analysisTypes) {
        const result = await service.startConversation(
          `session-${analysisType}`,
          testContext,
          analysisType,
          codeContent
        );

        expect(result).toHaveProperty('response');
        expect(mockSendMessage).toHaveBeenCalled();
      }
    });

    it('should include initial question if provided', async () => {
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      const initialQuestion = 'Is this a memory leak?';

      await service.startConversation(
        'test-session',
        testContext,
        'performance',
        codeContent,
        initialQuestion
      );

      // Verify the initial question was included in the prompt
      const sentMessage = mockSendMessage.mock.calls[0][0];
      expect(sentMessage).toContain(initialQuestion);
    });
  });

  describe('continueConversation', () => {
    it('should continue an existing conversation', async () => {
      const sessionId = 'test-session-123';
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      // Start a conversation first
      await service.startConversation(
        sessionId,
        testContext,
        'performance',
        codeContent
      );

      // Continue the conversation
      const result = await service.continueConversation(
        sessionId,
        'What about database queries?'
      );

      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('analysisProgress');
      expect(result).toHaveProperty('canFinalize');
      expect(typeof result.analysisProgress).toBe('number');
      expect(typeof result.canFinalize).toBe('boolean');
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        service.continueConversation('non-existent', 'test message')
      ).rejects.toThrow('No active conversation found');
    });

    it('should enrich message with code snippets when requested', async () => {
      const sessionId = 'test-session-123';
      const codeContent = new Map([
        ['test.ts', 'function getData() {\n  return fetch("/api");\n}'],
      ]);
      
      // Start conversation
      await service.startConversation(
        sessionId,
        testContext,
        'performance',
        codeContent
      );

      // Mock a message with code reference
      const messageWithRef = 'The issue is in test.ts:2 where fetch is called';
      
      await service.continueConversation(
        sessionId,
        messageWithRef,
        true // includeCodeSnippets
      );

      // Verify enriched message was sent
      const sentMessage = mockSendMessage.mock.calls[1][0];
      expect(sentMessage).toContain('Referenced code:');
    });
  });

  describe('finalizeConversation', () => {
    it('should finalize and return structured results', async () => {
      const sessionId = 'test-session-123';
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      // Start conversation
      await service.startConversation(
        sessionId,
        testContext,
        'performance',
        codeContent
      );

      // Mock Gemini's final analysis response
      mockSendMessage.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue(`
            Analysis complete. Here are the findings:
            {
              "rootCauses": [{
                "type": "N+1 Query",
                "description": "Multiple database queries in a loop",
                "evidence": ["test.ts:15-20"],
                "confidence": 0.9,
                "fixStrategy": "Use batch loading"
              }],
              "keyFindings": [{
                "finding": "Inefficient data fetching",
                "significance": "Causes 10x slowdown",
                "evidence": ["Profiling data shows repeated queries"]
              }],
              "recommendations": {
                "immediate": ["Implement batch loading"],
                "investigate": ["Check for similar patterns"],
                "longTerm": ["Consider caching strategy"]
              }
            }
          `),
        },
      });

      const result = await service.finalizeConversation(sessionId, 'detailed');

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('recommendations');
      expect(result.findings.rootCauses).toHaveLength(1);
      expect(result.findings.rootCauses[0].type).toBe('N+1 Query');
      
      // Verify session was cleaned up
      expect(service.getActiveSessionCount()).toBe(0);
    });

    it('should handle different summary formats', async () => {
      const formats: Array<'detailed' | 'concise' | 'actionable'> = ['detailed', 'concise', 'actionable'];
      
      for (const format of formats) {
        const sessionId = `test-session-${format}`;
        const codeContent = new Map([['test.ts', 'const test = 123;']]);
        
        await service.startConversation(sessionId, testContext, 'performance', codeContent);
        
        // Mock response
        mockSendMessage.mockResolvedValueOnce({
          response: {
            text: jest.fn().mockReturnValue('{"rootCauses": [], "recommendations": {"immediate": []}}'),
          },
        });

        const result = await service.finalizeConversation(sessionId, format);
        expect(result.status).toBe('success');
      }
    });

    it('should handle parsing errors gracefully', async () => {
      const sessionId = 'test-session-123';
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      await service.startConversation(sessionId, testContext, 'performance', codeContent);

      // Mock invalid JSON response
      mockSendMessage.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('Invalid JSON response'),
        },
      });

      await expect(
        service.finalizeConversation(sessionId)
      ).rejects.toThrow('No JSON found in final analysis');
    });
  });

  describe('session management', () => {
    it('should track active sessions correctly', async () => {
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      expect(service.getActiveSessionCount()).toBe(0);

      // Start multiple sessions
      await service.startConversation('session-1', testContext, 'performance', codeContent);
      expect(service.getActiveSessionCount()).toBe(1);

      await service.startConversation('session-2', testContext, 'execution_trace', codeContent);
      expect(service.getActiveSessionCount()).toBe(2);

      // Finalize one session
      mockSendMessage.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('{"rootCauses": []}'),
        },
      });
      await service.finalizeConversation('session-1');
      expect(service.getActiveSessionCount()).toBe(1);
    });
  });

  describe('helper methods', () => {
    it('should extract follow-up questions from responses', async () => {
      const sessionId = 'test-session';
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      // Mock response with questions
      mockSendMessage.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue(
            'I found some issues. Are there any synchronization mechanisms? ' +
            'What are the typical data volumes?'
          ),
        },
      });

      const result = await service.startConversation(
        sessionId,
        testContext,
        'performance',
        codeContent
      );

      expect(result.suggestedFollowUps).toContain('Are there any synchronization mechanisms?');
      expect(result.suggestedFollowUps).toContain('What are the typical data volumes?');
    });

    it('should detect code references in messages', async () => {
      const sessionId = 'test-session';
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      
      await service.startConversation(sessionId, testContext, 'performance', codeContent);

      // Test various code reference patterns
      const testMessages = [
        'Check file: test.ts',
        'The function=getData is problematic',
        'Look at class: UserService',
        'Error in method: processData',
        'See line: 42',
      ];

      for (const message of testMessages) {
        await service.continueConversation(sessionId, message, true);
        // The enrichMessageWithCode method should have been called
        const sentMessage = mockSendMessage.mock.calls[mockSendMessage.mock.calls.length - 1][0];
        expect(sentMessage).toContain('Referenced code:');
      }
    });
  });
});