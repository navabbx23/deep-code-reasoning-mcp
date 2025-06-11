import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConversationManager } from '../services/ConversationManager.js';
import type { ClaudeCodeContext } from '../models/types.js';

describe('ConversationManager Locking', () => {
  let manager: ConversationManager;
  
  const testContext: ClaudeCodeContext = {
    attemptedApproaches: ['test'],
    partialFindings: [],
    stuckPoints: ['test'],
    focusArea: { files: ['test.ts'], entryPoints: [] },
    analysisBudgetRemaining: 100
  };

  beforeEach(() => {
    manager = new ConversationManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should acquire lock on active session', () => {
    const sessionId = manager.createSession(testContext);
    
    // First lock should succeed
    const firstLock = manager.acquireLock(sessionId);
    expect(firstLock).toBe(true);
    
    // Verify session is now processing
    const session = manager.getSession(sessionId);
    expect(session?.status).toBe('processing');
    
    // Second lock should fail
    const secondLock = manager.acquireLock(sessionId);
    expect(secondLock).toBe(false);
  });

  it('should release lock properly', () => {
    const sessionId = manager.createSession(testContext);
    
    // Acquire and release lock
    expect(manager.acquireLock(sessionId)).toBe(true);
    manager.releaseLock(sessionId);
    
    // Should be able to acquire again
    expect(manager.acquireLock(sessionId)).toBe(true);
  });

  it('should not acquire lock on non-existent session', () => {
    const result = manager.acquireLock('non-existent-id');
    expect(result).toBe(false);
  });

  it('should handle concurrent operations correctly', async () => {
    const sessionId = manager.createSession(testContext);
    
    // Simulate concurrent operations
    const operations: Promise<boolean>[] = [];
    let successCount = 0;
    
    // Create 5 concurrent lock attempts
    for (let i = 0; i < 5; i++) {
      operations.push(
        new Promise((resolve) => {
          // Small random delay to simulate real concurrent access
          setTimeout(() => {
            const acquired = manager.acquireLock(sessionId);
            if (acquired) {
              successCount++;
              // Simulate some work
              setTimeout(() => {
                manager.releaseLock(sessionId);
              }, 50);
            }
            resolve(acquired);
          }, Math.random() * 10);
        })
      );
    }
    
    const results = await Promise.all(operations);
    
    // Only one should have succeeded
    expect(successCount).toBe(1);
    expect(results.filter(r => r === true)).toHaveLength(1);
    expect(results.filter(r => r === false)).toHaveLength(4);
  });
});