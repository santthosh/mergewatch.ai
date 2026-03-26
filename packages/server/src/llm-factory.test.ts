import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock all provider modules before importing the factory.
// Use class syntax so `new Provider(...)` works correctly.
vi.mock('@mergewatch/llm-anthropic', () => {
  const AnthropicLLMProvider = vi.fn(function () { return { invoke: vi.fn() }; });
  return { AnthropicLLMProvider };
});

vi.mock('@mergewatch/llm-bedrock', () => {
  const BedrockLLMProvider = vi.fn(function () { return { invoke: vi.fn() }; });
  return { BedrockLLMProvider };
});

vi.mock('@mergewatch/llm-litellm', () => {
  const LiteLLMProvider = vi.fn(function () { return { invoke: vi.fn() }; });
  return { LiteLLMProvider };
});

vi.mock('@mergewatch/llm-ollama', () => {
  const OllamaLLMProvider = vi.fn(function () { return { invoke: vi.fn() }; });
  return { OllamaLLMProvider };
});

import { createLLMProvider } from './llm-factory.js';
import { AnthropicLLMProvider } from '@mergewatch/llm-anthropic';
import { BedrockLLMProvider } from '@mergewatch/llm-bedrock';
import { LiteLLMProvider } from '@mergewatch/llm-litellm';
import { OllamaLLMProvider } from '@mergewatch/llm-ollama';

describe('createLLMProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('creates AnthropicLLMProvider when LLM_PROVIDER=anthropic with ANTHROPIC_API_KEY', () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-key');

    const provider = createLLMProvider();

    expect(provider).toBeDefined();
    expect(AnthropicLLMProvider).toHaveBeenCalledWith('sk-test-key');
  });

  it('throws when LLM_PROVIDER=anthropic without ANTHROPIC_API_KEY', () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    expect(() => createLLMProvider()).toThrow('ANTHROPIC_API_KEY is required');
  });

  it('creates BedrockLLMProvider when LLM_PROVIDER=bedrock', () => {
    vi.stubEnv('LLM_PROVIDER', 'bedrock');
    vi.stubEnv('AWS_REGION', 'us-west-2');

    const provider = createLLMProvider();

    expect(provider).toBeDefined();
    expect(BedrockLLMProvider).toHaveBeenCalledWith('us-west-2');
  });

  it('creates LiteLLMProvider when LLM_PROVIDER=litellm with LITELLM_BASE_URL', () => {
    vi.stubEnv('LLM_PROVIDER', 'litellm');
    vi.stubEnv('LITELLM_BASE_URL', 'http://localhost:4000');

    const provider = createLLMProvider();

    expect(provider).toBeDefined();
    expect(LiteLLMProvider).toHaveBeenCalledWith('http://localhost:4000', undefined);
  });

  it('throws when LLM_PROVIDER=litellm without LITELLM_BASE_URL', () => {
    vi.stubEnv('LLM_PROVIDER', 'litellm');
    vi.stubEnv('LITELLM_BASE_URL', '');

    expect(() => createLLMProvider()).toThrow('LITELLM_BASE_URL is required');
  });

  it('creates OllamaLLMProvider when LLM_PROVIDER=ollama', () => {
    vi.stubEnv('LLM_PROVIDER', 'ollama');

    const provider = createLLMProvider();

    expect(provider).toBeDefined();
    expect(OllamaLLMProvider).toHaveBeenCalledWith('http://localhost:11434');
  });

  it('throws for unknown LLM_PROVIDER with helpful message', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');

    expect(() => createLLMProvider()).toThrow('Unknown LLM_PROVIDER: openai');
  });
});
