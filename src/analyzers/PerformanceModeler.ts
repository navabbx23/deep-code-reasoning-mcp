import * as fs from 'fs/promises';
import type {
  CodeLocation,
  PerformanceIssue,
  ComplexityMetrics,
  ExecutionPath,
} from '../models/types.js';

interface PerfModel {
  executionPaths: ExecutionPath[];
  bottlenecks: PerformanceIssue[];
  complexity: ComplexityMetrics;
  ioProfile: IOProfile;
  resourceModel: ResourceModel;
}

interface IOProfile {
  databaseQueries: QueryPattern[];
  apiCalls: APICall[];
  fileOperations: FileOp[];
  totalIOTime: number;
}

interface QueryPattern {
  type: 'select' | 'insert' | 'update' | 'delete' | 'join';
  tables: string[];
  complexity: string;
  estimatedRows: number;
  location: CodeLocation;
}

interface APICall {
  endpoint: string;
  method: string;
  estimatedLatency: number;
  frequency: number;
  location: CodeLocation;
}

interface FileOp {
  type: 'read' | 'write' | 'append';
  estimatedSize: number;
  location: CodeLocation;
}

interface ResourceModel {
  cpuUtilization: number;
  memoryUsage: MemoryProfile;
  networkBandwidth: number;
}

interface MemoryProfile {
  heapUsed: number;
  allocations: number;
  potentialLeaks: MemoryLeak[];
}

interface MemoryLeak {
  type: string;
  location: CodeLocation;
  severity: 'low' | 'medium' | 'high';
}

interface CachedAnalysis {
  complexity?: ComplexityMetrics;
  ioProfile?: IOProfile;
  resourceModel?: ResourceModel;
}

export class PerformanceModeler {
  private cache: Map<string, CachedAnalysis>;

  constructor() {
    this.cache = new Map();
  }

  async analyzePerformance(
    entryPoint: CodeLocation,
    profileDepth: number = 3,
    suspectedIssues?: string[],
  ): Promise<PerfModel> {
    const fileContent = await this.readFile(entryPoint.file);

    // Analyze algorithmic complexity
    const complexity = await this.analyzeBigOCharacteristics(fileContent, entryPoint);

    // Model I/O patterns
    const ioProfile = await this.analyzeIOPatterns(fileContent, entryPoint, profileDepth);

    // Estimate resource utilization
    const resourceModel = await this.modelResourceUsage(fileContent, entryPoint, ioProfile);

    // Identify bottlenecks
    const bottlenecks = await this.identifyBottlenecks(
      complexity,
      ioProfile,
      resourceModel,
      suspectedIssues,
    );

    // Build execution paths with performance annotations
    const executionPaths = await this.buildPerformanceAnnotatedPaths(
      entryPoint,
      bottlenecks,
      profileDepth,
    );

    return {
      executionPaths,
      bottlenecks,
      complexity,
      ioProfile,
      resourceModel,
    };
  }

  private async analyzeBigOCharacteristics(
    content: string,
    location: CodeLocation,
  ): Promise<ComplexityMetrics> {
    const functionContent = this.extractFunctionContent(content, location);

    // Count loops and nested structures
    const loopCount = this.countLoops(functionContent);
    const nestedLoops = this.findNestedLoops(functionContent);
    const recursiveCalls = this.findRecursiveCalls(functionContent, location.functionName);

    // Analyze data structure operations
    const dataStructureOps = this.analyzeDataStructureOperations(functionContent);

    // Calculate complexity
    let timeComplexity = 'O(1)';
    let spaceComplexity = 'O(1)';

    if (recursiveCalls > 0) {
      timeComplexity = recursiveCalls > 1 ? 'O(2^n)' : 'O(n)';
      spaceComplexity = 'O(n)'; // Call stack
    } else if (nestedLoops.length > 0) {
      const maxNesting = Math.max(...nestedLoops.map(n => n.depth));
      timeComplexity = `O(n^${maxNesting})`;
    } else if (loopCount > 0) {
      timeComplexity = 'O(n)';
    }

    // Check for common patterns
    if (dataStructureOps.includes('sort')) {
      timeComplexity = this.combineComplexity(timeComplexity, 'O(n log n)');
    }

    if (dataStructureOps.includes('map') || dataStructureOps.includes('filter')) {
      spaceComplexity = 'O(n)';
    }

    // Calculate cyclomatic complexity
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(functionContent);

    // Calculate cognitive complexity
    const cognitiveComplexity = this.calculateCognitiveComplexity(functionContent);

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      bigOTime: timeComplexity,
      bigOSpace: spaceComplexity,
    };
  }

  private async analyzeIOPatterns(
    content: string,
    location: CodeLocation,
    _depth: number,
  ): Promise<IOProfile> {
    const databaseQueries: QueryPattern[] = [];
    const apiCalls: APICall[] = [];
    const fileOperations: FileOp[] = [];

    // Find database queries
    const queryPatterns = [
      /\.(find|findOne|findAll|select|insert|update|delete)\(/g,
      /query\(['"`]([^'"`]+)['"`]/g,
      /\$\.ajax\({[^}]*url:\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of queryPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const query = this.analyzeQuery(match, content, location);
        if (query) {
          databaseQueries.push(query);
        }
      }
    }

    // Find API calls
    const apiPatterns = [
      /fetch\(['"`]([^'"`]+)['"`]/g,
      /axios\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/g,
      /http\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of apiPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        apiCalls.push({
          endpoint: match[1] || match[2],
          method: match[1] ? 'GET' : match[1]?.toUpperCase() || 'GET',
          estimatedLatency: 50, // Default 50ms
          frequency: 1,
          location: {
            ...location,
            line: this.getLineNumber(content, match.index || 0),
          },
        });
      }
    }

    // Find file operations
    const filePatterns = [
      /fs\.(readFile|writeFile|appendFile)/g,
      /\.(read|write|pipe)\(/g,
    ];

    for (const pattern of filePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        fileOperations.push({
          type: match[1]?.includes('read') ? 'read' : 'write',
          estimatedSize: 1000, // Default 1KB
          location: {
            ...location,
            line: this.getLineNumber(content, match.index || 0),
          },
        });
      }
    }

    // Check for N+1 patterns
    const n1Patterns = this.detectNPlusOnePatterns(content, databaseQueries);
    if (n1Patterns.length > 0) {
      for (const pattern of n1Patterns) {
        databaseQueries.push({
          type: 'select',
          tables: ['unknown'],
          complexity: 'O(n)',
          estimatedRows: 100,
          location: pattern.location,
        });
      }
    }

    // Calculate total I/O time
    const totalIOTime =
      databaseQueries.reduce((sum, q) => sum + this.estimateQueryTime(q), 0) +
      apiCalls.reduce((sum, a) => sum + a.estimatedLatency * a.frequency, 0) +
      fileOperations.length * 10; // 10ms per file op

    return {
      databaseQueries,
      apiCalls,
      fileOperations,
      totalIOTime,
    };
  }

  private async modelResourceUsage(
    content: string,
    location: CodeLocation,
    ioProfile: IOProfile,
  ): Promise<ResourceModel> {
    // Estimate CPU utilization based on complexity
    const complexity = await this.analyzeBigOCharacteristics(content, location);
    let cpuUtilization = 10; // Base 10%

    if (complexity.bigOTime.includes('n^')) {
      cpuUtilization = 80; // High CPU for polynomial time
    } else if (complexity.bigOTime.includes('n log n')) {
      cpuUtilization = 50;
    } else if (complexity.bigOTime.includes('n')) {
      cpuUtilization = 30;
    }

    // Analyze memory usage
    const memoryProfile = this.analyzeMemoryUsage(content);

    // Estimate network bandwidth
    const networkBandwidth = ioProfile.apiCalls.reduce((sum, call) => {
      return sum + (call.frequency * 1000); // 1KB per API call
    }, 0);

    return {
      cpuUtilization,
      memoryUsage: memoryProfile,
      networkBandwidth,
    };
  }

  private analyzeMemoryUsage(content: string): MemoryProfile {
    const potentialLeaks: MemoryLeak[] = [];

    // Check for common memory leak patterns
    const leakPatterns = [
      {
        pattern: /setInterval\(/g,
        type: 'uncleared_interval',
        severity: 'high' as const,
      },
      {
        pattern: /addEventListener\(/g,
        type: 'unremoved_listener',
        severity: 'medium' as const,
      },
      {
        pattern: /new\s+\w+\(/g,
        type: 'potential_allocation',
        severity: 'low' as const,
      },
    ];

    for (const { pattern, type, severity } of leakPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        // Check if there's a corresponding cleanup
        const hasCleanup = this.checkForCleanup(content, match, type);
        if (!hasCleanup) {
          potentialLeaks.push({
            type,
            location: {
              file: 'current',
              line: this.getLineNumber(content, match.index || 0),
            },
            severity,
          });
        }
      }
    }

    // Estimate heap usage
    const arrayOps = (content.match(/\[\]/g) || []).length;
    const objectOps = (content.match(/{}/g) || []).length;
    const heapUsed = (arrayOps + objectOps) * 1000; // 1KB per allocation

    return {
      heapUsed,
      allocations: arrayOps + objectOps,
      potentialLeaks,
    };
  }

  private async identifyBottlenecks(
    complexity: ComplexityMetrics,
    ioProfile: IOProfile,
    resourceModel: ResourceModel,
    suspectedIssues?: string[],
  ): Promise<PerformanceIssue[]> {
    const issues: PerformanceIssue[] = [];

    // Check for N+1 queries
    const n1Queries = ioProfile.databaseQueries.filter(q =>
      q.complexity === 'O(n)' && q.type === 'select',
    );
    if (n1Queries.length > 0) {
      issues.push({
        type: 'n_plus_one',
        location: n1Queries[0].location,
        impact: {
          estimatedLatency: n1Queries.length * 20,
          affectedOperations: ['database_queries'],
          frequency: n1Queries.length,
        },
        suggestion: 'Use eager loading or batch queries to avoid N+1 pattern',
      });
    }

    // Check for inefficient algorithms
    if (complexity.bigOTime.includes('^') && parseInt(complexity.bigOTime.match(/\^(\d+)/)?.[1] || '0') > 2) {
      issues.push({
        type: 'inefficient_algorithm',
        location: { file: 'current', line: 0 },
        impact: {
          estimatedLatency: 1000,
          affectedOperations: ['cpu_computation'],
          frequency: 1,
        },
        suggestion: 'Consider optimizing algorithm complexity or using more efficient data structures',
      });
    }

    // Check for excessive I/O
    if (ioProfile.totalIOTime > 200) {
      issues.push({
        type: 'excessive_io',
        location: { file: 'current', line: 0 },
        impact: {
          estimatedLatency: ioProfile.totalIOTime,
          affectedOperations: ['io_operations'],
          frequency: ioProfile.databaseQueries.length + ioProfile.apiCalls.length,
        },
        suggestion: 'Batch I/O operations or implement caching to reduce latency',
      });
    }

    // Check for memory leaks
    const highSeverityLeaks = resourceModel.memoryUsage.potentialLeaks.filter(
      l => l.severity === 'high',
    );
    if (highSeverityLeaks.length > 0) {
      issues.push({
        type: 'memory_leak',
        location: highSeverityLeaks[0].location,
        impact: {
          estimatedLatency: 0,
          affectedOperations: ['memory_management'],
          frequency: highSeverityLeaks.length,
        },
        suggestion: 'Ensure proper cleanup of intervals, listeners, and large objects',
      });
    }

    // Check suspected issues
    if (suspectedIssues) {
      for (const suspected of suspectedIssues) {
        if (suspected.toLowerCase().includes('slow') && issues.length === 0) {
          // Add generic performance issue if nothing specific found
          issues.push({
            type: 'inefficient_algorithm',
            location: { file: 'current', line: 0 },
            impact: {
              estimatedLatency: 100,
              affectedOperations: ['general_performance'],
              frequency: 1,
            },
            suggestion: 'Profile the code to identify specific performance bottlenecks',
          });
        }
      }
    }

    return issues;
  }

  private async buildPerformanceAnnotatedPaths(
    entryPoint: CodeLocation,
    bottlenecks: PerformanceIssue[],
    _depth: number,
  ): Promise<ExecutionPath[]> {
    // Build execution paths with performance annotations
    const paths: ExecutionPath[] = [];

    // Create a path for each bottleneck
    for (const bottleneck of bottlenecks) {
      paths.push({
        id: `perf_path_${Date.now()}_${bottleneck.type}`,
        steps: [
          {
            location: entryPoint,
            operation: 'entry',
            inputs: [],
            outputs: [],
            stateChanges: [],
            duration: 0,
          },
          {
            location: bottleneck.location,
            operation: bottleneck.type,
            inputs: [],
            outputs: [],
            stateChanges: [],
            duration: bottleneck.impact.estimatedLatency,
          },
        ],
        totalDuration: bottleneck.impact.estimatedLatency,
        complexity: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 1,
          bigOTime: 'O(n)',
          bigOSpace: 'O(1)',
        },
      });
    }

    return paths;
  }

  private extractFunctionContent(content: string, location: CodeLocation): string {
    const lines = content.split('\n');
    const startLine = location.line - 1;

    // Find function boundaries
    let braceCount = 0;
    let functionStart = -1;
    let functionEnd = -1;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('{')) {
        if (functionStart === -1) functionStart = i;
        braceCount += (line.match(/{/g) || []).length;
      }
      if (line.includes('}')) {
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount === 0 && functionStart !== -1) {
          functionEnd = i;
          break;
        }
      }
    }

    if (functionStart !== -1 && functionEnd !== -1) {
      return lines.slice(functionStart, functionEnd + 1).join('\n');
    }

    return '';
  }

  private countLoops(content: string): number {
    const loopPatterns = [
      /for\s*\(/g,
      /while\s*\(/g,
      /do\s*{/g,
      /\.forEach\(/g,
      /\.map\(/g,
      /\.filter\(/g,
      /\.reduce\(/g,
    ];

    let count = 0;
    for (const pattern of loopPatterns) {
      count += (content.match(pattern) || []).length;
    }

    return count;
  }

  private findNestedLoops(content: string): Array<{ depth: number; location: number }> {
    const nested: Array<{ depth: number; location: number }> = [];
    const lines = content.split('\n');
    let currentDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isLoopStart(line)) {
        currentDepth++;
        if (currentDepth > 1) {
          nested.push({ depth: currentDepth, location: i });
        }
      } else if (line.includes('}') && currentDepth > 0) {
        currentDepth--;
      }
    }

    return nested;
  }

  private isLoopStart(line: string): boolean {
    const loopStarts = ['for', 'while', 'forEach', 'map', 'filter', 'reduce'];
    return loopStarts.some(keyword =>
      line.includes(keyword) && (line.includes('(') || line.includes('{')),
    );
  }

  private findRecursiveCalls(content: string, functionName?: string): number {
    if (!functionName) return 0;

    const pattern = new RegExp(`${functionName}\\s*\\(`, 'g');
    const matches = content.match(pattern) || [];

    // Subtract 1 for the function definition itself
    return Math.max(0, matches.length - 1);
  }

  private analyzeDataStructureOperations(content: string): string[] {
    const operations: string[] = [];
    const patterns = {
      sort: /\.sort\(/g,
      map: /\.map\(/g,
      filter: /\.filter\(/g,
      reduce: /\.reduce\(/g,
      find: /\.find\(/g,
      includes: /\.includes\(/g,
      indexOf: /\.indexOf\(/g,
    };

    for (const [op, pattern] of Object.entries(patterns)) {
      if (content.match(pattern)) {
        operations.push(op);
      }
    }

    return operations;
  }

  private combineComplexity(c1: string, c2: string): string {
    const order = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2^n)'];
    const i1 = order.indexOf(c1);
    const i2 = order.indexOf(c2);

    if (i1 === -1) return c2;
    if (i2 === -1) return c1;

    return order[Math.max(i1, i2)];
  }

  private calculateCyclomaticComplexity(content: string): number {
    let complexity = 1;

    const decisionPoints = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /case\s+/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /catch\s*\(/g,
      /\?\s*:/g, // ternary
    ];

    for (const pattern of decisionPoints) {
      complexity += (content.match(pattern) || []).length;
    }

    return complexity;
  }

  private calculateCognitiveComplexity(content: string): number {
    // Simplified cognitive complexity calculation
    let complexity = 0;
    const lines = content.split('\n');
    let nestingLevel = 0;

    for (const line of lines) {
      if (this.isComplexityIncreasing(line)) {
        complexity += (1 + nestingLevel);
        if (this.isNestingIncreasing(line)) {
          nestingLevel++;
        }
      } else if (line.includes('}')) {
        nestingLevel = Math.max(0, nestingLevel - 1);
      }
    }

    return complexity;
  }

  private isComplexityIncreasing(line: string): boolean {
    const patterns = ['if', 'else if', 'for', 'while', 'catch'];
    return patterns.some(p => line.includes(p) && line.includes('('));
  }

  private isNestingIncreasing(line: string): boolean {
    return line.includes('{') && this.isComplexityIncreasing(line);
  }

  private analyzeQuery(match: RegExpMatchArray, content: string, _baseLocation: CodeLocation): QueryPattern | null {
    const lineNumber = this.getLineNumber(content, match.index || 0);

    // Determine query type
    let type: QueryPattern['type'] = 'select';
    const operation = match[1]?.toLowerCase() || match[0].toLowerCase();

    if (operation.includes('insert')) type = 'insert';
    else if (operation.includes('update')) type = 'update';
    else if (operation.includes('delete')) type = 'delete';
    else if (operation.includes('join')) type = 'join';

    return {
      type,
      tables: ['unknown'],
      complexity: type === 'join' ? 'O(n²)' : 'O(n)',
      estimatedRows: type === 'select' ? 100 : 1,
      location: {
        file: 'current',
        line: lineNumber,
      },
    };
  }

  private getLineNumber(content: string, position: number): number {
    const lines = content.substring(0, position).split('\n');
    return lines.length;
  }

  private detectNPlusOnePatterns(
    content: string,
    queries: QueryPattern[],
  ): Array<{ location: CodeLocation }> {
    const patterns: Array<{ location: CodeLocation }> = [];

    // Look for queries inside loops
    const lines = content.split('\n');
    let inLoop = false;
    let _loopStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (this.isLoopStart(line)) {
        inLoop = true;
        _loopStartLine = i;
      } else if (line.includes('}') && inLoop) {
        inLoop = false;
      } else if (inLoop) {
        // Check if this line contains a query
        const hasQuery = queries.some(q => q.location.line === i + 1);
        if (hasQuery || line.match(/\.(find|select|query)/)) {
          patterns.push({
            location: {
              file: 'current',
              line: i + 1,
            },
          });
        }
      }
    }

    return patterns;
  }

  private estimateQueryTime(query: QueryPattern): number {
    let baseTime = 10; // 10ms base

    switch (query.type) {
      case 'select':
        baseTime = 20;
        break;
      case 'join':
        baseTime = 50;
        break;
      case 'insert':
      case 'update':
        baseTime = 15;
        break;
      case 'delete':
        baseTime = 10;
        break;
    }

    // Adjust for complexity
    if (query.complexity === 'O(n²)') {
      baseTime *= 5;
    } else if (query.complexity === 'O(n log n)') {
      baseTime *= 2;
    }

    return baseTime;
  }

  private checkForCleanup(content: string, match: RegExpMatchArray, type: string): boolean {
    const cleanupPatterns: Record<string, RegExp> = {
      uncleared_interval: /clearInterval/g,
      unremoved_listener: /removeEventListener/g,
      potential_allocation: /delete|null|undefined/g,
    };

    const pattern = cleanupPatterns[type];
    if (!pattern) return true;

    // Check if cleanup exists after the match
    const afterMatch = content.substring(match.index || 0);
    return pattern.test(afterMatch);
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Cannot read file ${filePath}: ${error}`);
    }
  }
}