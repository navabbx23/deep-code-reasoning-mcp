import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConversationManager, ConversationState } from '../services/ConversationManager.js';
import type { ClaudeCodeContext } from '../models/types.js';

describe('ConversationManager', () => {
  let manager: ConversationManager;
  let mockGeminiSession: any;

  const testContext: ClaudeCodeContext = {
    attemptedApproaches: ['Approach 1'],
    partialFindings: [{ type: 'bug' as const, severity: 'low' as const, location: { file: 'test.ts', line: 1 }, description: 'Test finding', evidence: [] }],
    stuckPoints: ['Stuck point 1'],
    focusArea: {
      files: ['test.ts'],
      entryPoints: [],
    },
    analysisBudgetRemaining: 100,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new ConversationManager();
    mockGeminiSession = {
      sendMessage: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('createSession', () => {
    it('should create a new session with unique ID', () => {
      const sessionId1 = manager.createSession(testContext);
      const sessionId2 = manager.createSession(testContext);
      const session1 = manager.getSession(sessionId1);
      const session2 = manager.getSession(sessionId2);

      expect(session1!.sessionId).toBeTruthy();
      expect(session2!.sessionId).toBeTruthy();
      expect(session1!.sessionId).not.toBe(session2!.sessionId);
    });

    it('should initialize session with correct properties', () => {
      const sessionId = manager.createSession(testContext);
      const session = manager.getSession(sessionId);

      expect(session!.status).toBe('active');
      expect(session!.context).toEqual(testContext);
      expect(session!.turns).toEqual([]);
      expect(session!.analysisProgress).toEqual({
        completedSteps: [],
        pendingQuestions: [],
        keyFindings: [],
        confidenceLevel: 0,
      });
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session', () => {
      const sessionId = manager.createSession(testContext);
      const created = manager.getSession(sessionId);
      const retrieved = manager.getSession(sessionId);

      expect(retrieved!.sessionId).toEqual(sessionId);
    });

    it('should return null for non-existent session', () => {
      const session = manager.getSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('addTurn', () => {
    it('should add turn to session and update activity', () => {
      const sessionId = manager.createSession(testContext);
      const session = manager.getSession(sessionId);
      const initialActivity = session!.lastActivity;

      // Wait a bit to ensure timestamp difference
      jest.advanceTimersByTime(100);

      manager.addTurn(sessionId, 'claude', 'Test message', {
        analysisType: 'test',
      });

      const updated = manager.getSession(sessionId);
      expect(updated!.turns).toHaveLength(1);
      expect(updated!.turns[0]).toMatchObject({
        role: 'claude',
        content: 'Test message',
        metadata: { analysisType: 'test' },
      });
      expect(updated!.lastActivity).toBeGreaterThan(initialActivity);
    });

    it('should generate unique turn IDs', () => {
      const sessionId = manager.createSession(testContext);

      manager.addTurn(sessionId, 'claude', 'Message 1');
      manager.addTurn(sessionId, 'gemini', 'Message 2');

      const updated = manager.getSession(sessionId);
      const turnIds = updated!.turns.map(t => t.id);
      expect(new Set(turnIds).size).toBe(2);
    });

    it('should throw error when adding turn to non-existent session', () => {
      expect(() => {
        manager.addTurn('non-existent', 'claude', 'Test');
      }).toThrow('Session non-existent not found or expired');
    });
  });

  describe('updateProgress', () => {
    it('should update session progress correctly', () => {
      const sessionId = manager.createSession(testContext);

      manager.updateProgress(sessionId, {
        completedSteps: ['Step 1', 'Step 2'],
        pendingQuestions: ['Question 1'],
        keyFindings: [{ type: 'performance', detail: 'N+1 queries' }],
        confidenceLevel: 0.75,
      });

      const updated = manager.getSession(sessionId);
      expect(updated!.analysisProgress).toEqual({
        completedSteps: ['Step 1', 'Step 2'],
        pendingQuestions: ['Question 1'],
        keyFindings: [{ type: 'performance', detail: 'N+1 queries' }],
        confidenceLevel: 0.75,
      });
    });

    it('should merge progress updates', () => {
      const sessionId = manager.createSession(testContext);

      // First update
      manager.updateProgress(sessionId, {
        completedSteps: ['Step 1'],
        confidenceLevel: 0.5,
      });

      // Second update (partial)
      manager.updateProgress(sessionId, {
        pendingQuestions: ['New question'],
        confidenceLevel: 0.8,
      });

      const updated = manager.getSession(sessionId);
      expect(updated!.analysisProgress.completedSteps).toEqual(['Step 1']);
      expect(updated!.analysisProgress.pendingQuestions).toEqual(['New question']);
      expect(updated!.analysisProgress.confidenceLevel).toBe(0.8);
    });
  });

  describe('shouldComplete', () => {
    it('should determine when session should complete', () => {
      const sessionId = manager.createSession(testContext);

      // New session with no pending questions defaults to complete
      expect(manager.shouldComplete(sessionId)).toBe(true);

      // Add pending questions
      manager.updateProgress(sessionId, {
        pendingQuestions: ['Question 1', 'Question 2'],
        confidenceLevel: 0.5,
      });
      
      expect(manager.shouldComplete(sessionId)).toBe(false);

      // Update with high confidence
      manager.updateProgress(sessionId, {
        confidenceLevel: 0.95,
      });

      expect(manager.shouldComplete(sessionId)).toBe(true);
    });
  });

  describe('extractResults', () => {
    it('should extract analysis results from session', () => {
      const sessionId = manager.createSession(testContext);
      
      // Add some turns
      manager.addTurn(sessionId, 'claude', 'Question');
      manager.addTurn(sessionId, 'gemini', 'I found the issue');

      const results = manager.extractResults(sessionId);

      expect(results.status).toBe('success');
      expect(results.metadata!.sessionId).toBe(sessionId);
    });
  });

  describe('cleanup and session management', () => {
    it('should clean up abandoned sessions after timeout', () => {
      const sessionId1 = manager.createSession(testContext);
      const sessionId2 = manager.createSession(testContext);

      // Advance time past timeout for session1
      jest.advanceTimersByTime(31 * 60 * 1000); // 31 minutes

      // Create a new session to trigger cleanup interval
      const sessionId3 = manager.createSession(testContext);

      // Trigger cleanup
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes for interval

      // Session1 should be gone, others should remain
      expect(manager.getSession(sessionId1)).toBeNull();
      expect(manager.getSession(sessionId2)).toBeDefined();
      expect(manager.getSession(sessionId3)).toBeDefined();
    });

    it('should count only active sessions', () => {
      const sessionId1 = manager.createSession(testContext);
      const sessionId2 = manager.createSession(testContext);
      const sessionId3 = manager.createSession(testContext);

      expect(manager.getActiveSessionCount()).toBe(3);

      // Set high confidence to trigger 'completing' status
      manager.updateProgress(sessionId2, {
        confidenceLevel: 0.95,
      });

      // Session2 should now be 'completing', not 'active'
      expect(manager.getActiveSessionCount()).toBe(2);
    });
  });
});