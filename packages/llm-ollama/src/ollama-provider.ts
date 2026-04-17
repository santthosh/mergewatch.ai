import type { ILLMProvider, LLMInvokeResult } from '@mergewatch/core';

export class OllamaLLMProvider implements ILLMProvider {
  constructor(private baseUrl: string = 'http://localhost:11434') {}

  async invoke(modelId: string, prompt: string, maxTokens = 4096): Promise<LLMInvokeResult> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        stream: false,
        options: { num_predict: maxTokens, temperature: 0 },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${body}`);
    }

    const data = await response.json() as any;
    const text = data.message.content;
    const usage = (data.prompt_eval_count != null || data.eval_count != null)
      ? { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 }
      : undefined;
    return { text, usage };
  }
}
