/**
 * Provider-agnostic LLM interface.
 *
 * Implementations:
 *   - BedrockLLMProvider (packages/llm-bedrock)
 *   - AnthropicLLMProvider (packages/llm-anthropic)
 *   - LiteLLMProvider (packages/llm-litellm)
 *   - OllamaLLMProvider (packages/llm-ollama)
 */

/** Token usage from a single LLM invocation. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Result from an LLM invocation, optionally including token usage. */
export interface LLMInvokeResult {
  text: string;
  usage?: TokenUsage;
}

export interface ILLMProvider {
  invoke(modelId: string, prompt: string, maxTokens?: number): Promise<string | LLMInvokeResult>;
}

/** Normalize a string or LLMInvokeResult to always get an LLMInvokeResult. */
export function normalizeLLMResult(result: string | LLMInvokeResult): LLMInvokeResult {
  if (typeof result === 'string') {
    return { text: result };
  }
  return result;
}
