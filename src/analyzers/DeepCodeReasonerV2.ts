import type {
  ClaudeCodeContext,
  DeepAnalysisResult,
  CodeLocation,
} from '../models/types.js';
import { GeminiService } from '../services/GeminiService.js';
import { ConversationalGeminiService } from '../services/ConversationalGeminiService.js';
import { ConversationManager } from '../services/ConversationManager.js';
import { CodeReader } from '../utils/CodeReader.js';

export class DeepCodeReasonerV2 {
  private geminiService: GeminiService;
  private conversationalGemini: ConversationalGeminiService;
  private conversationManager: ConversationManager;
  private codeReader: CodeReader;

  constructor(geminiApiKey: string) {
    this.geminiService = new GeminiService(geminiApiKey);
    this.conversationalGemini = new ConversationalGeminiService(geminiApiKey);
    this.conversationManager = new ConversationManager();
    this.codeReader = new CodeReader();
  }

  async escalateFromClaudeCode(
    context: ClaudeCodeContext,
    analysisType: string,
    depthLevel: number,
  ): Promise<DeepAnalysisResult> {
    const startTime = Date.now();
    const timeoutMs = context.analysisBudgetRemaining * 1000;

    try {
      // Read all relevant code files
      const codeFiles = await this.codeReader.readCodeFiles(context.focusArea);

      // Enrich with related files if depth > 3
      if (depthLevel > 3) {
        await this.enrichWithRelatedFiles(context, codeFiles);
      }

      // Send to Gemini for deep analysis
      const result = await this.geminiService.analyzeWithGemini(
        context,
        analysisType,
        codeFiles,
      );

      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeoutMs) {
        result.status = 'partial';
      }

      return result;
    } catch (error) {
      console.error('Deep reasoning failed:', error);
      return this.createErrorResult(error as Error, context);
    }
  }

  private async enrichWithRelatedFiles(
    context: ClaudeCodeContext,
    codeFiles: Map<string, string>,
  ): Promise<void> {
    // Find and add related files (tests, implementations, etc.)
    for (const file of context.focusArea.files) {
      const relatedFiles = await this.codeReader.findRelatedFiles(file);

      for (const relatedFile of relatedFiles) {
        if (!codeFiles.has(relatedFile)) {
          try {
            const content = await this.codeReader.readFile(relatedFile);
            codeFiles.set(relatedFile, content);
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }
  }

  async traceExecutionPath(
    entryPoint: CodeLocation,
    maxDepth: number = 10,
    _includeDataFlow: boolean = true,
  ): Promise<any> {
    // Get code context around entry point
    const _context = await this.codeReader.readCodeContext(entryPoint, 100);

    // Find related files
    const relatedFiles = await this.codeReader.findRelatedFiles(entryPoint.file);
    const codeFiles = new Map<string, string>();

    // Read entry point file
    codeFiles.set(entryPoint.file, await this.codeReader.readFile(entryPoint.file));

    // Read related files up to maxDepth
    for (let i = 0; i < Math.min(relatedFiles.length, maxDepth); i++) {
      const content = await this.codeReader.readFile(relatedFiles[i]);
      codeFiles.set(relatedFiles[i], content);
    }

    // Use Gemini to trace execution
    const analysis = await this.geminiService.performExecutionTraceAnalysis(
      codeFiles,
      entryPoint,
    );

    return {
      analysis,
      filesAnalyzed: Array.from(codeFiles.keys()),
    };
  }

  async analyzeCrossSystemImpact(
    changeScope: string[],
    impactTypes?: string[],
  ): Promise<any> {
    const codeFiles = new Map<string, string>();

    // Read all files in change scope
    for (const file of changeScope) {
      try {
        const content = await this.codeReader.readFile(file);
        codeFiles.set(file, content);

        // Also read related service files
        const relatedFiles = await this.codeReader.findRelatedFiles(file, ['Service', 'Controller', 'Client']);
        for (const related of relatedFiles) {
          const relatedContent = await this.codeReader.readFile(related);
          codeFiles.set(related, relatedContent);
        }
      } catch (error) {
        console.error(`Failed to read ${file}:`, error);
      }
    }

    // Use Gemini for cross-system analysis
    const analysis = await this.geminiService.performCrossSystemAnalysis(
      codeFiles,
      changeScope,
    );

    return {
      analysis,
      filesAnalyzed: Array.from(codeFiles.keys()),
      impactTypes: impactTypes || ['breaking', 'performance', 'behavioral'],
    };
  }

  async analyzePerformance(
    entryPoint: CodeLocation,
    profileDepth: number = 3,
    suspectedIssues?: string[],
  ): Promise<any> {
    const codeFiles = new Map<string, string>();

    // Read entry point and related files
    codeFiles.set(entryPoint.file, await this.codeReader.readFile(entryPoint.file));

    // Find files that might affect performance
    const performancePatterns = ['Service', 'Repository', 'Query', 'Cache', 'Database'];
    const relatedFiles = await this.codeReader.findRelatedFiles(entryPoint.file, performancePatterns);

    // Read up to profileDepth related files
    for (let i = 0; i < Math.min(relatedFiles.length, profileDepth * 3); i++) {
      try {
        const content = await this.codeReader.readFile(relatedFiles[i]);
        codeFiles.set(relatedFiles[i], content);
      } catch (error) {
        // Skip unreadable files
      }
    }

    // Use Gemini for performance analysis
    const analysis = await this.geminiService.performPerformanceAnalysis(
      codeFiles,
      suspectedIssues || [],
    );

    return {
      analysis,
      filesAnalyzed: Array.from(codeFiles.keys()),
    };
  }

  async testHypothesis(
    hypothesis: string,
    codeScope: string[],
    testApproach: string,
  ): Promise<any> {
    const codeFiles = new Map<string, string>();

    // Read all files in scope
    for (const file of codeScope) {
      try {
        const content = await this.codeReader.readFile(file);
        codeFiles.set(file, content);
      } catch (error) {
        console.error(`Failed to read ${file}:`, error);
      }
    }

    // Use Gemini to test hypothesis
    const analysis = await this.geminiService.testHypothesis(
      hypothesis,
      codeFiles,
      testApproach,
    );

    return {
      hypothesis,
      testApproach,
      analysis,
      filesAnalyzed: Array.from(codeFiles.keys()),
    };
  }

  private createErrorResult(error: Error, context: ClaudeCodeContext): DeepAnalysisResult {
    // Extract structured error information
    const errorDetails = this.extractErrorDetails(error);
    
    return {
      status: 'partial',
      findings: {
        rootCauses: errorDetails.rootCauses,
        executionPaths: [],
        performanceBottlenecks: [],
        crossSystemImpacts: [],
      },
      recommendations: {
        immediateActions: [
          {
            type: 'investigate',
            description: errorDetails.description,
            priority: 'high',
            estimatedEffort: '1 hour',
          },
        ],
        investigationNextSteps: errorDetails.nextSteps,
        codeChangesNeeded: [],
      },
      enrichedContext: {
        newInsights: [{
          type: 'error',
          description: errorDetails.insight,
          supporting_evidence: [error.stack || error.message]
        }],
        validatedHypotheses: [],
        ruledOutApproaches: context.attemptedApproaches,
      },
      metadata: {
        errorType: error.name,
        errorCode: errorDetails.code,
        errorSource: errorDetails.source,
      }
    };
  }

  private extractErrorDetails(error: Error): {
    description: string;
    rootCauses: any[];
    nextSteps: string[];
    insight: string;
    code?: string;
    source: string;
  } {
    // Check for specific error types
    const errorStr = error.toString();
    const message = error.message;
    
    // Google AI API errors
    if (errorStr.includes('GoogleGenerativeAIError') || message.includes('API key')) {
      return {
        description: `Gemini API error: ${message}`,
        rootCauses: [{
          type: 'configuration',
          description: 'Gemini API authentication or configuration issue',
          location: { file: 'ConversationalGeminiService.ts', line: 0 },
          evidence: [message]
        }],
        nextSteps: [
          'Verify GEMINI_API_KEY environment variable is set correctly',
          'Check API key permissions and quotas',
          'Ensure API is enabled in Google Cloud Console'
        ],
        insight: 'The Gemini API service is not properly configured or authenticated',
        code: 'GEMINI_AUTH_ERROR',
        source: 'external_api'
      };
    }
    
    // Rate limit errors
    if (message.includes('rate limit') || message.includes('quota')) {
      return {
        description: `API rate limit exceeded: ${message}`,
        rootCauses: [{
          type: 'performance',
          description: 'API rate limit or quota exceeded',
          location: { file: 'GeminiService.ts', line: 0 },
          evidence: [message]
        }],
        nextSteps: [
          'Implement exponential backoff retry logic',
          'Add request queuing to manage rate limits',
          'Consider upgrading API quota limits',
          'Cache API responses to reduce redundant calls'
        ],
        insight: 'The system is making too many API requests in a short time period',
        code: 'RATE_LIMIT_ERROR',
        source: 'external_api'
      };
    }
    
    // File system errors
    if (error.name === 'ENOENT' || message.includes('EACCES') || message.includes('no such file')) {
      return {
        description: `File system error: ${message}`,
        rootCauses: [{
          type: 'architecture',
          description: 'File access or permission issue',
          location: { file: 'CodeReader.ts', line: 0 },
          evidence: [message]
        }],
        nextSteps: [
          'Verify file paths are correct and files exist',
          'Check file system permissions',
          'Ensure working directory is set correctly',
          'Review file path construction logic'
        ],
        insight: 'The system cannot access required source code files',
        code: 'FILE_ACCESS_ERROR',
        source: 'filesystem'
      };
    }
    
    // Session/conversation errors
    if (message.includes('session') || message.includes('conversation')) {
      return {
        description: `Session management error: ${message}`,
        rootCauses: [{
          type: 'bug',
          description: 'Conversation state management issue',
          location: { file: 'ConversationManager.ts', line: 0 },
          evidence: [message]
        }],
        nextSteps: [
          'Check if session was properly initialized',
          'Verify session hasn\'t expired or been cleaned up',
          'Review session state transitions',
          'Check for race conditions in session access'
        ],
        insight: 'The conversation session state is invalid or corrupted',
        code: 'SESSION_ERROR',
        source: 'internal'
      };
    }
    
    // Generic/unknown errors
    return {
      description: `Unexpected error: ${message}`,
      rootCauses: [{
        type: 'bug',
        description: 'Unhandled error condition',
        location: { file: 'unknown', line: 0 },
        evidence: [error.stack || message]
      }],
      nextSteps: [
        'Review full error stack trace',
        'Check application logs for context',
        'Add more specific error handling',
        'Report issue if persistent'
      ],
      insight: 'An unexpected error occurred that should be investigated',
      code: 'UNKNOWN_ERROR',
      source: 'unknown'
    };
  }

  // Conversational methods
  async startConversation(
    context: ClaudeCodeContext,
    analysisType: string,
    initialQuestion?: string,
  ): Promise<{
    sessionId: string;
    initialResponse: string;
    suggestedFollowUps: string[];
    status: 'active';
  }> {
    try {
      // Create session
      const sessionId = this.conversationManager.createSession(context);
      
      // Read relevant code files
      const codeFiles = await this.codeReader.readCodeFiles(context.focusArea);
      
      // Start Gemini conversation
      const { response, suggestedFollowUps } = await this.conversationalGemini.startConversation(
        sessionId,
        context,
        analysisType,
        codeFiles,
        initialQuestion
      );
      
      // Track conversation turn
      this.conversationManager.addTurn(sessionId, 'gemini', response, {
        analysisType,
        questions: suggestedFollowUps,
      });
      
      return {
        sessionId,
        initialResponse: response,
        suggestedFollowUps,
        status: 'active',
      };
    } catch (error) {
      console.error('Failed to start conversation:', error);
      throw error;
    }
  }

  async continueConversation(
    sessionId: string,
    message: string,
    includeCodeSnippets?: boolean,
  ): Promise<{
    response: string;
    analysisProgress: number;
    canFinalize: boolean;
    status: string;
  }> {
    // Acquire lock before processing
    const lockAcquired = this.conversationManager.acquireLock(sessionId);
    if (!lockAcquired) {
      throw new Error(`Session ${sessionId} is currently processing another request or not available`);
    }

    try {
      // Validate session
      const session = this.conversationManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found or expired`);
      }
      
      // Add Claude's message to conversation history
      this.conversationManager.addTurn(sessionId, 'claude', message);
      
      // Continue with Gemini
      const { response, analysisProgress, canFinalize } = await this.conversationalGemini.continueConversation(
        sessionId,
        message,
        includeCodeSnippets
      );
      
      // Track Gemini's response
      this.conversationManager.addTurn(sessionId, 'gemini', response);
      
      // Update progress
      this.conversationManager.updateProgress(sessionId, {
        confidenceLevel: analysisProgress,
      });
      
      return {
        response,
        analysisProgress,
        canFinalize,
        status: session.status,
      };
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      throw error;
    } finally {
      // Always release lock
      this.conversationManager.releaseLock(sessionId);
    }
  }

  async finalizeConversation(
    sessionId: string,
    summaryFormat?: 'detailed' | 'concise' | 'actionable',
  ): Promise<DeepAnalysisResult> {
    // Acquire lock before processing
    const lockAcquired = this.conversationManager.acquireLock(sessionId);
    if (!lockAcquired) {
      throw new Error(`Session ${sessionId} is currently processing another request or not available`);
    }

    try {
      // Validate session
      const session = this.conversationManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found or expired`);
      }
      
      // Get final analysis from Gemini
      const result = await this.conversationalGemini.finalizeConversation(
        sessionId,
        summaryFormat || 'detailed'
      );
      
      // Extract additional insights from conversation manager
      const conversationResults = this.conversationManager.extractResults(sessionId);
      
      // Merge results
      return {
        ...result,
        metadata: {
          ...result.metadata,
          ...conversationResults.metadata,
        },
      };
    } catch (error) {
      console.error('Failed to finalize conversation:', error);
      throw error;
    } finally {
      // Always release lock
      this.conversationManager.releaseLock(sessionId);
    }
  }

  async getConversationStatus(
    sessionId: string,
  ): Promise<{
    sessionId: string;
    status: string;
    turnCount: number;
    lastActivity: number;
    progress: number;
    canFinalize: boolean;
  }> {
    const session = this.conversationManager.getSession(sessionId);
    if (!session) {
      return {
        sessionId,
        status: 'not_found',
        turnCount: 0,
        lastActivity: 0,
        progress: 0,
        canFinalize: false,
      };
    }
    
    const canFinalize = this.conversationManager.shouldComplete(sessionId);
    
    return {
      sessionId,
      status: session.status,
      turnCount: session.turns.length,
      lastActivity: session.lastActivity,
      progress: session.analysisProgress.confidenceLevel,
      canFinalize,
    };
  }
}