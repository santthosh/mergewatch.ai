/**
 * createMcpServer — factory that returns a pre-configured MCP Server instance.
 *
 * The server registers:
 *   - tool   review_diff
 *   - tool   get_review_status
 *   - resource mergewatch://conventions/{owner}/{repo}
 *
 * Auth middleware is intentionally NOT wired into the Server itself. Transport
 * entry points (Lambda Function URL, Express mount) resolve the caller's API
 * key into an AuthResolution and inject it into the request's handler context
 * before dispatching to the underlying tool/resource handlers.
 *
 * To avoid a hard coupling on transport-specific context types, consumers
 * typically bypass the Server's built-in dispatcher for authenticated calls
 * and invoke the tool handlers (handleReviewDiff / handleGetReviewStatus /
 * handleConventionsResource) directly — the Server instance returned here is
 * useful for schema advertisement + stdio/local transports where auth is out
 * of band.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpServerDeps } from './server-deps.js';
import { handleReviewDiff } from './tools/review-diff.js';
import { handleGetReviewStatus } from './tools/get-review-status.js';
import { CONVENTIONS_URI_PREFIX, handleConventionsResource } from './resources/conventions.js';
import type { AuthResolution } from './middleware/auth.js';

/** JSON Schema for the review_diff tool input. */
const REVIEW_DIFF_INPUT_SCHEMA = {
  type: 'object',
  required: ['diff'],
  properties: {
    diff: { type: 'string', description: 'Unified diff to review.' },
    repo: {
      type: 'string',
      description: 'Optional "owner/repo" — when provided, loads repo config + conventions.',
    },
    description: {
      type: 'string',
      description: 'Freeform task description; surfaced to agent prompts.',
    },
    sessionId: {
      type: 'string',
      description: 'Optional sessionId from a prior call for billing dedup.',
    },
  },
  additionalProperties: false,
} as const;

/** JSON Schema for the get_review_status tool input. */
const GET_REVIEW_STATUS_INPUT_SCHEMA = {
  type: 'object',
  required: ['repo', 'prNumber'],
  properties: {
    repo: { type: 'string', description: 'owner/repo.' },
    prNumber: { type: 'integer', minimum: 1, description: 'Pull request number.' },
  },
  additionalProperties: false,
} as const;

const TOOL_DEFS = [
  {
    name: 'review_diff',
    description: 'Run the full MergeWatch review pipeline on a diff. Marks agentAuthored=true.',
    inputSchema: REVIEW_DIFF_INPUT_SCHEMA,
  },
  {
    name: 'get_review_status',
    description: 'Return the latest review row for a PR.',
    inputSchema: GET_REVIEW_STATUS_INPUT_SCHEMA,
  },
] as const;

/**
 * Unresolved auth — thrown when transports that haven't injected an
 * AuthResolution into the server call into a tool handler. Authentication
 * belongs in the transport layer, not the Server instance itself.
 */
export class MissingAuthContextError extends Error {
  constructor() {
    super(
      'MCP server: no AuthResolution attached. Use handleReviewDiff/handleGetReviewStatus/handleConventionsResource directly from the transport layer.',
    );
    this.name = 'MissingAuthContextError';
  }
}

/**
 * Options for the built-in (authenticated) dispatcher. Transports that want
 * to use the Server's SDK dispatcher pass a `getAuth()` resolver that reads
 * whatever auth context they stashed (e.g. AsyncLocalStorage, req.auth).
 */
export interface CreateMcpServerOptions {
  /** Resolver for the current request's AuthResolution. Optional. */
  getAuth?: () => AuthResolution | undefined;
}

export function createMcpServer(deps: McpServerDeps, options: CreateMcpServerOptions = {}): Server {
  const server = new Server(
    { name: 'mergewatch', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  const resolveAuth = (): AuthResolution => {
    const auth = options.getAuth?.();
    if (!auth) throw new MissingAuthContextError();
    return auth;
  };

  // ─── tools/list ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS.map((t) => ({ ...t })),
  }));

  // ─── tools/call ────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const auth = resolveAuth();
    const { name, arguments: args } = req.params;

    if (name === 'review_diff') {
      const out = await handleReviewDiff((args ?? {}) as never, deps, auth);
      return toolJsonResponse(out);
    }
    if (name === 'get_review_status') {
      const out = await handleGetReviewStatus((args ?? {}) as never, deps, auth);
      return toolJsonResponse(out);
    }
    throw new Error(`Unknown tool: ${name}`);
  });

  // ─── resources/list ────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: `${CONVENTIONS_URI_PREFIX}{owner}/{repo}`,
        name: 'Repo conventions',
        description: "The repository's MergeWatch conventions markdown.",
        mimeType: 'text/markdown',
      },
    ],
  }));

  // ─── resources/read ────────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const auth = resolveAuth();
    const out = await handleConventionsResource(req.params.uri, deps, auth);
    return {
      contents: [
        {
          uri: out.uri,
          mimeType: out.mimeType,
          text: out.text,
        },
      ],
    };
  });

  return server;
}

/** Wrap an object as an MCP tool JSON response. */
function toolJsonResponse(payload: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(payload) },
    ],
  };
}
