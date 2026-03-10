/**
 * Amazon Bedrock implementation of ILLMProvider.
 *
 * Wraps the existing Bedrock client logic (model-family detection,
 * Anthropic vs Titan request building) behind the ILLMProvider interface.
 *
 * Authentication: Uses the default credential provider chain which resolves
 * credentials automatically from (in order):
 *   1. Environment variables (AWS_ACCESS_KEY_ID, etc.)
 *   2. SSO / shared credentials file (~/.aws/credentials)
 *   3. ECS container credentials
 *   4. EC2/Lambda instance profile (IMDS)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { ILLMProvider } from '@mergewatch/core';

// ─── Supported model IDs ───────────────────────────────────────────────────
export const SUPPORTED_MODELS = {
  'claude-sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'claude-haiku-4.5': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'claude-3.5-sonnet': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  'amazon-titan-text': 'amazon.titan-text-express-v1',
} as const;

export type ModelAlias = keyof typeof SUPPORTED_MODELS;

// ─── Request body builders per model family ────────────────────────────────

interface ModelRequestBody {
  body: string;
  contentType: string;
  accept: string;
}

function buildAnthropicBody(prompt: string, maxTokens: number): ModelRequestBody {
  return {
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    contentType: 'application/json',
    accept: 'application/json',
  };
}

function buildTitanBody(prompt: string, maxTokens: number): ModelRequestBody {
  return {
    body: JSON.stringify({
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: maxTokens,
        temperature: 0.2,
        topP: 0.9,
      },
    }),
    contentType: 'application/json',
    accept: 'application/json',
  };
}

function isAnthropicModel(modelId: string): boolean {
  return modelId.includes('anthropic.');
}

function isTitanModel(modelId: string): boolean {
  return modelId.includes('amazon.titan');
}

function buildRequestBody(modelId: string, prompt: string, maxTokens: number): ModelRequestBody {
  if (isAnthropicModel(modelId)) {
    return buildAnthropicBody(prompt, maxTokens);
  }
  if (isTitanModel(modelId)) {
    return buildTitanBody(prompt, maxTokens);
  }
  return buildAnthropicBody(prompt, maxTokens);
}

// ─── Response parsers per model family ─────────────────────────────────────

function parseAnthropicResponse(raw: string): string {
  const parsed = JSON.parse(raw);
  return parsed.content?.[0]?.text ?? '';
}

function parseTitanResponse(raw: string): string {
  const parsed = JSON.parse(raw);
  return parsed.results?.[0]?.outputText ?? '';
}

function parseResponse(modelId: string, raw: string): string {
  if (isAnthropicModel(modelId)) return parseAnthropicResponse(raw);
  if (isTitanModel(modelId)) return parseTitanResponse(raw);
  return parseAnthropicResponse(raw);
}

// ─── Provider class ────────────────────────────────────────────────────────

export class BedrockLLMProvider implements ILLMProvider {
  private client: BedrockRuntimeClient;

  constructor(region?: string) {
    this.client = new BedrockRuntimeClient({
      region: region ?? process.env.AWS_REGION ?? 'us-east-1',
    });
  }

  async invoke(modelId: string, prompt: string, maxTokens = 4096): Promise<string> {
    const { body, contentType, accept } = buildRequestBody(modelId, prompt, maxTokens);

    const command = new InvokeModelCommand({
      modelId,
      body: new TextEncoder().encode(body),
      contentType,
      accept,
    });

    const response = await this.client.send(command);
    const rawResponse = new TextDecoder().decode(response.body);
    return parseResponse(modelId, rawResponse);
  }
}
