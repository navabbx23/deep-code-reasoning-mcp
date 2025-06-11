import { GoogleGenerativeAI, ChatSession, Content } from '@google/generative-ai';
import type {
  ClaudeCodeContext,
  DeepAnalysisResult,
  CodeLocation,
} from '../models/types.js';
import { SessionError, SessionNotFoundError } from '../errors/index.js';

export interface ConversationContext {
  sessionId: string;
  analysisType: string;
  codeFiles: Map<string, string>;
  claudeContext: ClaudeCodeContext;
}

export class ConversationalGeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private activeSessions: Map<string, ChatSession> = new Map();
  private sessionContexts: Map<string, ConversationContext> = new Map();

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-pro-preview-06-05',
      generationConfig: {
        temperature: 0.3, // Slightly higher for conversational flow
        topK: 1,
        topP: 1,
        maxOutputTokens: 4096, // Smaller for conversational turns
      },
    }, {
      apiVersion: 'v1beta',
    });
  }

  async startConversation(
    sessionId: string,
    context: ClaudeCodeContext,
    analysisType: string,
    codeContent: Map<string, string>,
    initialQuestion?: string
  ): Promise<{ response: string; suggestedFollowUps: string[] }> {
    // Build initial system context
    const systemPrompt = this.buildSystemPrompt(context, analysisType);
    
    // Initialize chat session
    const chat = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I\'m ready to perform deep code analysis as a conversational partner with Claude. I\'ll provide insights that go beyond syntactic patterns and engage in iterative refinement based on new information.' }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topK: 1,
        topP: 1,
        maxOutputTokens: 4096,
      },
    });

    // Store session
    this.activeSessions.set(sessionId, chat);
    this.sessionContexts.set(sessionId, {
      sessionId,
      analysisType,
      codeFiles: codeContent,
      claudeContext: context,
    });

    // Send initial analysis request
    const initialPrompt = this.buildInitialAnalysisPrompt(
      context,
      analysisType,
      codeContent,
      initialQuestion
    );

    const result = await chat.sendMessage(initialPrompt);
    const response = result.response.text();

    // Extract suggested follow-up questions
    const followUps = this.extractFollowUpQuestions(response, analysisType);

    return {
      response,
      suggestedFollowUps: followUps,
    };
  }

  async continueConversation(
    sessionId: string,
    message: string,
    includeCodeSnippets?: boolean
  ): Promise<{ response: string; analysisProgress: number; canFinalize: boolean }> {
    const chat = this.activeSessions.get(sessionId);
    const context = this.sessionContexts.get(sessionId);
    
    if (!chat || !context) {
      throw new SessionNotFoundError(sessionId);
    }

    // Process Claude's message
    let enrichedMessage = message;
    if (includeCodeSnippets && this.hasCodeReference(message)) {
      enrichedMessage = this.enrichMessageWithCode(message, context.codeFiles);
    }

    // Send message to Gemini
    const result = await chat.sendMessage(enrichedMessage);
    const response = result.response.text();

    // Calculate analysis progress
    const progress = this.calculateProgress(chat, context);
    const canFinalize = progress >= 0.8;

    return {
      response,
      analysisProgress: progress,
      canFinalize,
    };
  }

  async finalizeConversation(
    sessionId: string,
    summaryFormat: 'detailed' | 'concise' | 'actionable' = 'detailed'
  ): Promise<DeepAnalysisResult> {
    const chat = this.activeSessions.get(sessionId);
    const context = this.sessionContexts.get(sessionId);
    
    if (!chat || !context) {
      throw new SessionNotFoundError(sessionId);
    }

    // Request final synthesis
    const synthesisPrompt = this.buildSynthesisPrompt(summaryFormat);
    const result = await chat.sendMessage(synthesisPrompt);
    const finalAnalysis = result.response.text();

    // Parse and structure the final results
    const structuredResult = this.parseConversationalAnalysis(
      finalAnalysis,
      context.claudeContext
    );

    // Clean up session
    this.activeSessions.delete(sessionId);
    this.sessionContexts.delete(sessionId);

    return structuredResult;
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  private buildSystemPrompt(context: ClaudeCodeContext, analysisType: string): string {
    return `You are participating in a collaborative code analysis session with Claude. Your role is to provide deep semantic analysis that goes beyond what Claude can achieve with syntactic pattern matching.

Context:
- Analysis type: ${analysisType}
- Claude has attempted: ${context.attemptedApproaches.join(', ')}
- Claude is stuck on: ${context.stuckPoints.join(', ')}
- Partial findings: ${JSON.stringify(context.partialFindings)}

Guidelines for conversation:
1. Ask clarifying questions when needed
2. Build on information provided by Claude
3. Provide specific, evidence-based insights
4. Suggest concrete next steps for investigation
5. Be willing to revise your analysis based on new information

You should maintain a balance between:
- Providing immediate insights
- Asking for specific information that would help
- Building a comprehensive understanding through dialogue`;
  }

  private buildInitialAnalysisPrompt(
    context: ClaudeCodeContext,
    analysisType: string,
    codeContent: Map<string, string>,
    initialQuestion?: string
  ): string {
    let prompt = `Let's begin our analysis. Here's the code we're examining:\n\n`;

    // Add code snippets
    for (const [file, content] of codeContent) {
      prompt += `--- File: ${file} ---\n${content.substring(0, 2000)}...\n\n`;
    }

    // Add specific focus based on analysis type
    switch (analysisType) {
      case 'execution_trace':
        prompt += `Please start by identifying the main execution flow and any non-obvious control paths. What questions do you have about the execution context?`;
        break;
      case 'cross_system':
        prompt += `Please identify the service boundaries and communication patterns. What additional context about the services would help your analysis?`;
        break;
      case 'performance':
        prompt += `Please identify potential performance bottlenecks. What runtime characteristics would you need to know for a complete analysis?`;
        break;
      case 'hypothesis_test':
        prompt += `Based on the stuck points, what initial hypotheses come to mind? What specific evidence would help validate or refute them?`;
        break;
    }

    if (initialQuestion) {
      prompt += `\n\nClaude's initial question: ${initialQuestion}`;
    }

    return prompt;
  }

  private buildSynthesisPrompt(format: 'detailed' | 'concise' | 'actionable'): string {
    const formatInstructions = {
      detailed: 'Provide a comprehensive analysis with all findings, evidence, and reasoning.',
      concise: 'Summarize the key findings and most critical recommendations.',
      actionable: 'Focus on specific, implementable actions with clear priorities.',
    };

    return `Based on our entire conversation, please provide a final analysis summary.

Format: ${formatInstructions[format]}

Structure your response as JSON with the following format:
{
  "rootCauses": [{
    "type": "string",
    "description": "detailed description",
    "evidence": ["specific code locations"],
    "confidence": 0.0-1.0,
    "fixStrategy": "concrete approach"
  }],
  "keyFindings": [{
    "finding": "description",
    "significance": "why this matters",
    "evidence": ["supporting facts from our conversation"]
  }],
  "recommendations": {
    "immediate": ["specific actions to take now"],
    "investigate": ["areas needing further analysis"],
    "longTerm": ["architectural improvements"]
  },
  "conversationInsights": [{
    "insight": "what we discovered through dialogue",
    "turnReference": "which part of conversation revealed this"
  }]
}`;
  }

  private extractFollowUpQuestions(response: string, analysisType: string): string[] {
    const questions: string[] = [];
    
    // Extract explicit questions from response
    const questionMatches = response.match(/\?[^.!?]*$/gm);
    if (questionMatches) {
      questions.push(...questionMatches.map(q => q.trim()));
    }

    // Add analysis-specific follow-ups
    switch (analysisType) {
      case 'execution_trace':
        if (response.includes('async') || response.includes('concurrent')) {
          questions.push('Are there any synchronization mechanisms or race condition guards?');
        }
        break;
      case 'performance':
        if (response.includes('database') || response.includes('query')) {
          questions.push('What are the typical data volumes and query patterns?');
        }
        break;
    }

    return questions.slice(0, 3); // Limit to top 3 questions
  }

  private hasCodeReference(message: string): boolean {
    return /\b(file|function|method|class|line)\s*[:=]\s*\S+/i.test(message);
  }

  private enrichMessageWithCode(message: string, codeFiles: Map<string, string>): string {
    // Find file references in the message
    const fileRefs = message.match(/(\w+\.\w+):?(\d+)?/g) || [];
    
    let enriched = message + '\n\nReferenced code:\n';
    
    for (const ref of fileRefs) {
      const [fileName, lineNum] = ref.split(':');
      for (const [file, content] of codeFiles) {
        if (file.includes(fileName)) {
          const lines = content.split('\n');
          if (lineNum) {
            const line = parseInt(lineNum);
            const start = Math.max(0, line - 3);
            const end = Math.min(lines.length, line + 3);
            enriched += `\n--- ${file} (lines ${start + 1}-${end}) ---\n`;
            enriched += lines.slice(start, end).join('\n');
          }
        }
      }
    }
    
    return enriched;
  }

  private calculateProgress(chat: ChatSession, context: ConversationContext): number {
    // Simple progress calculation based on conversation context
    const sessionContext = this.sessionContexts.get(context.sessionId);
    if (!sessionContext) return 0;
    
    // Estimate based on context analysis
    const hasMultipleFindings = context.claudeContext.partialFindings.length > 2;
    const hasComplexScope = context.codeFiles.size > 5;
    const baseProgress = hasMultipleFindings ? 0.4 : 0.2;
    
    // Check if we've covered the main analysis areas
    const hasRootCauseDiscussion = sessionContext.claudeContext.stuckPoints.some(p => 
      p.toLowerCase().includes('cause') || p.toLowerCase().includes('issue')
    );
    
    const progressBonus = hasRootCauseDiscussion ? 0.3 : 0;
    const complexityBonus = hasComplexScope ? 0.2 : 0.1;
    
    return Math.min(baseProgress + progressBonus + complexityBonus, 0.95);
  }

  private parseConversationalAnalysis(
    finalAnalysis: string,
    originalContext: ClaudeCodeContext
  ): DeepAnalysisResult {
    try {
      const jsonMatch = finalAnalysis.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in final analysis');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        status: 'success',
        findings: {
          rootCauses: parsed.rootCauses || [],
          executionPaths: [],
          performanceBottlenecks: [],
          crossSystemImpacts: [],
        },
        recommendations: {
          immediateActions: (parsed.recommendations?.immediate || []).map((action: string) => ({
            type: 'fix' as const,
            description: action,
            priority: 'high' as const,
            estimatedEffort: '1-2 hours',
          })),
          investigationNextSteps: parsed.recommendations?.investigate || [],
          codeChangesNeeded: (parsed.recommendations?.longTerm || []).map((change: string) => ({
            file: 'unknown',
            changeType: 'modify' as const,
            description: change,
          })),
        },
        enrichedContext: {
          newInsights: (parsed.keyFindings || []).map((finding: any) => ({
            type: 'conversational',
            description: finding.finding,
            supporting_evidence: finding.evidence || [],
          })),
          validatedHypotheses: parsed.conversationInsights?.map((i: any) => i.insight) || [],
          ruledOutApproaches: originalContext.attemptedApproaches,
        },
      };
    } catch (error) {
      console.error('Failed to parse conversational analysis:', error);
      throw error;
    }
  }
}