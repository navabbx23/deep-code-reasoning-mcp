import type {
  ClaudeCodeContext,
  DeepAnalysisResult,
  CodeLocation,
} from '../models/types.js';
import { GeminiService } from '../services/GeminiService.js';
import { CodeReader } from '../utils/CodeReader.js';

export class DeepCodeReasonerV2 {
  private geminiService: GeminiService;
  private codeReader: CodeReader;

  constructor(geminiApiKey: string) {
    this.geminiService = new GeminiService(geminiApiKey);
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
    return {
      status: 'partial',
      findings: {
        rootCauses: [],
        executionPaths: [],
        performanceBottlenecks: [],
        crossSystemImpacts: [],
      },
      recommendations: {
        immediateActions: [
          {
            type: 'investigate',
            description: `Deep reasoning error: ${error.message}`,
            priority: 'high',
            estimatedEffort: '1 hour',
          },
        ],
        investigationNextSteps: [
          'Check Gemini API configuration',
          'Verify file access permissions',
          'Review error logs for details',
        ],
        codeChangesNeeded: [],
      },
      enrichedContext: {
        newInsights: [],
        validatedHypotheses: [],
        ruledOutApproaches: context.attemptedApproaches,
      },
    };
  }
}