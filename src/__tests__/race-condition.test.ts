import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConversationManager } from '../services/ConversationManager.js';
import type { ClaudeCodeContext } from '../models/types.js';

describe('Race Condition Prevention', () => {
  let conversationManager: ConversationManager;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Create a standalone ConversationManager for testing
    conversationManager = new ConversationManager();
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
    
    const sessionId = conversationManager.createSession(context);
    
    // Simulate concurrent operations trying to acquire lock
    let successCount = 0;
    const operations: Promise<boolean>[] = [];
    
    // Create multiple concurrent lock attempts
    for (let i = 0; i < 3; i++) {
      operations.push(
        new Promise((resolve) => {
          // Small delay to ensure they try to acquire at similar times
          setTimeout(() => {
            const acquired = conversationManager.acquireLock(sessionId);
            if (acquired) {
              successCount++;
              // Simulate some async work
              setTimeout(() => {
                conversationManager.releaseLock(sessionId);
                resolve(true);
              }, 50);
            } else {
              resolve(false);
            }
          }, i * 2); // Slight stagger to make race more likely
        })
      );
    }
    
    const results = await Promise.all(operations);
    
    // Only one should have succeeded in acquiring the lock
    expect(successCount).toBe(1);
    expect(results.filter(r => r === true)).toHaveLength(1);
    expect(results.filter(r => r === false)).toHaveLength(2);
  });

  it('should release lock properly after use', async () => {
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

    // First operation acquires lock
    const acquired1 = conversationManager.acquireLock(sessionId);
    expect(acquired1).toBe(true);
    
    // Second attempt should fail
    const acquired2 = conversationManager.acquireLock(sessionId);
    expect(acquired2).toBe(false);
    
    // Release the lock
    conversationManager.releaseLock(sessionId);
    
    // Now should be able to acquire again
    const acquired3 = conversationManager.acquireLock(sessionId);
    expect(acquired3).toBe(true);
    
    // Clean up
    conversationManager.releaseLock(sessionId);
  });

  it('should handle session state correctly with locking', () => {
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

    // Session should start as active
    let session = conversationManager.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.status).toBe('active');
    
    // Acquire lock - status should change to processing
    const acquired = conversationManager.acquireLock(sessionId);
    expect(acquired).toBe(true);
    
    session = conversationManager.getSession(sessionId);
    expect(session!.status).toBe('processing');
    
    // Release lock - status should go back to active
    conversationManager.releaseLock(sessionId);
    
    session = conversationManager.getSession(sessionId);
    expect(session!.status).toBe('active');
  });

  it('should not acquire lock on abandoned session', () => {
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
    
    // Manually set session to abandoned
    const session = conversationManager.getSession(sessionId);
    if (session) {
      session.status = 'abandoned';
    }
    
    // Should not be able to acquire lock on abandoned session
    const acquired = conversationManager.acquireLock(sessionId);
    expect(acquired).toBe(false);
  });

  it('should handle lock timeout correctly', () => {
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
    
    // Manually set lastActivity to past timeout
    const session = (conversationManager as any).sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now() - (31 * 60 * 1000); // 31 minutes ago
    }
    
    // Should not be able to acquire lock on timed out session
    const acquired = conversationManager.acquireLock(sessionId);
    expect(acquired).toBe(false);
  });
});