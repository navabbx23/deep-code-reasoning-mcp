/**
 * Shared utility for classifying and categorizing errors
 */

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
    const message = error.message;
    const errorStr = error.toString();
    
    // Session-related errors
    if (message.includes('session') || 
        message.includes('Session') ||
        message.includes('conversation') ||
        message.includes('lock')) {
      return {
        category: 'session',
        code: 'SESSION_ERROR',
        description: `Session management error: ${message}`,
        isRetryable: message.includes('currently processing')
      };
    }
    
    // API errors (Gemini)
    if (errorStr.includes('GoogleGenerativeAIError') || 
        message.includes('API key') ||
        message.includes('rate limit') ||
        message.includes('quota')) {
      const isRateLimit = message.includes('rate limit') || message.includes('quota');
      return {
        category: 'api',
        code: isRateLimit ? 'RATE_LIMIT_ERROR' : 'API_AUTH_ERROR',
        description: `External API error: ${message}`,
        isRetryable: isRateLimit
      };
    }
    
    // File system errors
    if ((error as any).code === 'ENOENT' || 
        (error as any).code === 'EACCES' ||
        message.includes('no such file') ||
        message.includes('permission denied')) {
      return {
        category: 'filesystem',
        code: (error as any).code || 'FS_ERROR',
        description: `File system error: ${message}`,
        isRetryable: false
      };
    }
    
    // Unknown errors
    return {
      category: 'unknown',
      description: message,
      isRetryable: false
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
          'Verify session has not expired or been abandoned'
        ];
        
      case 'api':
        if (classification.code === 'RATE_LIMIT_ERROR') {
          return [
            'Implement exponential backoff retry logic',
            'Add request queuing to manage rate limits',
            'Consider upgrading API quota limits',
            'Cache API responses to reduce redundant calls'
          ];
        }
        return [
          'Verify API key is set correctly',
          'Check API key permissions and quotas',
          'Ensure API is enabled in cloud console'
        ];
        
      case 'filesystem':
        return [
          'Verify file paths are correct and files exist',
          'Check file system permissions',
          'Ensure working directory is set correctly',
          'Review file path construction logic'
        ];
        
      default:
        return [
          'Check application logs for more details',
          'Review the error stack trace',
          'Verify system dependencies are installed'
        ];
    }
  }
}