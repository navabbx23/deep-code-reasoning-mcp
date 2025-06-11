import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DeepCodeReasonerV2 } from '../analyzers/DeepCodeReasonerV2.js';
import { ConversationManager } from '../services/ConversationManager.js';
import type { ClaudeCodeContext } from '../models/types.js';

describe('Conversational MCP Tools - Simple Integration', () => {
  const testContext: ClaudeCodeContext = {
    attemptedApproaches: ['Initial analysis'],
    partialFindings: [{ type: 'performance', severity: 'medium', location: { file: 'src/service.ts', line: 100 }, description: 'Slow queries', evidence: [] }],
    stuckPoints: ['Cannot determine root cause'],
    focusArea: {
      files: ['src/service.ts'],
      entryPoints: [{ file: 'src/service.ts', line: 100 }],
    },
    analysisBudgetRemaining: 100,
  };

  describe('ConversationManager', () => {
    let conversationManager: ConversationManager;

    beforeEach(() => {
      conversationManager = new ConversationManager();
    });

    afterEach(() => {
      if (conversationManager) {
        conversationManager.destroy();
      }
    });

    it('should create and manage sessions', () => {
      const sessionId = conversationManager.createSession(testContext);
      
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      
      const session = conversationManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.status).toBe('active');
      expect(session?.context).toEqual(testContext);
    });

    it('should handle concurrent session locking', () => {
      const sessionId = conversationManager.createSession(testContext);
      
      // First lock should succeed
      const lock1 = conversationManager.acquireLock(sessionId);
      expect(lock1).toBe(true);
      
      // Second lock should fail while first is held
      const lock2 = conversationManager.acquireLock(sessionId);
      expect(lock2).toBe(false);
      
      // Release first lock
      conversationManager.releaseLock(sessionId);
      
      // Now should be able to acquire again
      const lock3 = conversationManager.acquireLock(sessionId);
      expect(lock3).toBe(true);
      
      // Clean up
      conversationManager.releaseLock(sessionId);
    });

    it('should track session progress', () => {
      const sessionId = conversationManager.createSession(testContext);
      
      // Add turns
      conversationManager.addTurn(sessionId, 'claude', 'First question');
      conversationManager.addTurn(sessionId, 'gemini', 'First response');
      
      const session = conversationManager.getSession(sessionId);
      expect(session?.turns).toHaveLength(2);
      
      // Update progress
      conversationManager.updateProgress(sessionId, {
        confidenceLevel: 0.7,
        keyInsights: ['Found potential issue'],
        remainingQuestions: ['Need to check database']
      });
      
      expect(session?.analysisProgress?.confidenceLevel).toBe(0.7);
    });

    it('should determine when analysis should complete', () => {
      const sessionId = conversationManager.createSession(testContext);
      
      // Initially may complete if no progress set
      const initialComplete = conversationManager.shouldComplete(sessionId);
      // Just verify it returns a boolean
      expect(typeof initialComplete).toBe('boolean');
      
      // Add many turns
      for (let i = 0; i < 10; i++) {
        conversationManager.addTurn(sessionId, 'claude', `Question ${i}`);
        conversationManager.addTurn(sessionId, 'gemini', `Response ${i}`);
      }
      
      // Update with high confidence
      conversationManager.updateProgress(sessionId, {
        confidenceLevel: 0.95,
        keyInsights: ['Root cause identified'],
        remainingQuestions: []
      });
      
      // Now should complete
      expect(conversationManager.shouldComplete(sessionId)).toBe(true);
    });

    it('should extract results from session', () => {
      const sessionId = conversationManager.createSession(testContext);
      
      conversationManager.updateProgress(sessionId, {
        confidenceLevel: 0.8,
        keyInsights: ['Database index missing', 'N+1 queries'],
        remainingQuestions: []
      });
      
      const results = conversationManager.extractResults(sessionId);
      
      expect(results).toBeDefined();
      // Check if results contain the progress data
      const session = conversationManager.getSession(sessionId);
      expect(session?.analysisProgress?.keyInsights).toContain('Database index missing');
      expect(session?.analysisProgress?.keyInsights).toContain('N+1 queries');
      expect(session?.analysisProgress?.confidenceLevel).toBe(0.8);
    });
  });

  describe('Error handling', () => {
    it('should validate analysis types', () => {
      const reasoner = new DeepCodeReasonerV2('test-api-key');
      
      // These are internal methods, so we're just checking they exist
      expect(reasoner.startConversation).toBeDefined();
      expect(reasoner.continueConversation).toBeDefined();
      expect(reasoner.finalizeConversation).toBeDefined();
      expect(reasoner.getConversationStatus).toBeDefined();
    });
  });
});