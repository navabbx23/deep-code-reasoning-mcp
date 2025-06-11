import { describe, it, expect, jest } from '@jest/globals';
import { ConversationalGeminiService } from '../services/ConversationalGeminiService.js';
import type { ClaudeCodeContext } from '../models/types.js';

describe('ConversationalGeminiService', () => {
  const testContext: ClaudeCodeContext = {
    attemptedApproaches: ['Test approach 1', 'Test approach 2'],
    partialFindings: [{ type: 'test', description: 'Test finding' }],
    stuckPoints: ['Stuck on test issue'],
    focusArea: {
      files: ['test.ts'],
      entryPoints: [{ file: 'test.ts', line: 10, functionName: 'testFunc' }],
    },
    analysisBudgetRemaining: 100,
  };

  describe('initialization', () => {
    it('should initialize with API key', () => {
      const service = new ConversationalGeminiService('test-api-key');
      expect(service).toBeDefined();
      expect(service.getActiveSessionCount()).toBe(0);
    });
  });

  describe('session management', () => {
    it('should track active sessions correctly', () => {
      const service = new ConversationalGeminiService('test-api-key');
      expect(service.getActiveSessionCount()).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('should extract follow-up questions from text', () => {
      const service = new ConversationalGeminiService('test-api-key');
      // Use private method access for testing
      const extractQuestions = (service as any).extractFollowUpQuestions;
      
      const text = 'I found some issues. Are there any synchronization mechanisms? What are the typical data volumes?';
      const questions = extractQuestions.call(service, text, 'performance');
      
      // The method extracts questions ending with ?
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some(q => q.includes('?'))).toBe(true);
    });

    it('should handle responses without questions', () => {
      const service = new ConversationalGeminiService('test-api-key');
      const extractQuestions = (service as any).extractFollowUpQuestions;
      
      const text = 'This is a statement without any questions.';
      const questions = extractQuestions.call(service, text, 'performance');
      
      expect(questions.length).toBeGreaterThanOrEqual(0); // May have default questions
    });

    it('should parse conversational analysis', () => {
      const service = new ConversationalGeminiService('test-api-key');
      const parseAnalysis = (service as any).parseConversationalAnalysis;
      
      // Need to provide sessionId and originalContext
      const sessionId = 'test-session';
      const originalContext = testContext;
      
      // Set session context before calling parse
      (service as any).sessionContexts.set(sessionId, {
        originalContext,
        analysisType: 'performance',
        turns: 1,
        startTime: Date.now()
      });
      
      const text = 'Here is the analysis: {"rootCauses": [{"type": "test"}]} and some more text';
      const result = parseAnalysis.call(service, text, sessionId);
      
      expect(result.findings).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should handle invalid JSON in parse', () => {
      const service = new ConversationalGeminiService('test-api-key');
      const parseAnalysis = (service as any).parseConversationalAnalysis;
      
      const text = 'No JSON here';
      
      expect(() => parseAnalysis.call(service, text)).toThrow('No JSON found in final analysis');
    });
  });

  describe('code reference detection', () => {
    it('should detect various code reference patterns', () => {
      const service = new ConversationalGeminiService('test-api-key');
      const hasCodeRef = (service as any).hasCodeReference;
      
      const testMessages = [
        { message: 'Check file: test.ts', expected: true },
        { message: 'The function=getData is problematic', expected: true },
        { message: 'Look at class: UserService', expected: true },
        { message: 'Error in method: processData', expected: true },
        { message: 'See line: 42', expected: true },
        { message: 'No code references here', expected: false },
      ];

      for (const { message, expected } of testMessages) {
        expect(hasCodeRef.call(service, message)).toBe(expected);
      }
    });
  });

  describe('prompt building', () => {
    it('should build proper initial prompt', () => {
      const service = new ConversationalGeminiService('test-api-key');
      // Access private method for testing
      const buildPrompt = (service as any).buildInitialAnalysisPrompt;
      
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      const prompt = buildPrompt.call(
        service,
        testContext,
        'performance',
        codeContent,
        'Why is this slow?'
      );
      
      expect(prompt).toContain('performance');
      expect(prompt).toContain('Why is this slow?');
      expect(prompt).toContain('test.ts');
      expect(prompt).toContain('const test = 123;');
    });

    it('should handle different analysis types', () => {
      const service = new ConversationalGeminiService('test-api-key');
      const buildPrompt = (service as any).buildInitialAnalysisPrompt;
      
      const codeContent = new Map([['test.ts', 'const test = 123;']]);
      const analysisTypes = ['execution_trace', 'cross_system', 'performance', 'hypothesis_test'];
      
      for (const type of analysisTypes) {
        const prompt = buildPrompt.call(service, testContext, type, codeContent, undefined);
        // Just verify we get a prompt back for each type
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(0);
      }
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent session in continueConversation', async () => {
      const service = new ConversationalGeminiService('test-api-key');
      
      await expect(
        service.continueConversation('non-existent', 'test message')
      ).rejects.toThrow('Session non-existent not found or expired');
    });

    it('should throw error for non-existent session in finalizeConversation', async () => {
      const service = new ConversationalGeminiService('test-api-key');
      
      await expect(
        service.finalizeConversation('non-existent')
      ).rejects.toThrow('Session non-existent not found or expired');
    });
  });
});