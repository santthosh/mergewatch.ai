import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core',
  'packages/lambda',
  'packages/server',
  'packages/llm-bedrock',
  'packages/llm-anthropic',
  'packages/llm-litellm',
  'packages/llm-ollama',
]);
