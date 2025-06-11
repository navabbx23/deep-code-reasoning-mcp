import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  CodeScope,
  CodeLocation,
  SystemImpact,
  PerformanceIssue,
} from '../models/types.js';

interface ServiceContract {
  service: string;
  type: 'api' | 'event' | 'database' | 'grpc' | 'graphql';
  endpoints: Endpoint[];
  dependencies: string[];
}

interface Endpoint {
  name: string;
  method?: string;
  path?: string;
  inputs: Field[];
  outputs: Field[];
  version?: string;
}

interface Field {
  name: string;
  type: string;
  required: boolean;
  deprecated?: boolean;
}

interface DataFlow {
  source: ServiceContract;
  target: ServiceContract;
  dataTransformations: Transformation[];
  latencyImpact: number;
}

interface Transformation {
  type: 'map' | 'filter' | 'aggregate' | 'join';
  description: string;
  complexity: 'O(1)' | 'O(n)' | 'O(n²)' | 'O(log n)';
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
}

export class SystemBoundaryAnalyzer {
  private contractCache: Map<string, ServiceContract[]>;

  constructor() {
    this.contractCache = new Map();
  }

  async analyzeCrossServiceImpact(
    changeScope: CodeScope,
    impactTypes?: Array<'breaking' | 'performance' | 'behavioral'>,
  ): Promise<ImpactReport> {
    // Extract service contracts from the change scope
    const contracts = await this.extractServiceContracts(changeScope);

    // Model data flow across boundaries
    const crossServiceFlows = await this.traceDataAcrossServices(contracts);

    // Identify potential impacts
    const impacts = await this.modelDownstreamImpact(crossServiceFlows, changeScope);

    // Filter by requested impact types
    return this.filterImpacts(impacts, impactTypes || ['breaking', 'performance', 'behavioral']);
  }

  private async extractServiceContracts(scope: CodeScope): Promise<ServiceContract[]> {
    const contracts: ServiceContract[] = [];

    for (const file of scope.files) {
      // Check cache first
      if (this.contractCache.has(file)) {
        contracts.push(...this.contractCache.get(file)!);
        continue;
      }

      const fileContracts: ServiceContract[] = [];

      // Analyze file for different contract types
      const content = await this.readFile(file);

      // Extract API endpoints
      const apiContracts = await this.extractAPIContracts(file, content);
      fileContracts.push(...apiContracts);

      // Extract event contracts
      const eventContracts = await this.extractEventContracts(file, content);
      fileContracts.push(...eventContracts);

      // Extract database schemas
      const dbContracts = await this.extractDatabaseContracts(file, content);
      fileContracts.push(...dbContracts);

      // Cache results
      this.contractCache.set(file, fileContracts);
      contracts.push(...fileContracts);
    }

    return contracts;
  }

  private async extractAPIContracts(file: string, content: string): Promise<ServiceContract[]> {
    const contracts: ServiceContract[] = [];

    // Pattern matching for REST APIs
    const restPatterns = [
      /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g,
      /@(Get|Post|Put|Delete|Patch)\(['"]([^'"]+)['"]/g,
      /router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g,
    ];

    for (const pattern of restPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const method = match[1].toUpperCase();
        const path = match[2];

        contracts.push({
          service: this.extractServiceName(file),
          type: 'api',
          endpoints: [{
            name: `${method} ${path}`,
            method,
            path,
            inputs: this.extractRequestFields(content, match.index || 0),
            outputs: this.extractResponseFields(content, match.index || 0),
          }],
          dependencies: this.extractDependencies(content),
        });
      }
    }

    // Pattern matching for GraphQL
    const graphqlPattern = /type\s+(Query|Mutation)\s*{([^}]+)}/g;
    const graphqlMatches = content.matchAll(graphqlPattern);
    for (const match of graphqlMatches) {
      const type = match[1];
      const fields = match[2];

      contracts.push({
        service: this.extractServiceName(file),
        type: 'graphql',
        endpoints: this.parseGraphQLFields(fields, type),
        dependencies: this.extractDependencies(content),
      });
    }

    return contracts;
  }

  private async extractEventContracts(file: string, content: string): Promise<ServiceContract[]> {
    const contracts: ServiceContract[] = [];

    // Pattern matching for event emitters/publishers
    const eventPatterns = [
      /emit\(['"]([^'"]+)['"]/g,
      /publish\(['"]([^'"]+)['"]/g,
      /send\(['"]([^'"]+)['"]/g,
      /dispatch\(['"]([^'"]+)['"]/g,
    ];

    for (const pattern of eventPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const eventName = match[1];

        contracts.push({
          service: this.extractServiceName(file),
          type: 'event',
          endpoints: [{
            name: eventName,
            inputs: this.extractEventPayload(content, match.index || 0),
            outputs: [],
          }],
          dependencies: this.extractDependencies(content),
        });
      }
    }

    return contracts;
  }

  private async extractDatabaseContracts(file: string, content: string): Promise<ServiceContract[]> {
    const contracts: ServiceContract[] = [];

    // Pattern matching for database schemas
    const schemaPatterns = [
      /class\s+(\w+)\s+extends\s+Model/g,
      /@Entity\(\)\s*class\s+(\w+)/g,
      /const\s+(\w+)Schema\s*=\s*new\s+Schema/g,
    ];

    for (const pattern of schemaPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const modelName = match[1];

        contracts.push({
          service: this.extractServiceName(file),
          type: 'database',
          endpoints: [{
            name: modelName,
            inputs: this.extractModelFields(content, match.index || 0),
            outputs: this.extractModelFields(content, match.index || 0),
          }],
          dependencies: [],
        });
      }
    }

    return contracts;
  }

  private async traceDataAcrossServices(contracts: ServiceContract[]): Promise<DataFlow[]> {
    const flows: DataFlow[] = [];

    // Build service dependency graph
    const serviceMap = new Map<string, ServiceContract>();
    for (const contract of contracts) {
      serviceMap.set(contract.service, contract);
    }

    // Trace data flow between services
    for (const source of contracts) {
      for (const dependency of source.dependencies) {
        const target = serviceMap.get(dependency);
        if (target) {
          const flow = await this.analyzeDataFlow(source, target);
          flows.push(flow);
        }
      }
    }

    return flows;
  }

  private async analyzeDataFlow(
    source: ServiceContract,
    target: ServiceContract,
  ): Promise<DataFlow> {
    const transformations: Transformation[] = [];

    // Analyze how data is transformed between services
    for (const sourceEndpoint of source.endpoints) {
      for (const targetEndpoint of target.endpoints) {
        const transformation = this.compareEndpoints(sourceEndpoint, targetEndpoint);
        if (transformation) {
          transformations.push(transformation);
        }
      }
    }

    // Estimate latency impact
    const latencyImpact = this.estimateLatency(source, target, transformations);

    return {
      source,
      target,
      dataTransformations: transformations,
      latencyImpact,
    };
  }

  private compareEndpoints(source: Endpoint, target: Endpoint): Transformation | null {
    // Compare field mappings
    const sourceFields = new Set(source.outputs.map(f => f.name));
    const targetFields = new Set(target.inputs.map(f => f.name));

    const commonFields = [...sourceFields].filter(f => targetFields.has(f));
    const missingFields = [...targetFields].filter(f => !sourceFields.has(f));

    if (missingFields.length > 0) {
      return {
        type: 'map',
        description: `Field mapping required: missing ${missingFields.join(', ')}`,
        complexity: 'O(n)',
      };
    }

    if (commonFields.length < targetFields.size) {
      return {
        type: 'filter',
        description: 'Field filtering required',
        complexity: 'O(n)',
      };
    }

    return null;
  }

  private estimateLatency(
    source: ServiceContract,
    target: ServiceContract,
    transformations: Transformation[],
  ): number {
    let baseLatency = 0;

    // Network latency based on service type
    if (source.type === 'api' && target.type === 'api') {
      baseLatency = 20; // HTTP call
    } else if (source.type === 'event') {
      baseLatency = 5; // Async messaging
    } else if (target.type === 'database') {
      baseLatency = 10; // DB query
    }

    // Add transformation overhead
    for (const transform of transformations) {
      switch (transform.complexity) {
        case 'O(1)': baseLatency += 1; break;
        case 'O(log n)': baseLatency += 5; break;
        case 'O(n)': baseLatency += 10; break;
        case 'O(n²)': baseLatency += 50; break;
      }
    }

    return baseLatency;
  }

  private async modelDownstreamImpact(
    flows: DataFlow[],
    changeScope: CodeScope,
  ): Promise<ImpactReport> {
    const breakingChanges: BreakingChange[] = [];
    const performanceImplications: PerformanceIssue[] = [];
    const systemImpacts: SystemImpact[] = [];

    // Analyze each flow for impacts
    for (const flow of flows) {
      // Check for breaking changes
      const breaking = this.identifyBreakingChanges(flow, changeScope);
      breakingChanges.push(...breaking);

      // Check for performance impacts
      if (flow.latencyImpact > 50) {
        performanceImplications.push({
          type: 'excessive_io',
          location: {
            file: changeScope.files[0],
            line: 0,
          },
          impact: {
            estimatedLatency: flow.latencyImpact,
            affectedOperations: [
              `${flow.source.service} → ${flow.target.service}`,
            ],
            frequency: 1,
          },
          suggestion: `Optimize data flow between ${flow.source.service} and ${flow.target.service}`,
        });
      }

      // Build system impact tree
      const impact = await this.buildImpactTree(flow, changeScope);
      systemImpacts.push(impact);
    }

    return {
      breakingChanges,
      performanceImplications,
      systemImpacts,
    };
  }

  private identifyBreakingChanges(flow: DataFlow, changeScope: CodeScope): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // Check for incompatible field changes
    for (const sourceEndpoint of flow.source.endpoints) {
      for (const targetEndpoint of flow.target.endpoints) {
        const incompatibilities = this.findIncompatibilities(sourceEndpoint, targetEndpoint);

        for (const issue of incompatibilities) {
          changes.push({
            service: flow.target.service,
            description: issue.description,
            affectedLocations: [{
              file: changeScope.files[0],
              line: 0,
            }],
            confidence: issue.confidence,
            mitigation: issue.mitigation,
          });
        }
      }
    }

    return changes;
  }

  private findIncompatibilities(
    source: Endpoint,
    target: Endpoint,
  ): Array<{ description: string; confidence: number; mitigation: string }> {
    const issues: Array<{ description: string; confidence: number; mitigation: string }> = [];

    // Check required fields
    for (const field of target.inputs) {
      if (field.required && !source.outputs.find(f => f.name === field.name)) {
        issues.push({
          description: `Required field '${field.name}' missing in ${source.name}`,
          confidence: 0.9,
          mitigation: `Add field '${field.name}' to response or make it optional`,
        });
      }
    }

    // Check type mismatches
    for (const sourceField of source.outputs) {
      const targetField = target.inputs.find(f => f.name === sourceField.name);
      if (targetField && sourceField.type !== targetField.type) {
        issues.push({
          description: `Type mismatch for field '${sourceField.name}': ${sourceField.type} vs ${targetField.type}`,
          confidence: 0.8,
          mitigation: 'Add type conversion or update contract',
        });
      }
    }

    return issues;
  }

  private async buildImpactTree(flow: DataFlow, _changeScope: CodeScope): Promise<SystemImpact> {
    const impact: SystemImpact = {
      service: flow.target.service,
      impactType: 'behavioral',
      affectedEndpoints: flow.target.endpoints.map(e => e.name),
      downstreamEffects: [],
    };

    // Recursively find downstream impacts
    // (Simplified - would need to trace through all flows)

    return impact;
  }

  private filterImpacts(
    report: ImpactReport,
    types: Array<'breaking' | 'performance' | 'behavioral'>,
  ): ImpactReport {
    const filtered: ImpactReport = {
      breakingChanges: types.includes('breaking') ? report.breakingChanges : [],
      performanceImplications: types.includes('performance') ? report.performanceImplications : [],
      systemImpacts: report.systemImpacts.filter(impact =>
        types.includes(impact.impactType as any),
      ),
    };

    return filtered;
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Cannot read file ${filePath}: ${error}`);
    }
  }

  private extractServiceName(filePath: string): string {
    // Extract service name from file path
    const parts = filePath.split('/');
    const serviceIndex = parts.findIndex(p => p === 'services' || p === 'src');
    if (serviceIndex >= 0 && serviceIndex < parts.length - 1) {
      return parts[serviceIndex + 1];
    }
    return path.basename(path.dirname(filePath));
  }

  private extractRequestFields(content: string, position: number): Field[] {
    // Simplified field extraction
    const fields: Field[] = [];

    // Look for request body definitions near the endpoint
    const bodyPattern = /body:\s*{([^}]+)}/;
    const match = content.slice(position, position + 500).match(bodyPattern);

    if (match) {
      const fieldPattern = /(\w+):\s*(\w+)/g;
      const fieldMatches = match[1].matchAll(fieldPattern);
      for (const fieldMatch of fieldMatches) {
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[2],
          required: true,
        });
      }
    }

    return fields;
  }

  private extractResponseFields(content: string, position: number): Field[] {
    // Similar to extractRequestFields but for responses
    return this.extractRequestFields(content, position);
  }

  private extractEventPayload(content: string, position: number): Field[] {
    // Extract event payload structure
    const fields: Field[] = [];

    // Look for object being emitted
    const emitPattern = /emit\([^,]+,\s*{([^}]+)}/;
    const match = content.slice(position, position + 200).match(emitPattern);

    if (match) {
      const fieldPattern = /(\w+):\s*([^,]+)/g;
      const fieldMatches = match[1].matchAll(fieldPattern);
      for (const fieldMatch of fieldMatches) {
        fields.push({
          name: fieldMatch[1],
          type: 'any',
          required: true,
        });
      }
    }

    return fields;
  }

  private extractModelFields(content: string, position: number): Field[] {
    // Extract database model fields
    const fields: Field[] = [];

    // Look for field definitions
    const fieldPatterns = [
      /@Column\(\)\s*(\w+):\s*(\w+)/g,
      /(\w+):\s*{\s*type:\s*(\w+)/g,
    ];

    const searchContent = content.slice(position, position + 1000);
    for (const pattern of fieldPatterns) {
      const matches = searchContent.matchAll(pattern);
      for (const match of matches) {
        fields.push({
          name: match[1],
          type: match[2],
          required: true,
        });
      }
    }

    return fields;
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // Extract import statements
    const importPattern = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    const matches = content.matchAll(importPattern);

    for (const match of matches) {
      const importPath = match[1];
      if (importPath.includes('service') || importPath.includes('client')) {
        const serviceName = this.extractServiceFromImport(importPath);
        if (serviceName) {
          dependencies.push(serviceName);
        }
      }
    }

    return [...new Set(dependencies)];
  }

  private extractServiceFromImport(importPath: string): string | null {
    const parts = importPath.split('/');
    const serviceIndex = parts.findIndex(p => p === 'services' || p.endsWith('Service'));
    if (serviceIndex >= 0) {
      return parts[serviceIndex].replace('Service', '');
    }
    return null;
  }

  private parseGraphQLFields(fieldsStr: string, type: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const fieldPattern = /(\w+)(\([^)]*\))?\s*:\s*(\w+)/g;
    const matches = fieldsStr.matchAll(fieldPattern);

    for (const match of matches) {
      endpoints.push({
        name: `${type}.${match[1]}`,
        inputs: [], // Would need to parse arguments
        outputs: [{
          name: 'result',
          type: match[3],
          required: true,
        }],
      });
    }

    return endpoints;
  }
}