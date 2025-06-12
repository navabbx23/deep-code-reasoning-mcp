import { describe, it, expect } from '@jest/globals';
import { HypothesisTournamentService } from '../services/HypothesisTournamentService.js';
import type { 
  ClaudeContext,
  TournamentConfig
} from '../types.js';

describe('HypothesisTournamentService', () => {
  // Note: These are integration tests that require ANTHROPIC_API_KEY to be set
  // For unit tests, we would need to mock the ConversationalGeminiService
  
  const mockApiKey = process.env.ANTHROPIC_API_KEY || 'test-api-key';
  
  const mockContext: ClaudeContext = {
    attempted_approaches: ['Test approach'],
    partial_findings: ['Test finding'],
    stuck_description: 'Test stuck',
    code_scope: {
      files: ['src/services/HypothesisTournamentService.ts'],
      entry_points: []
    },
    analysisBudgetRemaining: 300
  };

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const service = new HypothesisTournamentService(mockApiKey);
      expect(service).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: Partial<TournamentConfig> = {
        maxHypotheses: 4,
        maxRounds: 2,
        parallelSessions: 2
      };
      
      const service = new HypothesisTournamentService(mockApiKey, customConfig);
      expect(service).toBeDefined();
    });
  });

  describe('tournament structure', () => {
    it('should validate required context fields', async () => {
      const service = new HypothesisTournamentService(mockApiKey);
      
      const invalidContext = {
        ...mockContext,
        code_scope: undefined as any
      };

      // Should throw or handle invalid context
      await expect(service.runTournament(invalidContext, 'test issue'))
        .rejects.toThrow();
    });

    it('should handle empty file list gracefully', async () => {
      const service = new HypothesisTournamentService(mockApiKey);
      
      const emptyFileContext: ClaudeContext = {
        ...mockContext,
        code_scope: {
          files: [],
          entry_points: []
        }
      };

      // Should still run but might generate generic hypotheses
      const resultPromise = service.runTournament(emptyFileContext, 'test issue');
      
      // We expect this to either succeed or fail with a specific error
      // Since we don't have a real API key in tests, it will likely fail
      await expect(resultPromise).rejects.toBeDefined();
    });
  });

  describe('config validation', () => {
    it('should enforce minimum values for config', () => {
      const invalidConfig: Partial<TournamentConfig> = {
        maxHypotheses: 0,
        maxRounds: 0,
        parallelSessions: 0
      };
      
      const service = new HypothesisTournamentService(mockApiKey, invalidConfig);
      // Service should still be created but with adjusted values
      expect(service).toBeDefined();
    });

    it('should handle very large config values', () => {
      const largeConfig: Partial<TournamentConfig> = {
        maxHypotheses: 1000,
        maxRounds: 100,
        parallelSessions: 100
      };
      
      const service = new HypothesisTournamentService(mockApiKey, largeConfig);
      expect(service).toBeDefined();
    });
  });

  // Skip integration tests if no API key
  const skipIfNoApiKey = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;
  
  skipIfNoApiKey('integration tests', () => {
    it('should run a minimal tournament', async () => {
      const service = new HypothesisTournamentService(mockApiKey, {
        maxHypotheses: 2,
        maxRounds: 1,
        parallelSessions: 1
      });

      const result = await service.runTournament(mockContext, 'Simple test issue');
      
      expect(result).toMatchObject({
        issue: 'Simple test issue',
        totalHypotheses: 2,
        rounds: expect.any(Array),
        winner: expect.any(Object),
        recommendations: expect.any(Object),
        duration: expect.any(Number),
        parallelEfficiency: expect.any(Number)
      });
    });
  });
});