import { describe, it, expect, jest } from '@jest/globals';
import {
  SessionError,
  ApiError,
  FileSystemError,
  RateLimitError,
  ConversationLockedError,
  SessionNotFoundError,
} from '../errors/index.js';
import { ErrorClassifier } from '../utils/ErrorClassifier.js';

describe('Custom Error Classes', () => {
  describe('SessionError', () => {
    it('should create a session error with proper properties', () => {
      const error = new SessionError('Test message', 'TEST_CODE', 'session-123');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SessionError);
      expect(error.name).toBe('SessionError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.sessionId).toBe('session-123');
    });
  });

  describe('ApiError', () => {
    it('should create an API error with proper properties', () => {
      const error = new ApiError('API failed', 'API_ERROR', 'gemini', 500);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ApiError');
      expect(error.message).toBe('API failed');
      expect(error.code).toBe('API_ERROR');
      expect(error.service).toBe('gemini');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('FileSystemError', () => {
    it('should create a filesystem error with proper properties', () => {
      const error = new FileSystemError('File not found', 'ENOENT', '/path/to/file', 'read');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileSystemError);
      expect(error.name).toBe('FileSystemError');
      expect(error.message).toBe('File not found');
      expect(error.code).toBe('ENOENT');
      expect(error.path).toBe('/path/to/file');
      expect(error.operation).toBe('read');
    });
  });

  describe('RateLimitError', () => {
    it('should create a rate limit error with proper properties', () => {
      const error = new RateLimitError('Rate limit exceeded', 'gemini', 60);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.service).toBe('gemini');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('ConversationLockedError', () => {
    it('should create a conversation locked error', () => {
      const error = new ConversationLockedError('session-123');
      
      expect(error).toBeInstanceOf(SessionError);
      expect(error.name).toBe('ConversationLockedError');
      expect(error.message).toBe('Session session-123 is currently processing another request');
      expect(error.code).toBe('SESSION_LOCKED');
      expect(error.sessionId).toBe('session-123');
    });
  });

  describe('SessionNotFoundError', () => {
    it('should create a session not found error', () => {
      const error = new SessionNotFoundError('session-456');
      
      expect(error).toBeInstanceOf(SessionError);
      expect(error.name).toBe('SessionNotFoundError');
      expect(error.message).toBe('Session session-456 not found or expired');
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.sessionId).toBe('session-456');
    });
  });
});

describe('ErrorClassifier with Custom Errors', () => {
  it('should classify SessionError correctly', () => {
    const error = new SessionError('Test', 'SESSION_ERROR', 'session-123');
    const classification = ErrorClassifier.classify(error);
    
    expect(classification.category).toBe('session');
    expect(classification.code).toBe('SESSION_ERROR');
    expect(classification.isRetryable).toBe(false);
  });

  it('should classify ConversationLockedError as retryable', () => {
    const error = new ConversationLockedError('session-123');
    const classification = ErrorClassifier.classify(error);
    
    expect(classification.category).toBe('session');
    expect(classification.code).toBe('SESSION_LOCKED');
    expect(classification.isRetryable).toBe(true);
  });

  it('should classify RateLimitError correctly', () => {
    const error = new RateLimitError('Rate limited', 'gemini');
    const classification = ErrorClassifier.classify(error);
    
    expect(classification.category).toBe('api');
    expect(classification.code).toBe('RATE_LIMIT_ERROR');
    expect(classification.isRetryable).toBe(true);
  });

  it('should classify FileSystemError correctly', () => {
    const error = new FileSystemError('File error', 'ENOENT', '/path');
    const classification = ErrorClassifier.classify(error);
    
    expect(classification.category).toBe('filesystem');
    expect(classification.code).toBe('ENOENT');
    expect(classification.isRetryable).toBe(false);
  });

  it('should still handle native filesystem errors', () => {
    const error = new Error('ENOENT: no such file or directory');
    (error as any).code = 'ENOENT';
    
    const classification = ErrorClassifier.classify(error);
    
    expect(classification.category).toBe('filesystem');
    expect(classification.code).toBe('ENOENT');
    expect(classification.isRetryable).toBe(false);
  });

  it('should handle GoogleGenerativeAIError for backward compatibility', () => {
    const error = new Error('GoogleGenerativeAIError: Invalid API key');
    
    const classification = ErrorClassifier.classify(error);
    
    expect(classification.category).toBe('api');
    expect(classification.code).toBe('API_AUTH_ERROR');
    expect(classification.isRetryable).toBe(false);
  });
});