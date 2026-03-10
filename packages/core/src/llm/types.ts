/**
 * Provider-agnostic LLM interface.
 *
 * Implementations:
 *   - BedrockLLMProvider (packages/llm-bedrock)
 *   - Future: AnthropicLLMProvider, LiteLLMProvider, OllamaProvider
 */
export interface ILLMProvider {
  invoke(modelId: string, prompt: string, maxTokens?: number): Promise<string>;
}
