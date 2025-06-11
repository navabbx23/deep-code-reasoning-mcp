import * as fs from 'fs/promises';
import type {
  CodeScope,
  CodeLocation,
  Hypothesis,
} from '../models/types.js';

interface TestResult extends Hypothesis {
  confidence: number;
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  suggestedFix?: string;
}

interface Evidence {
  type: 'code_pattern' | 'execution_trace' | 'data_flow' | 'timing';
  description: string;
  location: CodeLocation;
  strength: 'weak' | 'moderate' | 'strong';
}

interface TestStrategy {
  name: string;
  applicableHypotheses: string[];
  execute: (hypothesis: string, scope: CodeScope) => Promise<Evidence[]>;
}

export class HypothesisTester {
  private testStrategies: Map<string, TestStrategy>;

  constructor() {
    this.testStrategies = new Map();
    this.initializeStrategies();
  }

  async testHypothesis(
    hypothesis: string,
    codeScope: CodeScope,
    testApproach: string,
  ): Promise<TestResult> {
    const hypothesisId = `hyp_${Date.now()}`;

    // Select appropriate test strategies
    const strategies = this.selectStrategies(hypothesis, testApproach);

    // Gather evidence
    const allEvidence: Evidence[] = [];
    for (const strategy of strategies) {
      try {
        const evidence = await strategy.execute(hypothesis, codeScope);
        allEvidence.push(...evidence);
      } catch (error) {
        console.error(`Strategy ${strategy.name} failed:`, error);
      }
    }

    // Analyze evidence
    const supportingEvidence = allEvidence.filter(e => this.supportsHypothesis(e, hypothesis));
    const contradictingEvidence = allEvidence.filter(e => this.contradictsHypothesis(e, hypothesis));

    // Calculate confidence
    const confidence = this.calculateConfidence(supportingEvidence, contradictingEvidence);

    // Determine validation status
    const validated = confidence > 0.7 && supportingEvidence.length > contradictingEvidence.length;

    // Generate fix suggestion if validated
    const suggestedFix = validated ? this.generateFixSuggestion(hypothesis, supportingEvidence) : undefined;

    return {
      id: hypothesisId,
      description: hypothesis,
      testApproach,
      validated,
      evidence: supportingEvidence.map(e => e.description),
      confidence,
      supportingEvidence,
      contradictingEvidence,
      suggestedFix,
    };
  }

  private initializeStrategies() {
    // Race condition detection strategy
    this.testStrategies.set('race_condition', {
      name: 'race_condition',
      applicableHypotheses: ['race', 'concurrent', 'async', 'timing'],
      execute: async (hypothesis, scope) => this.testRaceCondition(hypothesis, scope),
    });

    // N+1 query detection strategy
    this.testStrategies.set('n_plus_one', {
      name: 'n_plus_one',
      applicableHypotheses: ['n+1', 'query', 'database', 'performance'],
      execute: async (hypothesis, scope) => this.testNPlusOne(hypothesis, scope),
    });

    // Memory leak detection strategy
    this.testStrategies.set('memory_leak', {
      name: 'memory_leak',
      applicableHypotheses: ['memory', 'leak', 'allocation', 'cleanup'],
      execute: async (hypothesis, scope) => this.testMemoryLeak(hypothesis, scope),
    });

    // State corruption detection strategy
    this.testStrategies.set('state_corruption', {
      name: 'state_corruption',
      applicableHypotheses: ['state', 'corruption', 'mutation', 'shared'],
      execute: async (hypothesis, scope) => this.testStateCorruption(hypothesis, scope),
    });

    // Deadlock detection strategy
    this.testStrategies.set('deadlock', {
      name: 'deadlock',
      applicableHypotheses: ['deadlock', 'lock', 'mutex', 'synchronization'],
      execute: async (hypothesis, scope) => this.testDeadlock(hypothesis, scope),
    });
  }

  private selectStrategies(hypothesis: string, testApproach: string): TestStrategy[] {
    const strategies: TestStrategy[] = [];
    const hypothesisLower = hypothesis.toLowerCase();

    // Select based on hypothesis keywords
    for (const [_name, strategy] of this.testStrategies) {
      if (strategy.applicableHypotheses.some(keyword => hypothesisLower.includes(keyword))) {
        strategies.push(strategy);
      }
    }

    // If no specific strategies found, use general approach
    if (strategies.length === 0) {
      if (testApproach.includes('trace')) {
        strategies.push(this.createGeneralTraceStrategy());
      } else if (testApproach.includes('pattern')) {
        strategies.push(this.createGeneralPatternStrategy());
      }
    }

    return strategies;
  }

  private async testRaceCondition(hypothesis: string, scope: CodeScope): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    for (const file of scope.files) {
      const content = await this.readFile(file);

      // Look for async operations without proper synchronization
      const asyncPatterns = [
        /async\s+function/g,
        /\.then\(/g,
        /await\s+/g,
        /Promise\./g,
      ];

      const sharedStatePatterns = [
        /this\.\w+\s*=/g,
        /global\.\w+\s*=/g,
        /window\.\w+\s*=/g,
      ];

      // Check for shared state access in async contexts
      const asyncMatches = this.findMatches(content, asyncPatterns);
      const stateMatches = this.findMatches(content, sharedStatePatterns);

      // Look for potential race conditions
      for (const asyncMatch of asyncMatches) {
        const nearbyStateAccess = stateMatches.filter(stateMatch =>
          Math.abs(stateMatch.line - asyncMatch.line) < 10,
        );

        if (nearbyStateAccess.length > 0) {
          evidence.push({
            type: 'code_pattern',
            description: `Shared state access in async context at line ${asyncMatch.line}`,
            location: {
              file,
              line: asyncMatch.line,
            },
            strength: 'moderate',
          });
        }
      }

      // Look for missing locks/synchronization
      const lockPatterns = [/mutex/, /lock/, /synchronized/, /Semaphore/];
      const hasLocks = lockPatterns.some(pattern => pattern.test(content));

      if (asyncMatches.length > 2 && !hasLocks) {
        evidence.push({
          type: 'code_pattern',
          description: 'Multiple async operations without synchronization primitives',
          location: {
            file,
            line: 0,
          },
          strength: 'weak',
        });
      }
    }

    return evidence;
  }

  private async testNPlusOne(hypothesis: string, scope: CodeScope): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    for (const file of scope.files) {
      const content = await this.readFile(file);
      const lines = content.split('\n');

      // Look for queries inside loops
      let inLoop = false;
      let loopDepth = 0;
      let _loopStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Track loop entry/exit
        if (this.isLoopStart(line)) {
          if (!inLoop) _loopStartLine = i;
          inLoop = true;
          loopDepth++;
        } else if (line.includes('}') && inLoop) {
          loopDepth--;
          if (loopDepth === 0) inLoop = false;
        }

        // Check for queries inside loops
        if (inLoop) {
          const queryPatterns = [
            /\.(find|findOne|findAll|select)\(/,
            /query\(/,
            /SELECT/i,
            /fetch\(/,
          ];

          if (queryPatterns.some(pattern => pattern.test(line))) {
            evidence.push({
              type: 'code_pattern',
              description: `Database query inside loop at line ${i + 1}`,
              location: {
                file,
                line: i + 1,
              },
              strength: 'strong',
            });
          }
        }
      }

      // Look for missing eager loading
      const modelPatterns = /\.(hasMany|belongsTo|hasOne)\(/g;
      const includePatterns = /include:|includes:/g;

      const hasRelations = modelPatterns.test(content);
      const hasIncludes = includePatterns.test(content);

      if (hasRelations && !hasIncludes) {
        evidence.push({
          type: 'code_pattern',
          description: 'Model relations defined without eager loading',
          location: {
            file,
            line: 0,
          },
          strength: 'moderate',
        });
      }
    }

    return evidence;
  }

  private async testMemoryLeak(hypothesis: string, scope: CodeScope): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    for (const file of scope.files) {
      const content = await this.readFile(file);

      // Check for uncleared timers
      const timerSetters = [
        { pattern: /setInterval\(/g, cleanup: /clearInterval/ },
        { pattern: /setTimeout\(/g, cleanup: /clearTimeout/ },
      ];

      for (const { pattern, cleanup } of timerSetters) {
        const setMatches = [...content.matchAll(pattern)];
        const hasCleanup = cleanup.test(content);

        if (setMatches.length > 0 && !hasCleanup) {
          evidence.push({
            type: 'code_pattern',
            description: 'Timer set without corresponding cleanup',
            location: {
              file,
              line: this.getLineNumber(content, setMatches[0].index || 0),
            },
            strength: 'strong',
          });
        }
      }

      // Check for event listeners without removal
      const listenerPattern = /addEventListener\(['"](\w+)['"]/g;
      const removePattern = /removeEventListener/;

      const listenerMatches = [...content.matchAll(listenerPattern)];
      const hasRemoval = removePattern.test(content);

      if (listenerMatches.length > 0 && !hasRemoval) {
        evidence.push({
          type: 'code_pattern',
          description: 'Event listeners added without removal',
          location: {
            file,
            line: this.getLineNumber(content, listenerMatches[0].index || 0),
          },
          strength: 'moderate',
        });
      }

      // Check for large object retention
      const largeObjectPatterns = [
        /new\s+Array\(\d{4,}\)/g, // Arrays with 1000+ elements
        /new\s+Buffer\(/g,
        /cache\s*=\s*{/g,
      ];

      for (const pattern of largeObjectPatterns) {
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          // Check if objects are ever cleared
          const clearPatterns = [/= null/, /delete /, /\.clear\(/];
          const hasClearing = clearPatterns.some(p => p.test(content));

          if (!hasClearing) {
            evidence.push({
              type: 'code_pattern',
              description: 'Large objects created without cleanup',
              location: {
                file,
                line: this.getLineNumber(content, matches[0].index || 0),
              },
              strength: 'moderate',
            });
          }
        }
      }
    }

    return evidence;
  }

  private async testStateCorruption(hypothesis: string, scope: CodeScope): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    for (const file of scope.files) {
      const content = await this.readFile(file);

      // Check for direct state mutation
      const mutationPatterns = [
        /state\.\w+\s*=/g,
        /this\.state\.\w+\s*=/g,
        /\.push\(/g,
        /\.pop\(/g,
        /\.shift\(/g,
        /\.splice\(/g,
      ];

      for (const pattern of mutationPatterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
          evidence.push({
            type: 'code_pattern',
            description: 'Direct state mutation detected',
            location: {
              file,
              line: this.getLineNumber(content, match.index || 0),
            },
            strength: 'strong',
          });
        }
      }

      // Check for shared mutable state
      const sharedStatePatterns = [
        /static\s+\w+\s*=\s*{/g,
        /global\.\w+\s*=\s*{/g,
        /window\.\w+\s*=\s*{/g,
      ];

      for (const pattern of sharedStatePatterns) {
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          evidence.push({
            type: 'code_pattern',
            description: 'Shared mutable state detected',
            location: {
              file,
              line: this.getLineNumber(content, matches[0].index || 0),
            },
            strength: 'moderate',
          });
        }
      }

      // Check for missing defensive copying
      const returnPatterns = /return\s+this\.\w+(?!\.\w+)/g;
      const returnMatches = [...content.matchAll(returnPatterns)];

      for (const match of returnMatches) {
        const line = this.getLineNumber(content, match.index || 0);
        const lineContent = content.split('\n')[line - 1];

        // Check if it's returning an object/array without copying
        if (!lineContent.includes('...') && !lineContent.includes('Object.assign') && !lineContent.includes('.slice()')) {
          evidence.push({
            type: 'code_pattern',
            description: 'Returning internal state without defensive copying',
            location: {
              file,
              line,
            },
            strength: 'moderate',
          });
        }
      }
    }

    return evidence;
  }

  private async testDeadlock(hypothesis: string, scope: CodeScope): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    for (const file of scope.files) {
      const content = await this.readFile(file);

      // Look for multiple lock acquisitions
      const lockPatterns = [
        /lock\(/g,
        /acquire\(/g,
        /mutex\./g,
        /synchronized/g,
      ];

      const lockAcquisitions: Array<{ type: string; line: number }> = [];

      for (const pattern of lockPatterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
          lockAcquisitions.push({
            type: match[0],
            line: this.getLineNumber(content, match.index || 0),
          });
        }
      }

      // Check for multiple locks in same function
      if (lockAcquisitions.length > 1) {
        // Group by proximity (within 20 lines)
        const groups: Array<typeof lockAcquisitions> = [];
        let currentGroup: typeof lockAcquisitions = [lockAcquisitions[0]];

        for (let i = 1; i < lockAcquisitions.length; i++) {
          if (lockAcquisitions[i].line - lockAcquisitions[i-1].line < 20) {
            currentGroup.push(lockAcquisitions[i]);
          } else {
            if (currentGroup.length > 1) groups.push(currentGroup);
            currentGroup = [lockAcquisitions[i]];
          }
        }
        if (currentGroup.length > 1) groups.push(currentGroup);

        for (const group of groups) {
          evidence.push({
            type: 'code_pattern',
            description: `Multiple lock acquisitions in close proximity (lines ${group[0].line}-${group[group.length-1].line})`,
            location: {
              file,
              line: group[0].line,
            },
            strength: 'strong',
          });
        }
      }

      // Check for nested locks
      const lines = content.split('\n');
      let lockDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (lockPatterns.some(p => p.test(line))) {
          lockDepth++;
          if (lockDepth > 1) {
            evidence.push({
              type: 'code_pattern',
              description: 'Nested lock acquisition detected',
              location: {
                file,
                line: i + 1,
              },
              strength: 'strong',
            });
          }
        } else if (line.includes('unlock') || line.includes('release')) {
          lockDepth = Math.max(0, lockDepth - 1);
        }
      }
    }

    return evidence;
  }

  private createGeneralTraceStrategy(): TestStrategy {
    return {
      name: 'general_trace',
      applicableHypotheses: ['*'],
      execute: async (hypothesis, scope) => {
        const evidence: Evidence[] = [];

        // Generic execution trace analysis
        for (const file of scope.files) {
          const content = await this.readFile(file);

          // Look for error-prone patterns
          const errorPatterns = [
            { pattern: /catch\s*\(\s*\)/g, desc: 'Empty catch block' },
            { pattern: /==\s*null/g, desc: 'Loose null check' },
            { pattern: /eval\(/g, desc: 'Use of eval' },
          ];

          for (const { pattern, desc } of errorPatterns) {
            const matches = [...content.matchAll(pattern)];
            for (const match of matches) {
              evidence.push({
                type: 'code_pattern',
                description: desc,
                location: {
                  file,
                  line: this.getLineNumber(content, match.index || 0),
                },
                strength: 'weak',
              });
            }
          }
        }

        return evidence;
      },
    };
  }

  private createGeneralPatternStrategy(): TestStrategy {
    return {
      name: 'general_pattern',
      applicableHypotheses: ['*'],
      execute: async (hypothesis, scope) => {
        const evidence: Evidence[] = [];

        // Pattern matching based on hypothesis keywords
        const keywords = hypothesis.toLowerCase().split(/\s+/);

        for (const file of scope.files) {
          const content = await this.readFile(file);
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            const matchedKeywords = keywords.filter(k => line.includes(k));

            if (matchedKeywords.length >= 2) {
              evidence.push({
                type: 'code_pattern',
                description: `Code matches hypothesis keywords: ${matchedKeywords.join(', ')}`,
                location: {
                  file,
                  line: i + 1,
                },
                strength: 'weak',
              });
            }
          }
        }

        return evidence;
      },
    };
  }

  private supportsHypothesis(evidence: Evidence, _hypothesis: string): boolean {
    // Evidence supports if it has moderate or strong strength
    return evidence.strength !== 'weak';
  }

  private contradictsHypothesis(evidence: Evidence, _hypothesis: string): boolean {
    // Check if evidence description contains contradicting terms
    const contradictingTerms = ['not', 'no', 'without', 'missing', 'absent'];
    const hasContradiction = contradictingTerms.some(term =>
      evidence.description.toLowerCase().includes(term),
    );

    // Weak evidence that mentions contradicting terms contradicts the hypothesis
    return evidence.strength === 'weak' && hasContradiction;
  }

  private calculateConfidence(
    supporting: Evidence[],
    contradicting: Evidence[],
  ): number {
    // Weight evidence by strength
    const weights = { weak: 0.2, moderate: 0.5, strong: 1.0 };

    const supportScore = supporting.reduce((sum, e) => sum + weights[e.strength], 0);
    const contradictScore = contradicting.reduce((sum, e) => sum + weights[e.strength], 0);

    if (supportScore + contradictScore === 0) return 0;

    return supportScore / (supportScore + contradictScore);
  }

  private generateFixSuggestion(hypothesis: string, evidence: Evidence[]): string {
    const hypothesisLower = hypothesis.toLowerCase();

    if (hypothesisLower.includes('race condition')) {
      return 'Implement proper synchronization using locks, mutexes, or atomic operations';
    } else if (hypothesisLower.includes('n+1') || hypothesisLower.includes('query')) {
      return 'Use eager loading with includes() or batch queries to reduce database calls';
    } else if (hypothesisLower.includes('memory leak')) {
      return 'Ensure proper cleanup of timers, listeners, and large objects in cleanup/unmount methods';
    } else if (hypothesisLower.includes('state corruption')) {
      return 'Use immutable updates and avoid direct state mutation';
    } else if (hypothesisLower.includes('deadlock')) {
      return 'Acquire locks in consistent order across all code paths';
    }

    // Generic suggestion based on evidence
    const mostCommonIssue = this.findMostCommonIssue(evidence);
    return `Address ${mostCommonIssue} issues found in the code`;
  }

  private findMostCommonIssue(evidence: Evidence[]): string {
    const issueCounts = new Map<string, number>();

    for (const e of evidence) {
      const key = e.description.split(' ')[0];
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommon = 'identified';

    for (const [issue, count] of issueCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = issue;
      }
    }

    return mostCommon;
  }

  private findMatches(
    content: string,
    patterns: RegExp[],
  ): Array<{ match: string; line: number; index: number }> {
    const matches: Array<{ match: string; line: number; index: number }> = [];

    for (const pattern of patterns) {
      const patternMatches = [...content.matchAll(pattern)];
      for (const match of patternMatches) {
        matches.push({
          match: match[0],
          line: this.getLineNumber(content, match.index || 0),
          index: match.index || 0,
        });
      }
    }

    return matches;
  }

  private isLoopStart(line: string): boolean {
    const loopKeywords = ['for', 'while', 'forEach', 'map', 'filter', 'reduce'];
    return loopKeywords.some(keyword =>
      line.includes(keyword) && (line.includes('(') || line.includes('{')),
    );
  }

  private getLineNumber(content: string, position: number): number {
    const lines = content.substring(0, position).split('\n');
    return lines.length;
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Cannot read file ${filePath}: ${error}`);
    }
  }
}