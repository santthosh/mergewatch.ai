import Anthropic from '@anthropic-ai/sdk';
import type { ILLMProvider } from '@mergewatch/core';

export class AnthropicLLMProvider implements ILLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async invoke(modelId: string, prompt: string, maxTokens = 4096): Promise<string> {
    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error(`Unexpected response type: ${block.type}`);
    }
    return block.text;
  }
}
