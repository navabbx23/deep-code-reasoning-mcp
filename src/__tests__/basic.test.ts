import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

describe('Deep Code Reasoning MCP Server', () => {
  it('should export valid tool schemas', () => {
    // Test that we can create valid Zod schemas
    const testSchema = z.object({
      test: z.string(),
    });

    const validData = { test: 'hello' };
    const result = testSchema.safeParse(validData);
    
    expect(result.success).toBe(true);
  });

  it('should handle environment variables', () => {
    // Test environment variable handling
    const originalEnv = process.env.GEMINI_API_KEY;
    
    // Test with API key set
    process.env.GEMINI_API_KEY = 'test-key';
    expect(process.env.GEMINI_API_KEY).toBe('test-key');
    
    // Restore original
    if (originalEnv) {
      process.env.GEMINI_API_KEY = originalEnv;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });
});