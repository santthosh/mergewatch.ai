import { describe, it, expect } from 'vitest';
import { normalizeLLMResult } from './types.js';

describe('normalizeLLMResult', () => {
  it('string input returns { text: string }', () => {
    const result = normalizeLLMResult('hello world');
    expect(result).toEqual({ text: 'hello world' });
  });

  it('LLMInvokeResult with usage returns as-is', () => {
    const input = { text: 'hi', usage: { inputTokens: 10, outputTokens: 5 } };
    const result = normalizeLLMResult(input);
    expect(result).toBe(input);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('LLMInvokeResult without usage returns as-is', () => {
    const input = { text: 'no usage' };
    const result = normalizeLLMResult(input);
    expect(result).toBe(input);
    expect(result.usage).toBeUndefined();
  });
});
