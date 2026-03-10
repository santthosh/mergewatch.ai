import type { ILLMProvider } from '@mergewatch/core';

export class LiteLLMProvider implements ILLMProvider {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  async invoke(modelId: string, prompt: string, maxTokens = 4096): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LiteLLM request failed (${response.status}): ${body}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }
}
