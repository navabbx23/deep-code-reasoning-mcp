import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DeepCodeReasonerV2 } from '../analyzers/DeepCodeReasonerV2.js';
import type { ClaudeCodeContext } from '../models/types.js';

// Mock the services
jest.mock('../services/ConversationalGeminiService.js');
jest.mock('../services/ConversationManager.js');

describe('Conversational MCP Tools Integration', () => {
  let reasoner: DeepCodeReasonerV2;
  let mockConversationalService: any;
  let mockConversationManager: any;

  const testContext: ClaudeCodeContext = {
    attemptedApproaches: ['Initial analysis'],
    partialFindings: [{ type: 'performance', description: 'Slow queries' }],
    stuckPoints: ['Cannot determine root cause'],
    codeScope: {
      files: ['src/service.ts'],
      entryPoints: [{ file: 'src/service.ts', line: 100 }],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock services
    mockConversationalService = {
      startConversation: jest.fn(),
      continueConversation: jest.fn(),
      finalizeConversation: jest.fn(),
      getActiveSessionCount: jest.fn(),
    };

    mockConversationManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      updateStatus: jest.fn(),
      addTurn: jest.fn(),
      estimateCompletion: jest.fn(),
      canFinalize: jest.fn(),
      setGeminiSession: jest.fn(),
    };

    // Mock the imports
    jest.doMock('../services/ConversationalGeminiService.js', () => ({
      ConversationalGeminiService: jest.fn(() => mockConversationalService),
    }));

    jest.doMock('../services/ConversationManager.js', () => ({
      ConversationManager: jest.fn(() => mockConversationManager),
    }));

    reasoner = new DeepCodeReasonerV2('test-api-key');
    // Inject mocks
    (reasoner as any).conversationalService = mockConversationalService;
    (reasoner as any).conversationManager = mockConversationManager;
  });

  describe('startConversation', () => {
    it('should start a new conversational analysis session', async () => {
      const mockSessionState = {
        sessionId: 'test-session-123',
        status: 'active',
        context: testContext,
        turns: [],
      };

      mockConversationManager.createSession.mockReturnValue(mockSessionState);
      mockConversationalService.startConversation.mockResolvedValue({
        response: 'Initial analysis from Gemini',
        suggestedFollowUps: ['What about caching?', 'Are there indexes?'],
      });

      const result = await reasoner.startConversation(
        testContext,
        'performance',
        'Why are queries slow?'
      );

      expect(result).toMatchObject({
        sessionId: 'test-session-123',
        initialResponse: 'Initial analysis from Gemini',
        suggestedFollowUps: ['What about caching?', 'Are there indexes?'],
        status: 'active',
      });

      // Verify service calls
      expect(mockConversationManager.createSession).toHaveBeenCalledWith(
        testContext,
        'performance'
      );
      expect(mockConversationalService.startConversation).toHaveBeenCalledWith(
        'test-session-123',
        testContext,
        'performance',
        expect.any(Map), // Code content
        'Why are queries slow?'
      );
    });

    it('should handle errors gracefully', async () => {
      mockConversationManager.createSession.mockReturnValue({
        sessionId: 'test-session',
        status: 'active',
      });
      mockConversationalService.startConversation.mockRejectedValue(
        new Error('API rate limit')
      );

      await expect(
        reasoner.startConversation(testContext, 'performance')
      ).rejects.toThrow('API rate limit');
    });
  });

  describe('continueConversation', () => {
    it('should continue an existing conversation', async () => {
      const mockSession = {
        sessionId: 'test-session-123',
        status: 'active',
        turns: [{ role: 'claude', content: 'Previous message' }],
      };

      mockConversationManager.getSession.mockReturnValue(mockSession);
      mockConversationalService.continueConversation.mockResolvedValue({
        response: 'Further analysis from Gemini',
        analysisProgress: 0.6,
        canFinalize: true,
      });
      mockConversationManager.estimateCompletion.mockReturnValue(0.6);
      mockConversationManager.canFinalize.mockReturnValue(true);

      const result = await reasoner.continueConversation(
        'test-session-123',
        'What about database indexes?',
        true
      );

      expect(result).toMatchObject({
        response: 'Further analysis from Gemini',
        analysisProgress: 0.6,
        canFinalize: true,
        status: 'active',
      });

      // Verify turn was added
      expect(mockConversationManager.addTurn).toHaveBeenCalledWith(
        'test-session-123',
        'claude',
        'What about database indexes?'
      );
    });

    it('should handle non-existent sessions', async () => {
      mockConversationManager.getSession.mockReturnValue(undefined);

      await expect(
        reasoner.continueConversation('non-existent', 'message')
      ).rejects.toThrow('Session not found: non-existent');
    });

    it('should prevent continuing completed sessions', async () => {
      mockConversationManager.getSession.mockReturnValue({
        sessionId: 'test-session',
        status: 'completed',
      });

      await expect(
        reasoner.continueConversation('test-session', 'message')
      ).rejects.toThrow('Session test-session is not active');
    });
  });

  describe('finalizeConversation', () => {
    it('should finalize and return structured results', async () => {
      const mockSession = {
        sessionId: 'test-session-123',
        status: 'active',
      };

      const mockAnalysisResult = {
        status: 'success',
        findings: {
          rootCauses: [{
            type: 'Database',
            description: 'Missing indexes on foreign keys',
            confidence: 0.9,
          }],
        },
        recommendations: {
          immediateActions: [{
            type: 'fix',
            description: 'Add composite index',
            priority: 'high',
          }],
        },
        metadata: {
          sessionId: 'test-session-123',
          totalTurns: 5,
          duration: 120000,
        },
      };

      mockConversationManager.getSession.mockReturnValue(mockSession);
      mockConversationalService.finalizeConversation.mockResolvedValue(mockAnalysisResult);

      const result = await reasoner.finalizeConversation(
        'test-session-123',
        'actionable'
      );

      expect(result).toEqual(mockAnalysisResult);
      expect(mockConversationManager.updateStatus).toHaveBeenCalledWith(
        'test-session-123',
        'completed'
      );
    });

    it('should handle finalization errors', async () => {
      mockConversationManager.getSession.mockReturnValue({
        sessionId: 'test-session',
        status: 'active',
      });
      mockConversationalService.finalizeConversation.mockRejectedValue(
        new Error('Failed to generate summary')
      );

      await expect(
        reasoner.finalizeConversation('test-session')
      ).rejects.toThrow('Failed to generate summary');

      // Status should be updated to abandoned on error
      expect(mockConversationManager.updateStatus).toHaveBeenCalledWith(
        'test-session',
        'abandoned'
      );
    });
  });

  describe('getConversationStatus', () => {
    it('should return current conversation status', async () => {
      const mockSession = {
        sessionId: 'test-session-123',
        status: 'active',
        turns: [
          { role: 'claude', content: 'Q1' },
          { role: 'gemini', content: 'A1' },
          { role: 'claude', content: 'Q2' },
        ],
        lastActivity: Date.now() - 5000,
      };

      mockConversationManager.getSession.mockReturnValue(mockSession);
      mockConversationManager.estimateCompletion.mockReturnValue(0.7);
      mockConversationManager.canFinalize.mockReturnValue(true);

      const result = await reasoner.getConversationStatus('test-session-123');

      expect(result).toMatchObject({
        sessionId: 'test-session-123',
        status: 'active',
        turnCount: 3,
        lastActivity: mockSession.lastActivity,
        progress: 0.7,
        canFinalize: true,
      });
    });

    it('should handle missing sessions', async () => {
      mockConversationManager.getSession.mockReturnValue(null);

      const result = await reasoner.getConversationStatus('non-existent');
      
      expect(result).toMatchObject({
        sessionId: 'non-existent',
        status: 'not_found',
        turnCount: 0,
        progress: 0,
        canFinalize: false,
      });
    });
  });

  describe('Code reading integration', () => {
    it('should read code files for conversation context', async () => {
      // Mock file reading
      const mockCodeReader = {
        readCodeFiles: jest.fn().mockResolvedValue(
          new Map([
            ['src/service.ts', 'class Service { query() {} }'],
            ['src/db.ts', 'class DB { find() {} }'],
          ])
        ),
      };
      (reasoner as any).codeReader = mockCodeReader;

      mockConversationManager.createSession.mockReturnValue({
        sessionId: 'test-session',
        status: 'active',
      });
      mockConversationalService.startConversation.mockResolvedValue({
        response: 'Analysis started',
        suggestedFollowUps: [],
      });

      const contextWithFiles: ClaudeCodeContext = {
        ...testContext,
        codeScope: {
          files: ['src/service.ts', 'src/db.ts'],
        },
      };

      await reasoner.startConversation(contextWithFiles, 'performance');

      expect(mockCodeReader.readCodeFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ['src/service.ts', 'src/db.ts'],
        })
      );

      // Verify code content was passed to conversational service
      expect(mockConversationalService.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'performance',
        expect.objectContaining({
          size: 2, // Map with 2 files
        }),
        undefined
      );
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty code scope', async () => {
      const contextNoFiles: ClaudeCodeContext = {
        ...testContext,
        codeScope: { files: [] },
      };

      mockConversationManager.createSession.mockReturnValue({
        sessionId: 'test-session',
        status: 'active',
      });
      mockConversationalService.startConversation.mockResolvedValue({
        response: 'Started without code',
        suggestedFollowUps: [],
      });

      const mockCodeReader = {
        readCodeFiles: jest.fn().mockResolvedValue(new Map()),
      };
      (reasoner as any).codeReader = mockCodeReader;

      await reasoner.startConversation(contextNoFiles, 'hypothesis_test');

      // Should call readCodeFiles with empty files array
      expect(mockCodeReader.readCodeFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [],
        })
      );
    });

    it('should validate analysis types', async () => {
      mockConversationManager.createSession.mockReturnValue({
        sessionId: 'test-session',
        status: 'active',
      });
      
      const mockCodeReader = {
        readCodeFiles: jest.fn().mockResolvedValue(new Map()),
      };
      (reasoner as any).codeReader = mockCodeReader;

      // Valid types should work
      const validTypes = ['execution_trace', 'cross_system', 'performance', 'hypothesis_test'];
      for (const type of validTypes) {
        mockConversationalService.startConversation.mockResolvedValue({
          response: 'OK',
          suggestedFollowUps: [],
        });
        
        await expect(
          reasoner.startConversation(testContext, type as any)
        ).resolves.toBeDefined();
      }
    });
  });
});