/**
 * Multi-agent review pipeline.
 *
 * Each specialised agent receives the PR diff + context and returns structured
 * findings. The orchestrator then deduplicates, ranks, and formats them.
 *
 * All independent agents run in parallel via Promise.all() for speed.
 */

import { invokeModel } from '../bedrock/client';
import {
  SECURITY_REVIEWER_PROMPT,
  BUG_REVIEWER_PROMPT,
  STYLE_REVIEWER_PROMPT,
  SUMMARY_PROMPT,
  ORCHESTRATOR_PROMPT,
} from './prompts';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentFinding {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'info';
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
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.error('Failed to parse agent JSON response:', cleaned.slice(0, 200));
    return fallback;
  }
}

// ─── Individual agents ─────────────────────────────────────────────────────

/** Run the security review agent. */
export async function runSecurityAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(SECURITY_REVIEWER_PROMPT, diff, context);
  const raw = await invokeModel(modelId, prompt);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings;
}

/** Run the bug detection agent. */
export async function runBugAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
): Promise<AgentFinding[]> {
  const prompt = buildPrompt(BUG_REVIEWER_PROMPT, diff, context);
  const raw = await invokeModel(modelId, prompt);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings;
}

/** Run the style / code-quality agent. Accepts optional custom rules. */
export async function runStyleAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
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
  const raw = await invokeModel(modelId, prompt);
  const parsed = safeParseJson<{ findings: AgentFinding[] }>(raw, { findings: [] });
  return parsed.findings;
}

/** Run the summary agent that produces a human-readable PR summary. */
export async function runSummaryAgent(
  diff: string,
  context: ReviewContext,
  modelId: string,
): Promise<string> {
  const prompt = buildPrompt(SUMMARY_PROMPT, diff, context);
  const raw = await invokeModel(modelId, prompt);
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
export async function runOrchestratorAgent(
  taggedFindings: TaggedFindings[],
  modelId: string,
  maxFindings: number,
): Promise<OrchestratedFinding[]> {
  // Build a combined findings list with category tags for the orchestrator
  const allFindings = taggedFindings.flatMap(({ category, findings }) =>
    findings.map((f) => ({ ...f, category })),
  );

  // If there are no findings, skip the orchestrator entirely
  if (allFindings.length === 0) {
    return [];
  }

  const prompt = ORCHESTRATOR_PROMPT
    .replace('MAX_FINDINGS_PLACEHOLDER', String(maxFindings))
    + `\n\n--- Findings from all agents ---\n${JSON.stringify(allFindings, null, 2)}`;

  const raw = await invokeModel(modelId, prompt);
  const parsed = safeParseJson<{ findings: OrchestratedFinding[] }>(raw, { findings: [] });
  return parsed.findings;
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
  };
}

export interface ReviewPipelineResult {
  summary: string;
  findings: OrchestratedFinding[];
}

/**
 * Execute the full multi-agent review pipeline.
 * All independent agents run in parallel; the orchestrator runs after they complete.
 */
export async function runReviewPipeline(
  options: ReviewPipelineOptions,
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

  // Launch all enabled agents in parallel
  const [securityFindings, bugFindings, styleFindings, summary] = await Promise.all([
    enabledAgents.security
      ? runSecurityAgent(diff, context, modelId)
      : Promise.resolve([]),
    enabledAgents.bugs
      ? runBugAgent(diff, context, modelId)
      : Promise.resolve([]),
    enabledAgents.style
      ? runStyleAgent(diff, context, modelId, customStyleRules)
      : Promise.resolve([]),
    enabledAgents.summary
      ? runSummaryAgent(diff, context, lightModelId)
      : Promise.resolve(''),
  ]);

  // Orchestrate: deduplicate + rank all findings
  const taggedFindings: TaggedFindings[] = [
    { category: 'security', findings: securityFindings },
    { category: 'bug', findings: bugFindings },
    { category: 'style', findings: styleFindings },
  ];

  const orchestratedFindings = await runOrchestratorAgent(
    taggedFindings,
    lightModelId,
    maxFindings,
  );

  return { summary, findings: orchestratedFindings };
}
