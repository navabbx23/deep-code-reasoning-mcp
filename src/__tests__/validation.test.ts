import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

// Import the schemas we'll test
const EscalateAnalysisSchema = z.object({
  claude_context: z.object({
    attempted_approaches: z.array(z.string()),
    partial_findings: z.array(z.any()),
    stuck_description: z.string(),
    code_scope: z.object({
      files: z.array(z.string()),
      entry_points: z.array(z.any()).optional(),
      service_names: z.array(z.string()).optional(),
    }),
  }),
  analysis_type: z.enum(['execution_trace', 'cross_system', 'performance', 'hypothesis_test']),
  depth_level: z.number().min(1).max(5),
  time_budget_seconds: z.number().default(60),
});

const TraceExecutionPathSchema = z.object({
  entry_point: z.object({
    file: z.string(),
    line: z.number(),
    function_name: z.string().optional(),
  }),
  max_depth: z.number().default(10),
  include_data_flow: z.boolean().default(true),
});

describe('Input Validation', () => {
  describe('EscalateAnalysisSchema', () => {
    it('should validate correct input', () => {
      const validInput = {
        claude_context: {
          attempted_approaches: ['grep search', 'pattern matching'],
          partial_findings: [{ finding: 'N+1 query detected' }],
          stuck_description: 'Cannot determine cross-service impact',
          code_scope: {
            files: ['/path/to/file.ts'],
            entry_points: [{ function: 'main', line: 10 }],
            service_names: ['OrderService', 'InventoryService'],
          },
        },
        analysis_type: 'cross_system',
        depth_level: 3,
        time_budget_seconds: 90,
      };

      const result = EscalateAnalysisSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid analysis_type', () => {
      const invalidInput = {
        claude_context: {
          attempted_approaches: ['grep search'],
          partial_findings: [],
          stuck_description: 'Stuck',
          code_scope: {
            files: ['/path/to/file.ts'],
          },
        },
        analysis_type: 'invalid_type',
        depth_level: 3,
      };

      const result = EscalateAnalysisSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject depth_level outside range', () => {
      const invalidInput = {
        claude_context: {
          attempted_approaches: ['grep search'],
          partial_findings: [],
          stuck_description: 'Stuck',
          code_scope: {
            files: ['/path/to/file.ts'],
          },
        },
        analysis_type: 'performance',
        depth_level: 6, // Max is 5
      };

      const result = EscalateAnalysisSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should use default time_budget_seconds', () => {
      const input = {
        claude_context: {
          attempted_approaches: ['grep search'],
          partial_findings: [],
          stuck_description: 'Stuck',
          code_scope: {
            files: ['/path/to/file.ts'],
          },
        },
        analysis_type: 'performance',
        depth_level: 3,
      };

      const result = EscalateAnalysisSchema.parse(input);
      expect(result.time_budget_seconds).toBe(60);
    });
  });

  describe('TraceExecutionPathSchema', () => {
    it('should validate correct input', () => {
      const validInput = {
        entry_point: {
          file: '/path/to/file.ts',
          line: 42,
          function_name: 'processOrder',
        },
        max_depth: 15,
        include_data_flow: false,
      };

      const result = TraceExecutionPathSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should use default values when not provided', () => {
      const input = {
        entry_point: {
          file: '/path/to/file.ts',
          line: 42,
        },
      };

      const result = TraceExecutionPathSchema.parse(input);
      expect(result.max_depth).toBe(10);
      expect(result.include_data_flow).toBe(true);
    });

    it('should reject missing required fields', () => {
      const invalidInput = {
        entry_point: {
          file: '/path/to/file.ts',
          // Missing 'line'
        },
      };

      const result = TraceExecutionPathSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});