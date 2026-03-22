import Anthropic from '@anthropic-ai/sdk';
import type { ILLMProvider, LLMInvokeResult } from '@mergewatch/core';

export class AnthropicLLMProvider implements ILLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async invoke(modelId: string, prompt: string, maxTokens = 4096): Promise<LLMInvokeResult> {
    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error(`Unexpected response type: ${block.type}`);
    }
    return {
      text: block.text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
