import type {
  ClaudeCodeContext,
  DeepAnalysisResult,
  RootCause,
  ExecutionPath,
  PerformanceIssue,
  Hypothesis,
  Action,
  CodeChange,
  Insight,
  CodeLocation,
  SystemImpact,
} from '../models/types.js';
import { ExecutionTracer } from './ExecutionTracer.js';
import { SystemBoundaryAnalyzer } from './SystemBoundaryAnalyzer.js';
import { PerformanceModeler } from './PerformanceModeler.js';
import { HypothesisTester } from './HypothesisTester.js';

// Local type definitions
interface ExecutionGraph {
  nodes: Map<string, ExecutionNode>;
  edges: Array<{ from: string; to: string; condition?: string }>;
  entryPoint: string;
}

interface ExecutionNode {
  id: string;
  location: CodeLocation;
  type: 'function' | 'method' | 'conditional' | 'loop' | 'assignment';
  data: unknown;
  children: ExecutionNode[];
}

interface ImpactReport {
  breakingChanges: BreakingChange[];
  performanceImplications: PerformanceIssue[];
  systemImpacts: SystemImpact[];
}

interface BreakingChange {
  service: string;
  description: string;
  affectedLocations: CodeLocation[];
  confidence: number;
  mitigation: string;
  file?: string;
}

export class DeepCodeReasoner {
  private executionTracer: ExecutionTracer;
  private systemAnalyzer: SystemBoundaryAnalyzer;
  private performanceModeler: PerformanceModeler;
  private hypothesisTester: HypothesisTester;

  constructor() {
    this.executionTracer = new ExecutionTracer();
    this.systemAnalyzer = new SystemBoundaryAnalyzer();
    this.performanceModeler = new PerformanceModeler();
    this.hypothesisTester = new HypothesisTester();
  }

  async escalateFromClaudeCode(
    context: ClaudeCodeContext,
    analysisType: string,
    depthLevel: number,
  ): Promise<DeepAnalysisResult> {
    const startTime = Date.now();
    const timeoutMs = context.analysisBudgetRemaining * 1000;

    try {
      // Understand what Claude Code already tried
      const priorAttempts = this.parseClaudeAttempts(context.attemptedApproaches);

      // Identify the specific reasoning gap
      const gapType = this.classifyReasoningGap(context.stuckPoints);

      // Apply specialized analysis strategy
      let result: DeepAnalysisResult;

      switch (analysisType) {
        case 'execution_trace':
          result = await this.performExecutionAnalysis(context, depthLevel, timeoutMs);
          break;
        case 'cross_system':
          result = await this.performCrossSystemAnalysis(context, depthLevel, timeoutMs);
          break;
        case 'performance':
          result = await this.performPerformanceAnalysis(context, depthLevel, timeoutMs);
          break;
        case 'hypothesis_test':
          result = await this.performHypothesisAnalysis(context, depthLevel, timeoutMs);
          break;
        default:
          result = await this.performGeneralAnalysis(context, gapType, depthLevel, timeoutMs);
      }

      // Enrich with insights from prior attempts
      result.enrichedContext.ruledOutApproaches = priorAttempts;

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeoutMs) {
        result.status = 'partial';
      }

      return result;
    } catch (error) {
      return this.createErrorResult(error as Error, context);
    }
  }

  private parseClaudeAttempts(approaches: string[]): string[] {
    return approaches.map(approach => {
      // Extract key insights from each attempt
      const keyActions = this.extractKeyActions(approach);
      return keyActions.join(' → ');
    });
  }

  private extractKeyActions(approach: string): string[] {
    const actionPatterns = [
      /profile[d]?\s+(\w+)/gi,
      /check[ed]?\s+(\w+)/gi,
      /analyz[ed]?\s+(\w+)/gi,
      /review[ed]?\s+(\w+)/gi,
    ];

    const actions: string[] = [];
    for (const pattern of actionPatterns) {
      const matches = approach.matchAll(pattern);
      for (const match of matches) {
        actions.push(match[0]);
      }
    }
    return actions.length > 0 ? actions : [approach];
  }

  private classifyReasoningGap(stuckPoints: string[]): string {
    const gapIndicators = {
      execution_flow: ['execution', 'flow', 'trace', 'call', 'sequence'],
      cross_system: ['service', 'boundary', 'api', 'distributed', 'cross'],
      performance_modeling: ['performance', 'slow', 'bottleneck', 'latency', 'throughput'],
      state_complexity: ['state', 'complex', 'interaction', 'dependency'],
      ambiguous: ['multiple', 'unclear', 'ambiguous', 'possible'],
    };

    const scores: Record<string, number> = {};

    for (const point of stuckPoints) {
      const lowerPoint = point.toLowerCase();
      for (const [gapType, indicators] of Object.entries(gapIndicators)) {
        scores[gapType] = scores[gapType] || 0;
        for (const indicator of indicators) {
          if (lowerPoint.includes(indicator)) {
            scores[gapType]++;
          }
        }
      }
    }

    // Return the gap type with highest score
    return Object.entries(scores).reduce((a, b) => (a[1] > b[1] ? a : b))[0] || 'ambiguous';
  }

  private async performExecutionAnalysis(
    context: ClaudeCodeContext,
    depthLevel: number,
    _timeoutMs: number,
  ): Promise<DeepAnalysisResult> {
    const entryPoints = context.focusArea.entryPoints || [];
    const executionPaths: ExecutionPath[] = [];
    const rootCauses: RootCause[] = [];

    for (const entryPoint of entryPoints) {
      const graph = await this.executionTracer.traceSemanticFlow(
        entryPoint,
        depthLevel * 3,
        true,
      );

      // Analyze execution patterns
      const patterns = this.analyzeExecutionPatterns(graph);
      executionPaths.push(...patterns.paths);

      // Identify potential issues
      if (patterns.issues.length > 0) {
        rootCauses.push(...patterns.issues.map(issue => ({
          type: 'execution_flow',
          description: issue.description,
          evidence: issue.locations,
          confidence: issue.confidence,
          fixStrategy: issue.suggestion,
        })));
      }
    }

    return {
      status: 'success',
      findings: {
        rootCauses,
        executionPaths,
        performanceBottlenecks: [],
        crossSystemImpacts: [],
      },
      recommendations: {
        immediateActions: this.generateExecutionActions(rootCauses),
        investigationNextSteps: this.generateExecutionNextSteps(executionPaths),
        codeChangesNeeded: this.generateExecutionCodeChanges(rootCauses),
      },
      enrichedContext: {
        newInsights: this.extractExecutionInsights(executionPaths),
        validatedHypotheses: [],
        ruledOutApproaches: [],
      },
    };
  }

  private async performCrossSystemAnalysis(
    context: ClaudeCodeContext,
    _depthLevel: number,
    _timeoutMs: number,
  ): Promise<DeepAnalysisResult> {
    const impacts = await this.systemAnalyzer.analyzeCrossServiceImpact(
      context.focusArea,
      ['breaking', 'performance', 'behavioral'],
    );

    const rootCauses: RootCause[] = [];

    // Analyze breaking changes
    for (const impact of impacts.breakingChanges) {
      rootCauses.push({
        type: 'cross_system_breaking',
        description: `Breaking change in ${impact.service}: ${impact.description}`,
        evidence: impact.affectedLocations,
        confidence: impact.confidence,
        fixStrategy: impact.mitigation,
      });
    }

    return {
      status: 'success',
      findings: {
        rootCauses,
        executionPaths: [],
        performanceBottlenecks: impacts.performanceImplications,
        crossSystemImpacts: impacts.systemImpacts,
      },
      recommendations: {
        immediateActions: this.generateCrossSystemActions(impacts),
        investigationNextSteps: this.generateCrossSystemNextSteps(impacts),
        codeChangesNeeded: this.generateCrossSystemCodeChanges(impacts),
      },
      enrichedContext: {
        newInsights: this.extractCrossSystemInsights(impacts),
        validatedHypotheses: [],
        ruledOutApproaches: [],
      },
    };
  }

  private async performPerformanceAnalysis(
    context: ClaudeCodeContext,
    depthLevel: number,
    _timeoutMs: number,
  ): Promise<DeepAnalysisResult> {
    const entryPoints = context.focusArea.entryPoints || [];
    const performanceIssues: PerformanceIssue[] = [];
    const rootCauses: RootCause[] = [];

    for (const entryPoint of entryPoints) {
      const perfModel = await this.performanceModeler.analyzePerformance(
        entryPoint,
        depthLevel,
        [],
      );

      performanceIssues.push(...perfModel.bottlenecks);

      // Convert bottlenecks to root causes
      for (const bottleneck of perfModel.bottlenecks) {
        if (bottleneck.impact.estimatedLatency > 100) { // > 100ms
          rootCauses.push({
            type: `performance_${bottleneck.type}`,
            description: `Performance bottleneck: ${bottleneck.type}`,
            evidence: [bottleneck.location],
            confidence: 0.8,
            fixStrategy: bottleneck.suggestion,
          });
        }
      }
    }

    return {
      status: 'success',
      findings: {
        rootCauses,
        executionPaths: [],
        performanceBottlenecks: performanceIssues,
        crossSystemImpacts: [],
      },
      recommendations: {
        immediateActions: this.generatePerformanceActions(performanceIssues),
        investigationNextSteps: this.generatePerformanceNextSteps(performanceIssues),
        codeChangesNeeded: this.generatePerformanceCodeChanges(performanceIssues),
      },
      enrichedContext: {
        newInsights: this.extractPerformanceInsights(performanceIssues),
        validatedHypotheses: [],
        ruledOutApproaches: [],
      },
    };
  }

  private async performHypothesisAnalysis(
    context: ClaudeCodeContext,
    _depthLevel: number,
    _timeoutMs: number,
  ): Promise<DeepAnalysisResult> {
    // Generate hypotheses based on stuck points
    const hypotheses = this.generateHypotheses(context);
    const validatedHypotheses: Hypothesis[] = [];
    const rootCauses: RootCause[] = [];

    for (const hypothesis of hypotheses) {
      const result = await this.hypothesisTester.testHypothesis(
        hypothesis.description,
        context.focusArea,
        hypothesis.testApproach,
      );

      if (result.validated) {
        validatedHypotheses.push(result);

        // Convert validated hypothesis to root cause
        rootCauses.push({
          type: 'hypothesis_validated',
          description: hypothesis.description,
          evidence: result.evidence.map(e => ({
            file: e,
            line: 0,
          })),
          confidence: 0.9,
          fixStrategy: result.suggestedFix || 'Apply fix based on validated hypothesis',
        });
      }
    }

    return {
      status: 'success',
      findings: {
        rootCauses,
        executionPaths: [],
        performanceBottlenecks: [],
        crossSystemImpacts: [],
      },
      recommendations: {
        immediateActions: this.generateHypothesisActions(validatedHypotheses),
        investigationNextSteps: this.generateHypothesisNextSteps(hypotheses, validatedHypotheses),
        codeChangesNeeded: this.generateHypothesisCodeChanges(validatedHypotheses),
      },
      enrichedContext: {
        newInsights: this.extractHypothesisInsights(validatedHypotheses),
        validatedHypotheses,
        ruledOutApproaches: hypotheses
          .filter(h => !validatedHypotheses.find(v => v.id === h.id))
          .map(h => h.description),
      },
    };
  }

  private async performGeneralAnalysis(
    context: ClaudeCodeContext,
    gapType: string,
    depthLevel: number,
    timeoutMs: number,
  ): Promise<DeepAnalysisResult> {
    // Delegate to appropriate analyzer based on gap type
    switch (gapType) {
      case 'execution_flow':
        return this.performExecutionAnalysis(context, depthLevel, timeoutMs);
      case 'cross_system':
        return this.performCrossSystemAnalysis(context, depthLevel, timeoutMs);
      case 'performance_modeling':
        return this.performPerformanceAnalysis(context, depthLevel, timeoutMs);
      default:
        return this.performHypothesisAnalysis(context, depthLevel, timeoutMs);
    }
  }

  private analyzeExecutionPatterns(_graph: ExecutionGraph): {
    paths: ExecutionPath[];
    issues: Array<{
      description: string;
      locations: CodeLocation[];
      confidence: number;
      suggestion: string;
    }>;
  } {
    // Simplified pattern analysis
    return {
      paths: [],
      issues: [],
    };
  }

  private generateExecutionActions(rootCauses: RootCause[]): Action[] {
    return rootCauses.map(cause => ({
      type: 'fix',
      description: `Fix ${cause.type}: ${cause.description}`,
      priority: 'high',
      estimatedEffort: '1-2 hours',
    }));
  }

  private generateExecutionNextSteps(_paths: ExecutionPath[]): string[] {
    return [
      'Review identified execution paths for optimization opportunities',
      'Check for unnecessary loops or redundant operations',
      'Validate state management across execution flow',
    ];
  }

  private generateExecutionCodeChanges(rootCauses: RootCause[]): CodeChange[] {
    return rootCauses.map(cause => ({
      file: cause.evidence[0]?.file || 'unknown',
      changeType: 'modify',
      description: cause.fixStrategy,
    }));
  }

  private extractExecutionInsights(paths: ExecutionPath[]): Insight[] {
    return [
      {
        type: 'execution_pattern',
        description: `Analyzed ${paths.length} execution paths`,
        supporting_evidence: paths.map(p => p.id),
      },
    ];
  }

  private generateCrossSystemActions(impacts: ImpactReport): Action[] {
    const actions: Action[] = [];

    if (impacts.breakingChanges.length > 0) {
      actions.push({
        type: 'fix',
        description: 'Address breaking API changes',
        priority: 'critical',
        estimatedEffort: '2-4 hours',
      });
    }

    return actions;
  }

  private generateCrossSystemNextSteps(_impacts: ImpactReport): string[] {
    return [
      'Update API documentation for changed endpoints',
      'Notify downstream service owners of changes',
      'Plan migration strategy for breaking changes',
    ];
  }

  private generateCrossSystemCodeChanges(impacts: ImpactReport): CodeChange[] {
    return impacts.breakingChanges.map((change) => ({
      file: change.file || 'unknown',
      changeType: 'modify' as const,
      description: change.mitigation,
    }));
  }

  private extractCrossSystemInsights(impacts: ImpactReport): Insight[] {
    return [
      {
        type: 'system_dependencies',
        description: `Found ${impacts.systemImpacts.length} cross-system impacts`,
        supporting_evidence: impacts.systemImpacts.map((i) => i.service),
      },
    ];
  }

  private generatePerformanceActions(issues: PerformanceIssue[]): Action[] {
    return issues
      .filter(issue => issue.impact.estimatedLatency > 100)
      .map(issue => ({
        type: 'fix',
        description: `Optimize ${issue.type}: ${issue.suggestion}`,
        priority: issue.impact.estimatedLatency > 1000 ? 'critical' : 'high',
        estimatedEffort: '2-4 hours',
      }));
  }

  private generatePerformanceNextSteps(_issues: PerformanceIssue[]): string[] {
    return [
      'Profile application under realistic load',
      'Implement caching for frequently accessed data',
      'Consider async processing for heavy operations',
    ];
  }

  private generatePerformanceCodeChanges(issues: PerformanceIssue[]): CodeChange[] {
    return issues.map(issue => ({
      file: issue.location.file,
      changeType: 'modify',
      description: issue.suggestion,
    }));
  }

  private extractPerformanceInsights(issues: PerformanceIssue[]): Insight[] {
    const totalLatency = issues.reduce((sum, issue) => sum + issue.impact.estimatedLatency, 0);

    return [
      {
        type: 'performance_impact',
        description: `Total estimated latency impact: ${totalLatency}ms`,
        supporting_evidence: issues.map(i => `${i.type}: ${i.impact.estimatedLatency}ms`),
      },
    ];
  }

  private generateHypotheses(context: ClaudeCodeContext): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];

    // Generate hypotheses based on stuck points
    for (const point of context.stuckPoints) {
      if (point.includes('performance')) {
        hypotheses.push({
          id: `hyp_${Date.now()}_perf`,
          description: 'Performance issue caused by N+1 query pattern',
          testApproach: 'Trace database queries in execution flow',
          validated: false,
          evidence: [],
        });
      }

      if (point.includes('state') || point.includes('complex')) {
        hypotheses.push({
          id: `hyp_${Date.now()}_state`,
          description: 'Race condition in concurrent state updates',
          testApproach: 'Analyze concurrent access patterns',
          validated: false,
          evidence: [],
        });
      }
    }

    return hypotheses;
  }

  private generateHypothesisActions(validated: Hypothesis[]): Action[] {
    return validated.map(hyp => ({
      type: 'fix',
      description: `Implement fix for: ${hyp.description}`,
      priority: 'high',
      estimatedEffort: '2-3 hours',
    }));
  }

  private generateHypothesisNextSteps(all: Hypothesis[], validated: Hypothesis[]): string[] {
    const invalidated = all.filter(h => !validated.find(v => v.id === h.id));

    return [
      `Validated ${validated.length} of ${all.length} hypotheses`,
      ...invalidated.map(h => `Ruled out: ${h.description}`),
    ];
  }

  private generateHypothesisCodeChanges(validated: Hypothesis[]): CodeChange[] {
    return validated.map(hyp => ({
      file: hyp.evidence[0] || 'unknown',
      changeType: 'modify',
      description: `Fix based on validated hypothesis: ${hyp.description}`,
    }));
  }

  private extractHypothesisInsights(validated: Hypothesis[]): Insight[] {
    return validated.map(hyp => ({
      type: 'validated_hypothesis',
      description: hyp.description,
      supporting_evidence: hyp.evidence,
    }));
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
            description: `Investigate error: ${error.message}`,
            priority: 'high',
            estimatedEffort: '1 hour',
          },
        ],
        investigationNextSteps: [
          'Check logs for more details',
          'Verify all dependencies are available',
          'Consider breaking down the analysis into smaller parts',
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