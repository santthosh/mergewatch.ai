/**
 * JSON-RPC 2.0 dispatcher for the MCP server over request/response HTTP
 * transports (Lambda Function URL, Express mount). Keeps the wire format in
 * one place so transports are thin adapters — they translate HTTP to/from
 * JsonRpcRequest / JsonRpcResponse and do nothing else.
 */

import {
  handleReviewDiff,
  type ReviewDiffInput,
} from './tools/review-diff.js';
import {
  handleGetReviewStatus,
  type GetReviewStatusInput,
} from './tools/get-review-status.js';
import {
  CONVENTIONS_URI_PREFIX,
  handleConventionsResource,
} from './resources/conventions.js';
import { AuthError, type AuthResolution } from './middleware/auth.js';
import { BillingBlockedError } from './middleware/billing.js';
import type { McpServerDeps } from './server-deps.js';

/** MCP protocol version advertised on initialize. */
export const MCP_PROTOCOL_VERSION = '2025-03-26';

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcErrorResponse;

/** JSON-RPC 2.0 reserved + MergeWatch-specific error codes. */
export const ERROR_CODES = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  UNAUTHORIZED: -32001,
  BILLING_BLOCKED: -32002,
} as const;

const REVIEW_DIFF_TOOL = {
  name: 'review_diff',
  description:
    'Run the full MergeWatch review pipeline on a diff. Marks agentAuthored=true.',
  inputSchema: {
    type: 'object',
    required: ['diff'],
    properties: {
      diff: { type: 'string', description: 'Unified diff to review.' },
      repo: {
        type: 'string',
        description: 'Optional "owner/repo" — loads repo config + conventions.',
      },
      description: {
        type: 'string',
        description: 'Freeform task description; surfaced to agent prompts.',
      },
      sessionId: {
        type: 'string',
        description: 'Optional sessionId for 30-min billing dedup.',
      },
    },
    additionalProperties: false,
  },
} as const;

const GET_REVIEW_STATUS_TOOL = {
  name: 'get_review_status',
  description: 'Return the latest review row for a PR.',
  inputSchema: {
    type: 'object',
    required: ['repo', 'prNumber'],
    properties: {
      repo: { type: 'string', description: 'owner/repo.' },
      prNumber: { type: 'integer', minimum: 1, description: 'Pull request number.' },
    },
    additionalProperties: false,
  },
} as const;

const TOOL_DEFS = [REVIEW_DIFF_TOOL, GET_REVIEW_STATUS_TOOL];

const RESOURCE_DEFS = [
  {
    uri: `${CONVENTIONS_URI_PREFIX}{owner}/{repo}`,
    name: 'Repo conventions',
    description: "The repository's MergeWatch conventions markdown.",
    mimeType: 'text/markdown',
  },
];

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

/** JSON-RPC 2.0: a request with no id is a notification — never produces a response. */
function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined;
}

function requireAuth(auth: AuthResolution | null): AuthResolution {
  if (!auth) {
    throw new AuthError('missing', 'Authentication required for this method');
  }
  return auth;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  deps: McpServerDeps,
  auth: AuthResolution,
): Promise<unknown> {
  if (name === 'review_diff') {
    return handleReviewDiff(args as unknown as ReviewDiffInput, deps, auth);
  }
  if (name === 'get_review_status') {
    return handleGetReviewStatus(args as unknown as GetReviewStatusInput, deps, auth);
  }
  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Dispatch a single JSON-RPC request. Returns null for notifications.
 * `auth` is null when the transport couldn't resolve a bearer — discovery
 * methods (initialize, ping, tools/list, resources/list) still work; any
 * method that calls into a tool or resource handler will produce a -32001.
 */
export async function dispatchMcpRequest(
  req: JsonRpcRequest,
  deps: McpServerDeps,
  auth: AuthResolution | null,
): Promise<JsonRpcResponse | null> {
  const notification = isNotification(req);
  const id = (req.id ?? null) as JsonRpcId;

  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    if (notification) return null;
    return jsonRpcError(id, ERROR_CODES.INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  try {
    switch (req.method) {
      case 'initialize': {
        const result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'mergewatch', version: '0.1.0' },
        };
        return notification ? null : jsonRpcSuccess(id, result);
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return notification ? null : jsonRpcSuccess(id, {});
      case 'tools/list':
        return notification ? null : jsonRpcSuccess(id, { tools: TOOL_DEFS });
      case 'resources/list':
        return notification ? null : jsonRpcSuccess(id, { resources: RESOURCE_DEFS });
      case 'tools/call': {
        const resolved = requireAuth(auth);
        const params = (req.params ?? {}) as { name?: string; arguments?: unknown };
        if (!params.name || typeof params.name !== 'string') {
          return jsonRpcError(id, ERROR_CODES.INVALID_PARAMS, 'tools/call requires a "name" string');
        }
        const out = await runTool(
          params.name,
          (params.arguments ?? {}) as Record<string, unknown>,
          deps,
          resolved,
        );
        const toolResponse = {
          content: [{ type: 'text', text: JSON.stringify(out) }],
        };
        return notification ? null : jsonRpcSuccess(id, toolResponse);
      }
      case 'resources/read': {
        const resolved = requireAuth(auth);
        const params = (req.params ?? {}) as { uri?: string };
        if (!params.uri || typeof params.uri !== 'string') {
          return jsonRpcError(id, ERROR_CODES.INVALID_PARAMS, 'resources/read requires a "uri" string');
        }
        const out = await handleConventionsResource(params.uri, deps, resolved);
        const result = {
          contents: [{ uri: out.uri, mimeType: out.mimeType, text: out.text }],
        };
        return notification ? null : jsonRpcSuccess(id, result);
      }
      default:
        if (notification) return null;
        return jsonRpcError(id, ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${req.method}`);
    }
  } catch (err) {
    if (notification) return null;
    if (err instanceof AuthError) {
      return jsonRpcError(id, ERROR_CODES.UNAUTHORIZED, err.message, { code: err.code });
    }
    if (err instanceof BillingBlockedError) {
      return jsonRpcError(id, ERROR_CODES.BILLING_BLOCKED, err.message, {
        code: 'billing_blocked',
        installationId: err.installationId,
        firstBlock: err.firstBlock,
      });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return jsonRpcError(id, ERROR_CODES.INTERNAL, message);
  }
}

/**
 * Dispatch a batch of requests per JSON-RPC 2.0 semantics. Returns an array
 * of responses (notifications omitted), or null when every input was a
 * notification (the spec says: do not send a response in that case).
 */
export async function dispatchMcpBatch(
  requests: JsonRpcRequest[],
  deps: McpServerDeps,
  auth: AuthResolution | null,
): Promise<JsonRpcResponse[] | null> {
  const settled = await Promise.all(
    requests.map((r) => dispatchMcpRequest(r, deps, auth)),
  );
  const responses = settled.filter((r): r is JsonRpcResponse => r !== null);
  return responses.length === 0 ? null : responses;
}
