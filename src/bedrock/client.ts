/**
 * AWS Bedrock client for MergeWatch.
 *
 * Authentication: Uses the default credential provider chain which resolves
 * credentials automatically from (in order):
 *   1. Environment variables (AWS_ACCESS_KEY_ID, etc.)
 *   2. SSO / shared credentials file (~/.aws/credentials)
 *   3. ECS container credentials
 *   4. EC2/Lambda instance profile (IMDS)
 *
 * This means NO explicit API keys are required — in Lambda the execution role
 * attached to the function provides credentials automatically via instance profile.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

// ─── Supported model IDs ───────────────────────────────────────────────────
export const SUPPORTED_MODELS = {
  'claude-sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'claude-haiku-4.5': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'claude-3.5-sonnet': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  'amazon-titan-text': 'amazon.titan-text-express-v1',
} as const;

export type ModelAlias = keyof typeof SUPPORTED_MODELS;

// ─── Client singleton ──────────────────────────────────────────────────────
// Region is read from AWS_REGION env var (set automatically in Lambda).
let clientInstance: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!clientInstance) {
    clientInstance = new BedrockRuntimeClient({
      // No explicit credentials — uses the default credential provider chain.
      // In Lambda this resolves to the function's execution role via instance profile.
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return clientInstance;
}

// ─── Request body builders per model family ────────────────────────────────
// Different model families expect different request payload shapes.

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
  // Anthropic Messages API returns content as an array of blocks.
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

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Invoke a Bedrock model synchronously and return the full response text.
 *
 * @param modelId  - Full Bedrock model ID (e.g. from SUPPORTED_MODELS).
 * @param prompt   - The prompt string (system + user content combined).
 * @param maxTokens - Maximum tokens to generate (default 4096).
 */
export async function invokeModel(
  modelId: string,
  prompt: string,
  maxTokens = 4096,
): Promise<string> {
  const client = getClient();
  const { body, contentType, accept } = buildRequestBody(modelId, prompt, maxTokens);

  const command = new InvokeModelCommand({
    modelId,
    body: new TextEncoder().encode(body),
    contentType,
    accept,
  });

  const response = await client.send(command);
  const rawResponse = new TextDecoder().decode(response.body);
  return parseResponse(modelId, rawResponse);
}

/**
 * Invoke a Bedrock model with streaming and yield response chunks as they arrive.
 * Useful for long-running reviews where you want incremental progress.
 *
 * @param modelId - Full Bedrock model ID.
 * @param prompt  - The prompt string.
 */
export async function* invokeModelStream(
  modelId: string,
  prompt: string,
): AsyncGenerator<string, void, unknown> {
  const client = getClient();
  const { body, contentType, accept } = buildRequestBody(modelId, prompt, 4096);

  const command = new InvokeModelWithResponseStreamCommand({
    modelId,
    body: new TextEncoder().encode(body),
    contentType,
    accept,
  });

  const response = await client.send(command);

  if (!response.body) {
    return;
  }

  for await (const event of response.body) {
    if (event.chunk?.bytes) {
      const chunkText = new TextDecoder().decode(event.chunk.bytes);
      try {
        const parsed = JSON.parse(chunkText);
        // Anthropic streaming chunks have a delta.text field.
        if (parsed.delta?.text) {
          yield parsed.delta.text;
        }
        // Titan streaming chunks have outputText.
        if (parsed.outputText) {
          yield parsed.outputText;
        }
      } catch {
        // If chunk isn't valid JSON, yield raw text.
        yield chunkText;
      }
    }
  }
}
