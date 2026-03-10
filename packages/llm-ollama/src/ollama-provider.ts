import type { ILLMProvider } from '@mergewatch/core';

export class OllamaLLMProvider implements ILLMProvider {
  constructor(private baseUrl: string = 'http://localhost:11434') {}

  async invoke(modelId: string, prompt: string, maxTokens = 4096): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        stream: false,
        options: { num_predict: maxTokens },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${body}`);
    }

    const data = await response.json() as any;
    return data.message.content;
  }
}
