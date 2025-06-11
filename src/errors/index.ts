/**
 * Custom error classes for precise error handling
 */

export class SessionError extends Error {
  readonly code: string;
  readonly sessionId?: string;
  
  constructor(message: string, code: string = 'SESSION_ERROR', sessionId?: string) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.sessionId = sessionId;
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly service: string;
  
  constructor(message: string, code: string = 'API_ERROR', service: string = 'unknown', statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.service = service;
    this.statusCode = statusCode;
  }
}

export class FileSystemError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly operation?: string;
  
  constructor(message: string, code: string = 'FS_ERROR', path?: string, operation?: string) {
    super(message);
    this.name = 'FileSystemError';
    this.code = code;
    this.path = path;
    this.operation = operation;
  }
}

export class RateLimitError extends ApiError {
  readonly retryAfter?: number;
  
  constructor(message: string, service: string = 'gemini', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', service, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ConversationLockedError extends SessionError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} is currently processing another request`, 'SESSION_LOCKED', sessionId);
    this.name = 'ConversationLockedError';
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found or expired`, 'SESSION_NOT_FOUND', sessionId);
    this.name = 'SessionNotFoundError';
  }
}