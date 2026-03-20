/**
 * Multi-agent review pipeline.
 *
 * Each specialised agent receives the PR diff + context and returns structured
 * findings. The orchestrator then deduplicates, ranks, and formats them.
 *
 * All independent agents run in parallel via Promise.all() for speed.
 *
 * This module is deployment-agnostic — LLM calls are made through the
 * injected ILLMProvider interface.
 */

import type { ILLMProvider } from '../llm/types.js';
import {
  SECURITY_REVIEWER_PROMPT,
  BUG_REVIEWER_PROMPT,
  STYLE_REVIEWER_PROMPT,
  SUMMARY_PROMPT,
  DIAGRAM_PROMPT,
  PREVIOUS_DIAGRAM_PLACEHOLDER,
  ERROR_HANDLING_REVIEWER_PROMPT,
  TEST_COVERAGE_REVIEWER_PROMPT,
  COMMENT_ACCURACY_REVIEWER_PROMPT,
  ORCHESTRATOR_PROMPT,
  CUSTOM_AGENT_RESPONSE_FORMAT,
  TONE_DIRECTIVES,
  TONE_PLACEHOLDER,
} from './prompts.js';
import type { CustomAgentDef, UXConfig } from '../config/defaults.js';
import { FILE_REQUEST_INSTRUCTION, invokeWithFileFetching } from '../context/agentic-fetcher.js';
import type { FileFetchOptions } from '../context/agentic-fetcher.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentFinding {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'info';
  confidence?: number;
  title: string;
  description: string;
  suggestion: string;
}

export interface OrchestratedFinding extends AgentFinding {
  category: string;
}

export interface ReviewContext {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** PR title (if available) */
  prTitle?: string;
  /** PR body / description (if available) */
  prBody?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build the user-facing prompt by combining the system prompt with the diff
 * and optional PR context. When agentic file fetching is enabled, injects
 * the FILE_REQUEST_INSTRUCTION via the FILE_REQUEST_PLACEHOLDER in prompts.
 */
function buildPrompt(systemPrompt: string, diff: string, context: ReviewContext, agenticFetch: boolean, tone?: UXConfig['tone']): string {
  // Inject tone directive or strip placeholder
  const toneDirective = tone ? (TONE_DIRECTIVES[tone] ?? '') : '';
  const tonedPrompt = systemPrompt.replace(TONE_PLACEHOLDER, toneDirective);

  // Inject or strip the file request instruction placeholder
  const resolvedPrompt = agenticFetch
    ? tonedPrompt.replace('FILE_REQUEST_PLACEHOLDER', FILE_REQUEST_INSTRUCTION)
    : tonedPrompt.replace('FILE_REQUEST_PLACEHOLDER', '');

  const contextBlock = [
    `Repository: ${context.owner}/${context.repo}`,
    `PR #${context.prNumber}`,
    context.prTitle ? `Title: ${context.prTitle}` : '',
    context.prBody ? `Description:\n${context.prBody}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${resolvedPrompt}\n\n--- PR Context ---\n${contextBlock}\n\n--- Diff ---\n${diff}`;
}

/**
 * Safely parse JSON from a model response.
 * The model may wrap JSON in markdown code fences — strip those first.
 */
function safeParseJson<T>(raw: string, fallback: T): T {
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  // Try to extract JSON object from mixed prose+JSON responses
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.warn('Could not parse agent JSON response, using fallback:', cleaned.slice(0, 200));
    return fallback;
  }
}

// ─── Agent invocation helper ────────────────────────────────────────────────

/**
 * Invoke an agent with optional agentic file fetching.
 * When fileFetchOptions is provided, the agent can request files from the repo.
 * Otherwise, falls back to a simple llm.invoke().
 */
async function invokeAgent(
  llm: ILLMProvider,
  modelId: string,
  prompt: string,
  fileFetchOptions?: FileFetchOptions,
): Promise<string> {
  if (fileFetchOptions) {
    const result = await invokeWithFileFetching(llm, modelId, prompt, fileFetchOptions);
    if (result.roundsUsed > 1) {
      const fileCount = Object.keys(result.fetchedFiles).length;
      console.log(`Agent fetched ${fileCount} file(s) in ${result.roundsUsed} round(s)`);
    }
    return result.response;
  }
  return llm.invoke(modelId, prompt);
}

// ─── Individual agents ─────────────────────────────────────────────────────

/** Run the security review agent. */
export async function runSecurityAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  fileFetchOptions?: FileFetchOptions,
  tone?: UXConfig['tone'],
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(SECURITY_REVIEWER_PROMPT, diff, context, !!fileFetchOptions, tone);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings ?? [];
}

/** Run the bug detection agent. */
export async function runBugAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  fileFetchOptions?: FileFetchOptions,
  tone?: UXConfig['tone'],
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(BUG_REVIEWER_PROMPT, diff, context, !!fileFetchOptions, tone);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings ?? [];
}

/** Run the style / code-quality agent. Accepts optional custom rules. */
export async function runStyleAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  customRules: string[] = [],
  fileFetchOptions?: FileFetchOptions,
  tone?: UXConfig['tone'],
): Promise<AgentFinding[]> {
  let systemPrompt = STYLE_REVIEWER_PROMPT;

  // Inject custom rules if provided
  if (customRules.length > 0) {
    const rulesBlock = customRules.map((r) => `- ${r}`).join('\n');
    systemPrompt = systemPrompt.replace(
      'CUSTOM_RULES_PLACEHOLDER',
      `Additionally, enforce these project-specific rules:\n${rulesBlock}`,
    );
  } else {
    systemPrompt = systemPrompt.replace('CUSTOM_RULES_PLACEHOLDER', '');
  }

  const prompt = buildPrompt(systemPrompt, diff, context, !!fileFetchOptions, tone);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings ?? [];
}

/** Result from the diagram agent. */
export interface DiagramResult {
  diagram: string;
  caption: string;
}

/** Run the diagram agent that produces a Mermaid diagram of changes. */
export async function runDiagramAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  previousDiagram?: string,
): Promise<DiagramResult> {
  // Inject previous diagram for consistency or strip the placeholder
  let diagramPrompt = DIAGRAM_PROMPT;
  if (previousDiagram) {
    diagramPrompt = diagramPrompt.replace(
      PREVIOUS_DIAGRAM_PLACEHOLDER,
      `IMPORTANT — Consistency with previous review:
A previous review of this PR produced the diagram below. Maintain the same node IDs, naming conventions, diagram type, and overall layout. Only update nodes/edges that reflect actual changes in the new diff. Do not reorganise or rename unchanged elements.

Previous diagram:
\`\`\`mermaid
${previousDiagram}
\`\`\``,
    );
  } else {
    diagramPrompt = diagramPrompt.replace(PREVIOUS_DIAGRAM_PLACEHOLDER, '');
  }
  const prompt = buildPrompt(diagramPrompt, diff, context, false);
  const raw = await llm.invoke(modelId, prompt);
  return parseDiagramResponse(raw);
}

/** Parse raw Mermaid response: extract caption from leading %% comment. */
function parseDiagramResponse(raw: string): DiagramResult {
  let cleaned = raw.trim();
  // Strip markdown code fences if the model wraps them anyway
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  if (!cleaned) return { diagram: '', caption: '' };

  // Extract caption from leading Mermaid comment (%% ...)
  const lines = cleaned.split('\n');
  let caption = '';
  if (lines[0].startsWith('%%')) {
    caption = lines[0].replace(/^%%\s*/, '').trim();
    lines.shift();
  }
  const diagram = lines.join('\n').trim();
  return { diagram, caption };
}

/** Run the error handling review agent. */
export async function runErrorHandlingAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  fileFetchOptions?: FileFetchOptions,
  tone?: UXConfig['tone'],
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(ERROR_HANDLING_REVIEWER_PROMPT, diff, context, !!fileFetchOptions, tone);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings ?? [];
}

/** Run the test coverage review agent. */
export async function runTestCoverageAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  fileFetchOptions?: FileFetchOptions,
  tone?: UXConfig['tone'],
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(TEST_COVERAGE_REVIEWER_PROMPT, diff, context, !!fileFetchOptions, tone);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings ?? [];
}

/** Run the comment accuracy review agent. */
export async function runCommentAccuracyAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  fileFetchOptions?: FileFetchOptions,
  tone?: UXConfig['tone'],
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(COMMENT_ACCURACY_REVIEWER_PROMPT, diff, context, !!fileFetchOptions, tone);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings ?? [];
}

/** Run the summary agent that produces a human-readable PR summary. */
export async function runSummaryAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
): Promise<string> {
  const prompt = buildPrompt(SUMMARY_PROMPT, diff, context, false);
  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<{ summary: string }>(raw, { summary: '' });
  return parsed.summary;
}

// ─── Custom agents ──────────────────────────────────────────────────────────

/** Run a user-defined custom review agent. */
export async function runCustomAgent(
  agentDef: CustomAgentDef,
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  fileFetchOptions?: FileFetchOptions,
): Promise<AgentFinding[]> {
  const systemPrompt = `${agentDef.prompt}\n${CUSTOM_AGENT_RESPONSE_FORMAT}`;
  const prompt = buildPrompt(systemPrompt, diff, context, !!fileFetchOptions);
  const raw = await invokeAgent(llm, modelId, prompt, fileFetchOptions);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  // Apply default severity if agent didn't specify
  return (parsed.findings ?? []).map((f) => ({
    ...f,
    severity: f.severity || agentDef.severityDefault,
  }));
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

interface TaggedFindings {
  category: string;
  findings: AgentFinding[];
}

/**
 * Run the orchestrator agent that deduplicates and ranks all findings from
 * the specialised agents.
 */
export interface OrchestratorResult {
  findings: OrchestratedFinding[];
  mergeScore: number;
  mergeScoreReason: string;
}

export async function runOrchestratorAgent(
  taggedFindings: TaggedFindings[],
  modelId: string,
  maxFindings: number,
  llm: ILLMProvider,
): Promise<OrchestratorResult> {
  // Build a combined findings list with category tags for the orchestrator
  const allFindings = taggedFindings.flatMap(({ category, findings }) =>
    (findings ?? []).map((f) => ({ ...f, category })),
  );

  // If there are no findings, skip the orchestrator entirely
  if (allFindings.length === 0) {
    return { findings: [], mergeScore: 5, mergeScoreReason: 'No issues found — clean PR.' };
  }

  const prompt = ORCHESTRATOR_PROMPT
    .replace('MAX_FINDINGS_PLACEHOLDER', String(maxFindings))
    + `\n\n--- Findings from all agents ---\n${JSON.stringify(allFindings, null, 2)}`;

  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<{ findings: OrchestratedFinding[]; mergeScore?: number; mergeScoreReason?: string }>(
    raw,
    { findings: [] },
  );
  return {
    findings: parsed.findings ?? [],
    mergeScore: Math.max(1, Math.min(5, parsed.mergeScore ?? 3)),
    mergeScoreReason: parsed.mergeScoreReason ?? '',
  };
}

// ─── Full pipeline ─────────────────────────────────────────────────────────

export interface ReviewPipelineOptions {
  diff: string;
  context: ReviewContext;
  modelId: string;
  lightModelId: string;
  customStyleRules?: string[];
  maxFindings: number;
  enabledAgents: {
    security: boolean;
    bugs: boolean;
    style: boolean;
    summary: boolean;
    diagram: boolean;
    errorHandling: boolean;
    testCoverage: boolean;
    commentAccuracy: boolean;
  };
  /** Agentic file fetching options — when provided, review agents can request files from the repo */
  fileFetchOptions?: FileFetchOptions;
  /** User-defined custom review agents */
  customAgents?: CustomAgentDef[];
  /** Tone for review findings */
  tone?: UXConfig['tone'];
  /** Previous diagram from an earlier review of this PR, used for layout consistency */
  previousDiagram?: string;
}

export interface ReviewPipelineResult {
  summary: string;
  findings: OrchestratedFinding[];
  diagram: string;
  diagramCaption: string;
  mergeScore: number;
  mergeScoreReason: string;
  /** Number of findings suppressed by the orchestrator (deduplication + filtering) */
  suppressedCount: number;
  /** Number of enabled agents that ran */
  enabledAgentCount: number;
}

/**
 * Execute the full multi-agent review pipeline.
 * All independent agents run in parallel; the orchestrator runs after they complete.
 */
export async function runReviewPipeline(
  options: ReviewPipelineOptions,
  deps: { llm: ILLMProvider },
): Promise<ReviewPipelineResult> {
  const {
    diff,
    context,
    modelId,
    lightModelId,
    customStyleRules = [],
    maxFindings,
    enabledAgents,
    fileFetchOptions,
    customAgents = [],
    tone,
    previousDiagram,
  } = options;
  const { llm } = deps;

  // Launch all enabled agents in parallel
  // Note: summary and diagram agents don't get file fetching (they benefit less from deep context)
  const [
    securityFindings, bugFindings, styleFindings,
    errorHandlingFindings, testCoverageFindings, commentAccuracyFindings,
    summary, diagramResult,
  ] = await Promise.all([
    enabledAgents.security
      ? runSecurityAgent(diff, context, modelId, llm, fileFetchOptions, tone)
      : Promise.resolve([]),
    enabledAgents.bugs
      ? runBugAgent(diff, context, modelId, llm, fileFetchOptions, tone)
      : Promise.resolve([]),
    enabledAgents.style
      ? runStyleAgent(diff, context, modelId, llm, customStyleRules, fileFetchOptions, tone)
      : Promise.resolve([]),
    enabledAgents.errorHandling
      ? runErrorHandlingAgent(diff, context, modelId, llm, fileFetchOptions, tone)
      : Promise.resolve([]),
    enabledAgents.testCoverage
      ? runTestCoverageAgent(diff, context, modelId, llm, fileFetchOptions, tone)
      : Promise.resolve([]),
    enabledAgents.commentAccuracy
      ? runCommentAccuracyAgent(diff, context, lightModelId, llm, fileFetchOptions, tone)
      : Promise.resolve([]),
    enabledAgents.summary
      ? runSummaryAgent(diff, context, lightModelId, llm)
      : Promise.resolve(''),
    enabledAgents.diagram
      ? runDiagramAgent(diff, context, lightModelId, llm, previousDiagram)
      : Promise.resolve({ diagram: '', caption: '' } as DiagramResult),
  ]);

  // Run enabled custom agents in parallel
  const enabledCustomAgents = customAgents.filter((a) => a.enabled);
  const customResults = enabledCustomAgents.length > 0
    ? await Promise.all(
        enabledCustomAgents.map((agentDef) =>
          runCustomAgent(agentDef, diff, context, modelId, llm, fileFetchOptions)
            .catch((err) => {
              console.warn(`Custom agent "${agentDef.name}" failed:`, err);
              return [] as AgentFinding[];
            })
        ),
      )
    : [];

  // Tag custom agent findings
  const customTagged: TaggedFindings[] = enabledCustomAgents.map((agentDef, i) => ({
    category: agentDef.name,
    findings: customResults[i] || [],
  }));

  // Orchestrate: deduplicate + rank all findings
  const taggedFindings: TaggedFindings[] = [
    { category: 'security', findings: securityFindings },
    { category: 'bug', findings: bugFindings },
    { category: 'style', findings: styleFindings },
    { category: 'error-handling', findings: errorHandlingFindings },
    { category: 'test-coverage', findings: testCoverageFindings },
    { category: 'comment-accuracy', findings: commentAccuracyFindings },
    ...customTagged,
  ];

  // Count total raw findings before orchestration
  const totalRawFindings = taggedFindings.reduce((sum, t) => sum + (t.findings?.length ?? 0), 0);

  const orchestratorResult = await runOrchestratorAgent(
    taggedFindings,
    lightModelId,
    maxFindings,
    llm,
  );

  // Count enabled finding agents (exclude summary + diagram)
  const findingAgentFlags = [
    enabledAgents.security, enabledAgents.bugs, enabledAgents.style,
    enabledAgents.errorHandling, enabledAgents.testCoverage, enabledAgents.commentAccuracy,
  ];
  const enabledAgentCount = findingAgentFlags.filter(Boolean).length + enabledCustomAgents.length;

  return {
    summary,
    findings: orchestratorResult.findings,
    diagram: diagramResult.diagram,
    diagramCaption: diagramResult.caption,
    mergeScore: orchestratorResult.mergeScore,
    mergeScoreReason: orchestratorResult.mergeScoreReason,
    suppressedCount: Math.max(0, totalRawFindings - orchestratorResult.findings.length),
    enabledAgentCount,
  };
}
