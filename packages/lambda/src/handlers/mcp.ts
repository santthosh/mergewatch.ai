/**
 * AWS Lambda handler for the MergeWatch MCP server over Function URL.
 *
 * Wire shape: JSON-RPC 2.0 over HTTP POST. Single-request and batch both
 * supported. Authorization: Bearer <mw_sk_live_...> resolves to the caller's
 * installation + scope via the API key store. Tool dispatch, schemas, and
 * error envelopes live in @mergewatch/mcp/http-dispatcher — this handler is
 * a thin HTTP adapter.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  AuthError,
  dispatchMcpBatch,
  dispatchMcpRequest,
  resolveApiKey,
  type AuthResolution,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpServerDeps,
} from '@mergewatch/mcp';
import {
  DynamoApiKeyStore,
  DynamoInstallationStore,
  DynamoMcpSessionStore,
  DynamoReviewStore,
} from '@mergewatch/storage-dynamo';
import { BedrockLLMProvider } from '@mergewatch/llm-bedrock';
import { billingCheck, getStripe, isSaas, recordReview } from '@mergewatch/billing';
import { SSMGitHubAuthProvider } from '../github-auth-ssm.js';

// -- Singletons (re-used across warm invocations) ----------------------------

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const INSTALLATIONS_TABLE = process.env.INSTALLATIONS_TABLE ?? 'mergewatch-installations';
const REVIEWS_TABLE = process.env.REVIEWS_TABLE ?? 'mergewatch-reviews';
const API_KEYS_TABLE = process.env.API_KEYS_TABLE ?? 'mergewatch-api-keys';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE ?? 'mergewatch-sessions';

const installationStore = new DynamoInstallationStore(dynamodb, INSTALLATIONS_TABLE);
const reviewStore = new DynamoReviewStore(dynamodb, REVIEWS_TABLE);
const apiKeyStore = new DynamoApiKeyStore(dynamodb, API_KEYS_TABLE);
const sessionStore = new DynamoMcpSessionStore(dynamodb, SESSIONS_TABLE);
const llm = new BedrockLLMProvider();
const authProvider = new SSMGitHubAuthProvider();

// Stripe is optional — resolved lazily on first authenticated request so the
// MCP Function URL doesn't pay SSM cost on health pings or discovery calls.
let cachedStripe: Awaited<ReturnType<typeof getStripe>> | undefined;
async function stripeClient() {
  if (!isSaas()) return undefined;
  if (!cachedStripe) cachedStripe = await getStripe();
  return cachedStripe;
}

async function buildDeps(): Promise<McpServerDeps> {
  return {
    llm,
    authProvider,
    installationStore,
    reviewStore,
    apiKeyStore,
    sessionStore,
    billing: { check: billingCheck, record: recordReview },
    ddbClient: dynamodb,
    installationsTable: INSTALLATIONS_TABLE,
    stripe: await stripeClient(),
  };
}

// -- HTTP helpers -----------------------------------------------------------

function httpJson(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function httpEmpty(statusCode: number): APIGatewayProxyResultV2 {
  return { statusCode };
}

function findAuthHeader(headers: APIGatewayProxyEventV2['headers']): string | undefined {
  if (!headers) return undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') return v;
  }
  return undefined;
}

async function resolveBearer(
  headers: APIGatewayProxyEventV2['headers'],
): Promise<{ ok: true; auth: AuthResolution } | { ok: false; status: 401 | 403; error: string }> {
  const header = findAuthHeader(headers);
  if (!header) return { ok: false as const, status: 401, error: 'Missing Authorization header' };
  try {
    const auth = await resolveApiKey(header, apiKeyStore);
    return { ok: true as const, auth };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false as const, status: err.code === 'revoked' ? 403 : 401, error: err.message };
    }
    throw err;
  }
}

function parseBody(raw: string | undefined): unknown {
  if (!raw) return null;
  return JSON.parse(raw);
}

// -- Handler ----------------------------------------------------------------

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'POST';
  if (method === 'OPTIONS') {
    // CORS preflight — Function URL CORS config actually answers this, but
    // keep an explicit 204 fallback in case a caller lands here anyway.
    return httpEmpty(204);
  }
  if (method === 'GET') {
    return httpJson(200, { name: 'mergewatch', transport: 'mcp/http', status: 'ok' });
  }
  if (method !== 'POST') {
    return httpJson(405, { error: `Method ${method} not allowed` });
  }

  let body: unknown;
  try {
    body = parseBody(event.body);
  } catch {
    return httpJson(400, { error: 'Invalid JSON body' });
  }

  // Only require bearer when the client is actually calling an authenticated
  // method. Discovery (initialize, ping, tools/list, resources/list) works
  // without auth so MCP clients can negotiate before presenting a key.
  const needsAuth = requestsNeedAuth(body);
  let auth: AuthResolution | null = null;
  if (needsAuth) {
    const resolved = await resolveBearer(event.headers);
    if (!resolved.ok) return httpJson(resolved.status, { error: resolved.error });
    auth = resolved.auth;
  }

  const deps = await buildDeps();

  if (Array.isArray(body)) {
    const requests = body as JsonRpcRequest[];
    const responses = await dispatchMcpBatch(requests, deps, auth);
    if (responses === null) return httpEmpty(204);
    return httpJson(200, responses);
  }

  const response = await dispatchMcpRequest(body as JsonRpcRequest, deps, auth);
  if (response === null) return httpEmpty(204);
  return httpJson(200, response);
}

/**
 * True when any request in the payload calls an authenticated method.
 * Keeps discovery-only requests from paying the apiKeyStore round-trip.
 */
function requestsNeedAuth(body: unknown): boolean {
  const AUTHENTICATED_METHODS = new Set(['tools/call', 'resources/read']);
  const check = (req: unknown): boolean => {
    if (!req || typeof req !== 'object') return false;
    const method = (req as { method?: unknown }).method;
    return typeof method === 'string' && AUTHENTICATED_METHODS.has(method);
  };
  if (Array.isArray(body)) return body.some(check);
  return check(body);
}

// Exported for tests — do not import from call sites.
export const _internal = { resolveBearer, buildDeps, requestsNeedAuth };

// Suppress "unused" warnings for values exported purely for SAM / IAM context.
export type { JsonRpcResponse };
