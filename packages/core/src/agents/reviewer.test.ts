import { describe, it, expect, vi } from 'vitest';
import type { ILLMProvider } from '../llm/types.js';
import type { CustomAgentDef } from '../config/defaults.js';
import {
  isValidMermaidDiagram,
  runSecurityAgent,
  runBugAgent,
  runStyleAgent,
  runSummaryAgent,
  runDiagramAgent,
  runErrorHandlingAgent,
  runTestCoverageAgent,
  runCommentAccuracyAgent,
  runCustomAgent,
  runOrchestratorAgent,
  runReviewPipeline,
  type ReviewContext,
  type AgentFinding,
  type ReviewPipelineOptions,
} from './reviewer.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockLLM(responses: string[]): ILLMProvider & { calls: { modelId: string; prompt: string }[] } {
  let idx = 0;
  const calls: { modelId: string; prompt: string }[] = [];
  return {
    calls,
    async invoke(modelId: string, prompt: string, _maxTokens?: number) {
      calls.push({ modelId, prompt });
      return responses[idx++] ?? responses[responses.length - 1];
    },
  };
}

const sampleContext: ReviewContext = {
  owner: 'test-owner',
  repo: 'test-repo',
  prNumber: 1,
  prTitle: 'Test PR',
  prBody: 'A test pull request',
};

const sampleDiff = `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,5 @@
+import { bar } from './bar';
 export function foo() {
-  return 1;
+  return bar();
 }`;

function validFindingsJson(findings: Partial<AgentFinding>[] = []): string {
  const full = findings.map((f) => ({
    file: 'foo.ts',
    line: 3,
    severity: 'warning',
    confidence: 85,
    title: 'Test finding',
    description: 'A test finding.',
    suggestion: 'Fix it.',
    ...f,
  }));
  return JSON.stringify({ findings: full });
}

// ─── isValidMermaidDiagram ──────────────────────────────────────────────────

describe('isValidMermaidDiagram', () => {
  it('returns true for flowchart TD', () => {
    expect(isValidMermaidDiagram('flowchart TD\n  A-->B')).toBe(true);
  });

  it('returns true for sequenceDiagram', () => {
    expect(isValidMermaidDiagram('sequenceDiagram\n  A->>B: hello')).toBe(true);
  });

  it('returns true for graph LR', () => {
    expect(isValidMermaidDiagram('graph LR\n  A-->B')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidMermaidDiagram('')).toBe(false);
  });

  it('returns false for regular prose', () => {
    expect(isValidMermaidDiagram('This is just some text describing the changes.')).toBe(false);
  });

  it('returns false for JSON string', () => {
    expect(isValidMermaidDiagram('{"findings": []}')).toBe(false);
  });

  it('returns true when preceded by mermaid comment', () => {
    expect(isValidMermaidDiagram('%% caption\nflowchart TD\n  A-->B')).toBe(true);
  });
});

// ─── runSecurityAgent ───────────────────────────────────────────────────────

describe('runSecurityAgent', () => {
  it('returns parsed findings from valid JSON', async () => {
    const response = validFindingsJson([
      { title: 'SQL Injection', severity: 'critical' },
    ]);
    const llm = createMockLLM([response]);
    const findings = await runSecurityAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('SQL Injection');
    expect(findings[0].severity).toBe('critical');
  });

  it('returns empty array when no findings', async () => {
    const llm = createMockLLM([JSON.stringify({ findings: [] })]);
    const findings = await runSecurityAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toEqual([]);
  });

  it('returns empty array on garbage text (graceful fallback)', async () => {
    const llm = createMockLLM(['This is not JSON at all, just some random text.']);
    const findings = await runSecurityAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toEqual([]);
  });

  it('parses markdown-fenced JSON correctly', async () => {
    const response = '```json\n' + validFindingsJson([{ title: 'XSS' }]) + '\n```';
    const llm = createMockLLM([response]);
    const findings = await runSecurityAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('XSS');
  });
});

// ─── runBugAgent ────────────────────────────────────────────────────────────

describe('runBugAgent', () => {
  it('returns parsed findings from valid JSON', async () => {
    const response = validFindingsJson([
      { title: 'Null dereference', severity: 'warning' },
    ]);
    const llm = createMockLLM([response]);
    const findings = await runBugAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Null dereference');
  });
});

// ─── runStyleAgent ──────────────────────────────────────────────────────────

describe('runStyleAgent', () => {
  it('injects custom rules into prompt', async () => {
    const llm = createMockLLM([JSON.stringify({ findings: [] })]);
    await runStyleAgent(sampleDiff, sampleContext, 'model-1', llm, ['Use camelCase', 'No magic numbers']);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].prompt).toContain('Use camelCase');
    expect(llm.calls[0].prompt).toContain('No magic numbers');
  });

  it('strips placeholder when no custom rules', async () => {
    const llm = createMockLLM([JSON.stringify({ findings: [] })]);
    await runStyleAgent(sampleDiff, sampleContext, 'model-1', llm, []);
    expect(llm.calls[0].prompt).not.toContain('CUSTOM_RULES_PLACEHOLDER');
  });
});

// ─── runSummaryAgent ────────────────────────────────────────────────────────

describe('runSummaryAgent', () => {
  it('returns summary string from LLM', async () => {
    const llm = createMockLLM([JSON.stringify({ summary: 'This PR refactors the foo module.' })]);
    const summary = await runSummaryAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(summary).toBe('This PR refactors the foo module.');
  });

  it('returns empty string on invalid response', async () => {
    const llm = createMockLLM(['not json']);
    const summary = await runSummaryAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(summary).toBe('');
  });
});

// ─── runDiagramAgent ────────────────────────────────────────────────────────

describe('runDiagramAgent', () => {
  it('returns DiagramResult for valid mermaid', async () => {
    const mermaid = '%% Auth flow\nsequenceDiagram\n  Client->>API: request\n  API->>Auth: validate';
    const llm = createMockLLM([mermaid]);
    const result = await runDiagramAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(result.diagram).toContain('sequenceDiagram');
    expect(result.caption).toBe('Auth flow');
  });

  it('returns empty diagram for prose response', async () => {
    const llm = createMockLLM(['This change is too trivial to diagram.']);
    const result = await runDiagramAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(result.diagram).toBe('');
    expect(result.caption).toBe('');
  });

  it('strips markdown code fences from mermaid', async () => {
    const mermaid = '```mermaid\n%% Flow\nflowchart TD\n  A-->B\n```';
    const llm = createMockLLM([mermaid]);
    const result = await runDiagramAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(result.diagram).toContain('flowchart TD');
    expect(result.diagram).not.toContain('```');
  });
});

// ─── runErrorHandlingAgent ──────────────────────────────────────────────────

describe('runErrorHandlingAgent', () => {
  it('returns parsed findings from valid JSON', async () => {
    const response = validFindingsJson([{ title: 'Empty catch block', severity: 'warning' }]);
    const llm = createMockLLM([response]);
    const findings = await runErrorHandlingAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Empty catch block');
  });
});

// ─── runTestCoverageAgent ───────────────────────────────────────────────────

describe('runTestCoverageAgent', () => {
  it('returns parsed findings from valid JSON', async () => {
    const response = validFindingsJson([{ title: 'Missing test for foo()', severity: 'info' }]);
    const llm = createMockLLM([response]);
    const findings = await runTestCoverageAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Missing test for foo()');
  });
});

// ─── runCommentAccuracyAgent ────────────────────────────────────────────────

describe('runCommentAccuracyAgent', () => {
  it('returns parsed findings from valid JSON', async () => {
    const response = validFindingsJson([{ title: 'Outdated JSDoc', severity: 'info' }]);
    const llm = createMockLLM([response]);
    const findings = await runCommentAccuracyAgent(sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Outdated JSDoc');
  });
});

// ─── runCustomAgent ─────────────────────────────────────────────────────────

describe('runCustomAgent', () => {
  it('applies severityDefault from agent definition', async () => {
    const agentDef: CustomAgentDef = {
      name: 'perf-agent',
      prompt: 'Check for performance issues.',
      severityDefault: 'info',
      enabled: true,
    };
    // Return a finding without severity to test the default application
    const response = JSON.stringify({
      findings: [
        { file: 'foo.ts', line: 1, severity: '', title: 'Slow loop', description: 'N+1', suggestion: 'Batch.' },
      ],
    });
    const llm = createMockLLM([response]);
    const findings = await runCustomAgent(agentDef, sampleDiff, sampleContext, 'model-1', llm);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
  });
});

// ─── runOrchestratorAgent ───────────────────────────────────────────────────

describe('runOrchestratorAgent', () => {
  it('returns high score and empty findings for empty input (skips LLM)', async () => {
    const llm = createMockLLM(['should not be called']);
    const result = await runOrchestratorAgent([], 'model-1', 25, llm);
    expect(result.findings).toEqual([]);
    expect(result.mergeScore).toBe(5);
    expect(llm.calls).toHaveLength(0);
  });

  it('parses orchestrator JSON correctly with findings', async () => {
    const orchestratorResponse = JSON.stringify({
      findings: [
        {
          file: 'foo.ts', line: 3, severity: 'warning', confidence: 85,
          category: 'bug', title: 'Null ref', description: 'Possible null.', suggestion: 'Add check.',
        },
      ],
      mergeScore: 3,
      mergeScoreReason: 'Warnings present.',
    });
    const llm = createMockLLM([orchestratorResponse]);
    const result = await runOrchestratorAgent(
      [{ category: 'bug', findings: [{ file: 'foo.ts', line: 3, severity: 'warning', confidence: 85, title: 'Null ref', description: 'Possible null.', suggestion: 'Add check.' }] }],
      'model-1',
      25,
      llm,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.mergeScore).toBe(3);
    expect(result.mergeScoreReason).toBe('Warnings present.');
  });

  it('clamps mergeScore to 1-5 range', async () => {
    const responseTooHigh = JSON.stringify({ findings: [], mergeScore: 10, mergeScoreReason: 'way too high' });
    const llm1 = createMockLLM([responseTooHigh]);
    const result1 = await runOrchestratorAgent(
      [{ category: 'bug', findings: [{ file: 'a.ts', line: 1, severity: 'info', title: 't', description: 'd', suggestion: 's' }] }],
      'model-1', 25, llm1,
    );
    expect(result1.mergeScore).toBeLessThanOrEqual(5);

    const responseTooLow = JSON.stringify({ findings: [], mergeScore: -2, mergeScoreReason: 'way too low' });
    const llm2 = createMockLLM([responseTooLow]);
    const result2 = await runOrchestratorAgent(
      [{ category: 'bug', findings: [{ file: 'a.ts', line: 1, severity: 'info', title: 't', description: 'd', suggestion: 's' }] }],
      'model-1', 25, llm2,
    );
    expect(result2.mergeScore).toBeGreaterThanOrEqual(1);
  });
});

// ─── runReviewPipeline ──────────────────────────────────────────────────────

describe('runReviewPipeline', () => {
  const allAgentsEnabled: ReviewPipelineOptions['enabledAgents'] = {
    security: true,
    bugs: true,
    style: true,
    summary: true,
    diagram: true,
    errorHandling: true,
    testCoverage: true,
    commentAccuracy: true,
  };

  // When all agents are enabled we need responses for:
  // 1. security, 2. bug, 3. style, 4. errorHandling, 5. testCoverage,
  // 6. commentAccuracy, 7. summary, 8. diagram, 9. orchestrator
  function makeResponses(count: number): string[] {
    const agentResponse = JSON.stringify({ findings: [] });
    const summaryResponse = JSON.stringify({ summary: 'Clean PR.' });
    const diagramResponse = '%% overview\nflowchart TD\n  A-->B';
    const orchestratorResponse = JSON.stringify({
      findings: [],
      mergeScore: 5,
      mergeScoreReason: 'No issues.',
    });
    // 6 finding agents + summary + diagram + orchestrator
    const responses: string[] = [];
    for (let i = 0; i < 6; i++) responses.push(agentResponse);
    responses.push(summaryResponse);
    responses.push(diagramResponse);
    responses.push(orchestratorResponse);
    return responses;
  }

  it('calls LLM for all enabled agents plus orchestrator', async () => {
    // With all agents enabled and no findings, the orchestrator is skipped (0 findings).
    // So we expect 8 LLM calls: 6 finding agents + summary + diagram
    const agentResponse = JSON.stringify({ findings: [] });
    const summaryResponse = JSON.stringify({ summary: 'Clean PR.' });
    const diagramResponse = '%% overview\nflowchart TD\n  A-->B';
    const responses = [
      agentResponse, agentResponse, agentResponse, // security, bug, style
      agentResponse, agentResponse, agentResponse, // errorHandling, testCoverage, commentAccuracy
      summaryResponse, diagramResponse,             // summary, diagram
    ];
    const llm = createMockLLM(responses);
    const result = await runReviewPipeline(
      {
        diff: sampleDiff,
        context: sampleContext,
        modelId: 'heavy-model',
        lightModelId: 'light-model',
        maxFindings: 25,
        enabledAgents: allAgentsEnabled,
      },
      { llm },
    );
    // 8 total calls (orchestrator skipped because all findings are empty)
    expect(llm.calls.length).toBe(8);
    expect(result.summary).toBe('Clean PR.');
    expect(result.mergeScore).toBe(5);
    expect(result.enabledAgentCount).toBe(6);
  });

  it('skips disabled agents', async () => {
    const agentResponse = JSON.stringify({ findings: [] });
    const summaryResponse = JSON.stringify({ summary: 'Partial review.' });
    const diagramResponse = '';
    // Only bugs + summary enabled = 2 LLM calls (orchestrator skipped on empty findings)
    const responses = [agentResponse, summaryResponse, diagramResponse];
    const llm = createMockLLM(responses);
    const result = await runReviewPipeline(
      {
        diff: sampleDiff,
        context: sampleContext,
        modelId: 'heavy-model',
        lightModelId: 'light-model',
        maxFindings: 25,
        enabledAgents: {
          security: false,
          bugs: true,
          style: false,
          summary: true,
          diagram: false,
          errorHandling: false,
          testCoverage: false,
          commentAccuracy: false,
        },
      },
      { llm },
    );
    // Only bugs + summary = 2 LLM calls
    expect(llm.calls.length).toBe(2);
    expect(result.enabledAgentCount).toBe(1); // only bugs counts as "finding agent"
    // Verify security prompt was NOT sent
    const allPrompts = llm.calls.map((c) => c.prompt).join('\n');
    expect(allPrompts).not.toContain('application security');
  });

  it('result has expected shape with summary, findings, mergeScore, enabledAgentCount, and token fields', async () => {
    const findingResponse = validFindingsJson([{ title: 'Issue A', severity: 'warning' }]);
    const summaryResponse = JSON.stringify({ summary: 'Has warnings.' });
    const diagramResponse = '%% flow\nflowchart TD\n  A-->B';
    const orchestratorResponse = JSON.stringify({
      findings: [
        { file: 'foo.ts', line: 3, severity: 'warning', confidence: 85, category: 'security', title: 'Issue A', description: 'Desc', suggestion: 'Fix' },
      ],
      mergeScore: 3,
      mergeScoreReason: 'Warnings found.',
    });
    const responses = [
      findingResponse,  // security
      JSON.stringify({ findings: [] }), // bug
      JSON.stringify({ findings: [] }), // style
      JSON.stringify({ findings: [] }), // errorHandling
      JSON.stringify({ findings: [] }), // testCoverage
      JSON.stringify({ findings: [] }), // commentAccuracy
      summaryResponse,
      diagramResponse,
      orchestratorResponse,
    ];
    const llm = createMockLLM(responses);
    const result = await runReviewPipeline(
      {
        diff: sampleDiff,
        context: sampleContext,
        modelId: 'heavy-model',
        lightModelId: 'light-model',
        maxFindings: 25,
        enabledAgents: allAgentsEnabled,
      },
      { llm },
    );
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('mergeScore');
    expect(result).toHaveProperty('enabledAgentCount');
    expect(result).toHaveProperty('inputTokens');
    expect(result).toHaveProperty('outputTokens');
    expect(result.summary).toBe('Has warnings.');
    expect(result.mergeScore).toBe(3);
    expect(result.findings).toHaveLength(1);
    // Token counts will be 0 since our mock doesn't return usage info
    expect(typeof result.inputTokens).toBe('number');
    expect(typeof result.outputTokens).toBe('number');
  });
});
