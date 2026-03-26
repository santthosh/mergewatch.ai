import type { ILLMProvider, LLMInvokeResult } from './llm/types.js';

/**
 * Creates a mock LLM provider that returns canned responses in order.
 * Tracks calls for assertion.
 */
export function createMockLLM(responses: (string | LLMInvokeResult)[]): ILLMProvider & { calls: { modelId: string; prompt: string; maxTokens?: number }[] } {
  let idx = 0;
  const calls: { modelId: string; prompt: string; maxTokens?: number }[] = [];
  return {
    calls,
    async invoke(modelId: string, prompt: string, maxTokens?: number) {
      calls.push({ modelId, prompt, maxTokens });
      const response = responses[idx] ?? responses[responses.length - 1];
      idx++;
      return response;
    },
  };
}

/** Sample unified diff for testing */
export function sampleDiff(): string {
  return `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,7 @@
 import express from 'express';
+import { validateInput } from './utils';

 const app = express();
+app.use(validateInput);

 app.listen(3000);`;
}

/** Sample review context */
export function sampleReviewContext() {
  return {
    owner: 'testorg',
    repo: 'testrepo',
    prNumber: 42,
    prTitle: 'Add input validation',
    prBody: 'This PR adds input validation to the Express server.',
  };
}

/** Factory for finding objects */
export function sampleFinding(overrides: Record<string, unknown> = {}) {
  return {
    title: 'SQL injection risk',
    description: 'User input is not sanitized before database query.',
    file: 'src/db.ts',
    line: 15,
    severity: 'critical' as const,
    confidence: 90,
    agent: 'security',
    ...overrides,
  };
}
