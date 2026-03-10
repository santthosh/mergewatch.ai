import type { ILLMProvider } from '@mergewatch/core';
import { AnthropicLLMProvider } from '@mergewatch/llm-anthropic';
import { BedrockLLMProvider } from '@mergewatch/llm-bedrock';
import { LiteLLMProvider } from '@mergewatch/llm-litellm';
import { OllamaLLMProvider } from '@mergewatch/llm-ollama';

export function createLLMProvider(): ILLMProvider {
  const provider = process.env.LLM_PROVIDER || 'anthropic';

  switch (provider) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
      return new AnthropicLLMProvider(apiKey);
    }
    case 'bedrock': {
      return new BedrockLLMProvider(process.env.AWS_REGION);
    }
    case 'litellm': {
      const baseUrl = process.env.LITELLM_BASE_URL;
      if (!baseUrl) throw new Error('LITELLM_BASE_URL is required when LLM_PROVIDER=litellm');
      return new LiteLLMProvider(baseUrl, process.env.LITELLM_API_KEY);
    }
    case 'ollama': {
      return new OllamaLLMProvider(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}. Supported: anthropic, bedrock, litellm, ollama`);
  }
}
