/**
 * Shared utility for classifying and categorizing errors
 */

import { SessionError, ApiError, FileSystemError, RateLimitError } from '../errors/index.js';

export interface ClassifiedError {
  category: 'session' | 'api' | 'filesystem' | 'unknown';
  code?: string;
  description: string;
  isRetryable: boolean;
}

export class ErrorClassifier {
  /**
   * Classify an error into categories for proper handling
   */
  static classify(error: Error): ClassifiedError {
    // Check for custom error types first
    if (error instanceof SessionError) {
      return {
        category: 'session',
        code: error.code,
        description: `Session management error: ${error.message}`,
        isRetryable: error.code === 'SESSION_LOCKED',
      };
    }

    if (error instanceof RateLimitError) {
      return {
        category: 'api',
        code: 'RATE_LIMIT_ERROR',
        description: `External API error: ${error.message}`,
        isRetryable: true,
      };
    }

    if (error instanceof ApiError) {
      return {
        category: 'api',
        code: error.code,
        description: `External API error: ${error.message}`,
        isRetryable: false,
      };
    }

    if (error instanceof FileSystemError) {
      return {
        category: 'filesystem',
        code: error.code,
        description: `File system error: ${error.message}`,
        isRetryable: false,
      };
    }

    // Fallback to checking error properties for non-custom errors
    const message = error.message;
    const errorStr = error.toString();

    // Native file system errors
    if ((error as any).code === 'ENOENT' ||
        (error as any).code === 'EACCES' ||
        message.includes('no such file') ||
        message.includes('permission denied')) {
      return {
        category: 'filesystem',
        code: (error as any).code || 'FS_ERROR',
        description: `File system error: ${message}`,
        isRetryable: false,
      };
    }

    // Gemini API errors (for backwards compatibility)
    if (errorStr.includes('GoogleGenerativeAIError') ||
        message.includes('API key')) {
      return {
        category: 'api',
        code: 'API_AUTH_ERROR',
        description: `External API error: ${message}`,
        isRetryable: false,
      };
    }

    // Unknown errors
    return {
      category: 'unknown',
      description: message,
      isRetryable: false,
    };
  }

  /**
   * Get suggested next steps based on error classification
   */
  static getNextSteps(classification: ClassifiedError): string[] {
    switch (classification.category) {
      case 'session':
        return [
          'Wait for the current operation to complete',
          'Check if the session ID is valid',
          'Verify session has not expired or been abandoned',
        ];

      case 'api':
        if (classification.code === 'RATE_LIMIT_ERROR') {
          return [
            'Implement exponential backoff retry logic',
            'Add request queuing to manage rate limits',
            'Consider upgrading API quota limits',
            'Cache API responses to reduce redundant calls',
          ];
        }
        return [
          'Verify API key is set correctly',
          'Check API key permissions and quotas',
          'Ensure API is enabled in cloud console',
        ];

      case 'filesystem':
        return [
          'Verify file paths are correct and files exist',
          'Check file system permissions',
          'Ensure working directory is set correctly',
          'Review file path construction logic',
        ];

      default:
        return [
          'Check application logs for more details',
          'Review the error stack trace',
          'Verify system dependencies are installed',
        ];
    }
  }
}