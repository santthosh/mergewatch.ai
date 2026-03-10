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
  ORCHESTRATOR_PROMPT,
} from './prompts.js';

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
  category: 'security' | 'bug' | 'style';
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
 * and optional PR context.
 */
function buildPrompt(systemPrompt: string, diff: string, context: ReviewContext): string {
  const contextBlock = [
    `Repository: ${context.owner}/${context.repo}`,
    `PR #${context.prNumber}`,
    context.prTitle ? `Title: ${context.prTitle}` : '',
    context.prBody ? `Description:\n${context.prBody}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${systemPrompt}\n\n--- PR Context ---\n${contextBlock}\n\n--- Diff ---\n${diff}`;
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

// ─── Individual agents ─────────────────────────────────────────────────────

/** Run the security review agent. */
export async function runSecurityAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(SECURITY_REVIEWER_PROMPT, diff, context);
  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings;
}

/** Run the bug detection agent. */
export async function runBugAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(BUG_REVIEWER_PROMPT, diff, context);
  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings;
}

/** Run the style / code-quality agent. Accepts optional custom rules. */
export async function runStyleAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
  customRules: string[] = [],
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

  const prompt = buildPrompt(systemPrompt, diff, context);
  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings;
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
): Promise<DiagramResult> {
  const prompt = buildPrompt(DIAGRAM_PROMPT, diff, context);
  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<DiagramResult>(raw, { diagram: '', caption: '' });
  return parsed;
}

/** Run the summary agent that produces a human-readable PR summary. */
export async function runSummaryAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
  llm: ILLMProvider,
): Promise<string> {
  const prompt = buildPrompt(SUMMARY_PROMPT, diff, context);
  const raw = await llm.invoke(modelId, prompt);
  const parsed = safeParseJson<{ summary: string }>(raw, { summary: '' });
  return parsed.summary;
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

interface TaggedFindings {
  category: 'security' | 'bug' | 'style';
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
    findings.map((f) => ({ ...f, category })),
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
    findings: parsed.findings,
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
  };
}

export interface ReviewPipelineResult {
  summary: string;
  findings: OrchestratedFinding[];
  diagram: string;
  diagramCaption: string;
  mergeScore: number;
  mergeScoreReason: string;
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
  } = options;
  const { llm } = deps;

  // Launch all enabled agents in parallel
  const [securityFindings, bugFindings, styleFindings, summary, diagramResult] = await Promise.all([
    enabledAgents.security
      ? runSecurityAgent(diff, context, modelId, llm)
      : Promise.resolve([]),
    enabledAgents.bugs
      ? runBugAgent(diff, context, modelId, llm)
      : Promise.resolve([]),
    enabledAgents.style
      ? runStyleAgent(diff, context, modelId, llm, customStyleRules)
      : Promise.resolve([]),
    enabledAgents.summary
      ? runSummaryAgent(diff, context, lightModelId, llm)
      : Promise.resolve(''),
    enabledAgents.diagram
      ? runDiagramAgent(diff, context, lightModelId, llm)
      : Promise.resolve({ diagram: '', caption: '' } as DiagramResult),
  ]);

  // Orchestrate: deduplicate + rank all findings
  const taggedFindings: TaggedFindings[] = [
    { category: 'security', findings: securityFindings },
    { category: 'bug', findings: bugFindings },
    { category: 'style', findings: styleFindings },
  ];

  const orchestratorResult = await runOrchestratorAgent(
    taggedFindings,
    lightModelId,
    maxFindings,
    llm,
  );

  return {
    summary,
    findings: orchestratorResult.findings,
    diagram: diagramResult.diagram,
    diagramCaption: diagramResult.caption,
    mergeScore: orchestratorResult.mergeScore,
    mergeScoreReason: orchestratorResult.mergeScoreReason,
  };
}
