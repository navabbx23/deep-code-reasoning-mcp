import * as fs from 'fs/promises';
import type {
  CodeLocation,
  ExecutionStep,
  ExecutionPath,
  StateChange,
  ComplexityMetrics,
} from '../models/types.js';

interface ExecutionNode {
  id: string;
  location: CodeLocation;
  type: 'function' | 'method' | 'conditional' | 'loop' | 'assignment';
  data: ASTNode;
  children: ExecutionNode[];
}

interface ASTNode {
  type: string;
  name?: string;
  location?: ASTLocation;
  body?: ASTNode[];
  declarations?: ASTNode[];
  methods?: ASTNode[];
  stateChanges?: StateChange[];
  callee?: ASTNode;
  property?: ASTNode;
  left?: ASTNode;
  right?: ASTNode;
  id?: ASTNode;
  init?: ASTNode;
  object?: ASTNode;
}

interface ASTLocation {
  start: { line: number; column?: number };
  end: { line: number; column?: number };
}

interface ExecutionGraph {
  nodes: Map<string, ExecutionNode>;
  edges: Array<{ from: string; to: string; condition?: string }>;
  entryPoint: string;
}

interface ParsedAST {
  functions: ASTNode[];
}

export class ExecutionTracer {
  private cache: Map<string, ParsedAST>;

  constructor() {
    this.cache = new Map();
  }

  async traceSemanticFlow(
    entryPoint: CodeLocation,
    maxDepth: number = 10,
    includeDataFlow: boolean = true,
  ): Promise<ExecutionGraph> {
    const graph: ExecutionGraph = {
      nodes: new Map(),
      edges: [],
      entryPoint: this.locationToId(entryPoint),
    };

    // Start tracing from entry point
    await this.traceFromLocation(entryPoint, graph, 0, maxDepth, includeDataFlow);

    return graph;
  }

  private async traceFromLocation(
    location: CodeLocation,
    graph: ExecutionGraph,
    currentDepth: number,
    maxDepth: number,
    includeDataFlow: boolean,
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    const nodeId = this.locationToId(location);
    if (graph.nodes.has(nodeId)) return; // Already processed

    try {
      // Read and parse the file
      const fileContent = await this.readFile(location.file);
      const ast = await this.parseFile(location.file, fileContent);

      // Find the function/method at the given location
      const targetNode = this.findNodeAtLocation(ast, location);
      if (!targetNode) return;

      // Create execution node
      const execNode: ExecutionNode = {
        id: nodeId,
        location,
        type: this.getNodeType(targetNode),
        data: targetNode,
        children: [],
      };
      graph.nodes.set(nodeId, execNode);

      // Analyze the function body
      if (includeDataFlow) {
        await this.analyzeDataFlow(targetNode, execNode, graph);
      }

      // Find all function calls within this function
      const functionCalls = this.findFunctionCalls(targetNode);

      for (const call of functionCalls) {
        const calledLocation = await this.resolveCallLocation(call, location.file);
        if (calledLocation) {
          // Add edge
          graph.edges.push({
            from: nodeId,
            to: this.locationToId(calledLocation),
            condition: call.condition,
          });

          // Recursively trace
          await this.traceFromLocation(
            calledLocation,
            graph,
            currentDepth + 1,
            maxDepth,
            includeDataFlow,
          );
        }
      }
    } catch (error) {
      console.error(`Error tracing location ${location.file}:${location.line}:`, error);
    }
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Cannot read file ${filePath}: ${error}`);
    }
  }

  private async parseFile(filePath: string, content: string): Promise<ParsedAST> {
    const cacheKey = `${filePath}:${content.length}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Simple AST representation for our purposes
    const parsed = this.parseTypeScriptContent(content);
    this.cache.set(cacheKey, parsed);
    return parsed;
  }

  private parseTypeScriptContent(content: string): ParsedAST {
    // Simplified parsing - in production, use proper TypeScript compiler API
    const lines = content.split('\n');
    const functions: ASTNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const functionMatch = line.match(/(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*{?/);
      if (functionMatch) {
        functions.push({
          name: functionMatch[1],
          location: { start: { line: i + 1 }, end: { line: i + 1 } },
          type: 'FunctionDeclaration',
        } as ASTNode);
      }
    }

    return { functions };
  }

  private findNodeAtLocation(ast: ParsedAST, location: CodeLocation): ASTNode | null {
    // Simplified AST traversal to find node at specific location
    // In a real implementation, this would use proper AST visitor pattern
    return this.traverseAST(ast, (node: ASTNode) => {
      if (node.location &&
          node.location.start.line <= location.line &&
          node.location.end.line >= location.line) {
        return node;
      }
      return null;
    });
  }

  private traverseAST(node: ASTNode | ParsedAST, visitor: (node: ASTNode) => ASTNode | null): ASTNode | null {
    // If it's a ParsedAST, traverse its functions
    if ('functions' in node) {
      for (const func of node.functions) {
        const result = this.traverseAST(func, visitor);
        if (result) return result;
      }
      return null;
    }

    const result = visitor(node);
    if (result) return result;

    const astNode = node as ASTNode;

    if (astNode.declarations) {
      for (const decl of astNode.declarations) {
        const result = this.traverseAST(decl, visitor);
        if (result) return result;
      }
    }

    if (astNode.methods) {
      for (const method of astNode.methods) {
        const result = this.traverseAST(method, visitor);
        if (result) return result;
      }
    }

    if (astNode.body && Array.isArray(astNode.body)) {
      for (const child of astNode.body) {
        const result = this.traverseAST(child, visitor);
        if (result) return result;
      }
    }

    return null;
  }

  private getNodeType(node: ASTNode): ExecutionNode['type'] {
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
      return 'function';
    }
    if (node.type === 'MethodDeclaration') {
      return 'method';
    }
    if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') {
      return 'conditional';
    }
    if (node.type === 'ForStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
      return 'loop';
    }
    return 'assignment';
  }

  private async analyzeDataFlow(
    node: ASTNode,
    execNode: ExecutionNode,
    _graph: ExecutionGraph,
  ): Promise<void> {
    // Analyze variable assignments and state changes
    const assignments = this.findAssignments(node);
    const stateChanges: StateChange[] = [];

    for (const assignment of assignments) {
      stateChanges.push({
        variable: assignment.variable,
        oldValue: null, // Would need more sophisticated analysis
        newValue: assignment.value,
        scope: this.determineScope(assignment),
      });
    }

    execNode.data.stateChanges = stateChanges;
  }

  private findFunctionCalls(node: ASTNode): Array<{ name: string; condition?: string }> {
    const calls: Array<{ name: string; condition?: string }> = [];

    this.traverseAST(node, (child: ASTNode) => {
      if (child.type === 'CallExpression') {
        calls.push({
          name: this.extractCallName(child),
          condition: this.extractCondition(child),
        });
      }
      return null;
    });

    return calls;
  }

  private extractCallName(callNode: ASTNode): string {
    if (callNode.callee?.type === 'Identifier') {
      return callNode.callee.name || 'unknown';
    }
    if (callNode.callee?.type === 'MemberExpression') {
      return `${this.extractCallName(callNode.callee.object || {} as ASTNode)}.${callNode.callee.property?.name || 'unknown'}`;
    }
    return 'unknown';
  }

  private extractCondition(_node: ASTNode): string | undefined {
    // Check if this call is within a conditional
    // Simplified implementation
    return undefined;
  }

  private async resolveCallLocation(
    call: { name: string; condition?: string },
    currentFile: string,
  ): Promise<CodeLocation | null> {
    // Resolve function call to its definition
    // This would need proper symbol resolution
    // For now, return a simplified version

    // Check if it's a method call
    if (call.name.includes('.')) {
      const [_objectName, _methodName] = call.name.split('.');
      // Would need to resolve object type and find method
    }

    // Check current file
    const fileContent = await this.readFile(currentFile);
    const lines = fileContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`function ${call.name}`) ||
          lines[i].includes(`${call.name}(`) ||
          lines[i].includes(`${call.name} =`)) {
        return {
          file: currentFile,
          line: i + 1,
          functionName: call.name,
        };
      }
    }

    return null;
  }

  private findAssignments(node: ASTNode): Array<{ variable: string; value: ASTNode | undefined; location: ASTLocation | undefined }> {
    const assignments: Array<{ variable: string; value: ASTNode | undefined; location: ASTLocation | undefined }> = [];

    this.traverseAST(node, (child: ASTNode) => {
      if (child.type === 'AssignmentExpression' || child.type === 'VariableDeclarator') {
        assignments.push({
          variable: this.extractVariableName(child.left || child.id),
          value: child.right || child.init,
          location: child.location,
        });
      }
      return null;
    });

    return assignments;
  }

  private extractVariableName(node: ASTNode | undefined): string {
    if (!node) return 'unknown';
    if (node.type === 'Identifier') {
      return node.name || 'unknown';
    }
    if (node.type === 'MemberExpression') {
      return `${this.extractVariableName(node.object)}.${node.property?.name || 'unknown'}`;
    }
    return 'unknown';
  }

  private determineScope(assignment: { variable: string; value: ASTNode | undefined; location: ASTLocation | undefined }): 'local' | 'global' | 'instance' {
    // Simplified scope determination
    if (assignment.variable.startsWith('this.')) {
      return 'instance';
    }
    // Would need proper scope analysis
    return 'local';
  }

  private locationToId(location: CodeLocation): string {
    return `${location.file}:${location.line}:${location.column || 0}`;
  }

  async buildExecutionPath(graph: ExecutionGraph, pathId: string): Promise<ExecutionPath> {
    const steps: ExecutionStep[] = [];
    const visited = new Set<string>();

    // Build path from entry point
    await this.buildPathSteps(graph, graph.entryPoint, steps, visited);

    // Calculate complexity metrics
    const complexity = this.calculateComplexity(steps);

    return {
      id: pathId,
      steps,
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      complexity,
    };
  }

  private async buildPathSteps(
    graph: ExecutionGraph,
    nodeId: string,
    steps: ExecutionStep[],
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (!node) return;

    const step: ExecutionStep = {
      location: node.location,
      operation: node.type,
      inputs: [], // Would need data flow analysis
      outputs: [], // Would need data flow analysis
      stateChanges: node.data.stateChanges || [],
      duration: this.estimateDuration(node),
    };
    steps.push(step);

    // Follow edges
    const outgoingEdges = graph.edges.filter(e => e.from === nodeId);
    for (const edge of outgoingEdges) {
      await this.buildPathSteps(graph, edge.to, steps, visited);
    }
  }

  private estimateDuration(node: ExecutionNode): number {
    // Simplified duration estimation
    switch (node.type) {
      case 'loop':
        return 10; // Base loop overhead
      case 'conditional':
        return 1;
      case 'function':
      case 'method':
        return 5;
      default:
        return 0.1;
    }
  }

  private calculateComplexity(steps: ExecutionStep[]): ComplexityMetrics {
    let cyclomaticComplexity = 1; // Base complexity
    let cognitiveComplexity = 0;
    let nestedDepth = 0;
    let maxNestedDepth = 0;

    for (const step of steps) {
      if (step.operation === 'conditional') {
        cyclomaticComplexity++;
        cognitiveComplexity += (1 + nestedDepth);
      } else if (step.operation === 'loop') {
        cyclomaticComplexity++;
        cognitiveComplexity += (1 + nestedDepth);
        nestedDepth++;
        maxNestedDepth = Math.max(maxNestedDepth, nestedDepth);
      }
    }

    // Estimate Big O complexity
    const hasNestedLoops = maxNestedDepth >= 2;
    const bigOTime = hasNestedLoops ? `O(n^${maxNestedDepth})` : 'O(n)';
    const bigOSpace = 'O(1)'; // Simplified

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      bigOTime,
      bigOSpace,
    };
  }
}