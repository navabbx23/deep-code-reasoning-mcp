import { describe, it, expect } from '@jest/globals';
import { CodeReader } from '../utils/CodeReader.js';
import type { CodeScope } from '../models/types.js';

describe('CodeReader', () => {
  it('should initialize properly', () => {
    const codeReader = new CodeReader();
    expect(codeReader).toBeDefined();
  });

  it('should have required methods', () => {
    const codeReader = new CodeReader();
    
    expect(typeof codeReader.readFile).toBe('function');
    expect(typeof codeReader.readCodeFiles).toBe('function');
    expect(typeof codeReader.readCodeContext).toBe('function');
    expect(typeof codeReader.findRelatedFiles).toBe('function');
    expect(typeof codeReader.clearCache).toBe('function');
  });

  it('should handle CodeScope structure', () => {
    const scope: CodeScope = {
      files: ['/test/file1.ts', '/test/file2.ts'],
      entryPoints: [{ file: '/test/main.ts', line: 1 }],
      serviceNames: ['TestService'],
    };
    
    expect(scope.files).toHaveLength(2);
    expect(scope.entryPoints).toHaveLength(1);
    expect(scope.serviceNames).toHaveLength(1);
  });

  it('should clear cache', () => {
    const codeReader = new CodeReader();
    
    // Test that clearCache doesn't throw
    expect(() => codeReader.clearCache()).not.toThrow();
  });
});