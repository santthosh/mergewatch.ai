import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReviewDiff, mockGetReviewStatus, mockConventions } = vi.hoisted(() => ({
  mockReviewDiff: vi.fn(),
  mockGetReviewStatus: vi.fn(),
  mockConventions: vi.fn(),
}));

vi.mock('./tools/review-diff.js', () => ({
  handleReviewDiff: mockReviewDiff,
  splitOwnerRepo: (v: string) => {
    const i = v.indexOf('/');
    return i > 0 ? { owner: v.slice(0, i), repo: v.slice(i + 1) } : null;
  },
}));

vi.mock('./tools/get-review-status.js', () => ({
  handleGetReviewStatus: mockGetReviewStatus,
}));

vi.mock('./resources/conventions.js', () => ({
  CONVENTIONS_URI_PREFIX: 'mergewatch://conventions/',
  handleConventionsResource: mockConventions,
}));

import {
  dispatchMcpRequest,
  dispatchMcpBatch,
  ERROR_CODES,
  MCP_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcErrorResponse,
  type JsonRpcSuccess,
} from './http-dispatcher';
import { AuthError, type AuthResolution } from './middleware/auth.js';
import { BillingBlockedError } from './middleware/billing.js';
import type { McpServerDeps } from './server-deps.js';

const deps = {} as McpServerDeps;

const auth: AuthResolution = {
  installationId: 'inst-1',
  scope: 'all',
  keyHash: 'abc123',
};

function isError(r: JsonRpcResponse): r is JsonRpcErrorResponse {
  return 'error' in r;
}

function isSuccess(r: JsonRpcResponse): r is JsonRpcSuccess {
  return 'result' in r;
}

describe('dispatchMcpRequest — discovery (no auth required)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initialize returns protocol version + capabilities', async () => {
    const req: JsonRpcRequest = { jsonrpc: '2.0', id: 1, method: 'initialize' };
    const res = await dispatchMcpRequest(req, deps, null);
    expect(res).not.toBeNull();
    if (!res || !isSuccess(res)) throw new Error('expected success');
    expect(res.id).toBe(1);
    expect(res.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: 'mergewatch' },
    });
  });

  it('ping returns empty object', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 'ping-1', method: 'ping' },
      deps, null,
    );
    expect(res).toEqual({ jsonrpc: '2.0', id: 'ping-1', result: {} });
  });

  it('tools/list returns both tool definitions', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      deps, null,
    );
    if (!res || !isSuccess(res)) throw new Error('expected success');
    const names = (res.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toEqual(['review_diff', 'get_review_status']);
  });

  it('resources/list returns conventions resource', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'resources/list' },
      deps, null,
    );
    if (!res || !isSuccess(res)) throw new Error('expected success');
    expect((res.result as { resources: Array<{ uri: string }> }).resources[0].uri).toContain(
      'mergewatch://conventions/',
    );
  });
});

describe('dispatchMcpRequest — notifications', () => {
  it('returns null for notifications/initialized (no id)', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      deps, null,
    );
    expect(res).toBeNull();
  });

  it('returns null for any method when id is absent', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', method: 'tools/list' },
      deps, null,
    );
    expect(res).toBeNull();
  });
});

describe('dispatchMcpRequest — authenticated methods', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tools/call unauthorized returns -32001', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'review_diff', arguments: { diff: 'x' } } },
      deps, null,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(mockReviewDiff).not.toHaveBeenCalled();
  });

  it('tools/call happy path wraps output in content array', async () => {
    mockReviewDiff.mockResolvedValueOnce({ sessionId: 's1', iteration: 1, findings: [] });
    const res = await dispatchMcpRequest(
      {
        jsonrpc: '2.0', id: 7,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: { diff: 'x' } },
      },
      deps, auth,
    );
    if (!res || !isSuccess(res)) throw new Error('expected success');
    expect(mockReviewDiff).toHaveBeenCalledTimes(1);
    const payload = res.result as { content: Array<{ type: string; text: string }> };
    expect(payload.content[0].type).toBe('text');
    expect(JSON.parse(payload.content[0].text)).toMatchObject({ sessionId: 's1' });
  });

  it('tools/call missing name returns -32602', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { arguments: {} } },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.INVALID_PARAMS);
  });

  it('tools/call unknown tool returns -32603 with message', async () => {
    const res = await dispatchMcpRequest(
      {
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'does_not_exist', arguments: {} },
      },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.INTERNAL);
    expect(res.error.message).toContain('Unknown tool');
  });

  it('tools/call surfaces BillingBlockedError as -32002', async () => {
    mockReviewDiff.mockRejectedValueOnce(new BillingBlockedError('inst-1', true));
    const res = await dispatchMcpRequest(
      {
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: { diff: 'x' } },
      },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.BILLING_BLOCKED);
    expect((res.error.data as { code: string; installationId: string }).installationId).toBe('inst-1');
  });

  it('tools/call surfaces AuthError thrown by handler as -32001', async () => {
    mockReviewDiff.mockRejectedValueOnce(new AuthError('revoked', 'Key revoked'));
    const res = await dispatchMcpRequest(
      {
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: { diff: 'x' } },
      },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('resources/read happy path', async () => {
    mockConventions.mockResolvedValueOnce({
      uri: 'mergewatch://conventions/acme/web',
      mimeType: 'text/markdown',
      text: 'conventions',
      found: true,
    });
    const res = await dispatchMcpRequest(
      {
        jsonrpc: '2.0', id: 1,
        method: 'resources/read',
        params: { uri: 'mergewatch://conventions/acme/web' },
      },
      deps, auth,
    );
    if (!res || !isSuccess(res)) throw new Error('expected success');
    const r = res.result as { contents: Array<{ text: string; uri: string }> };
    expect(r.contents[0].text).toBe('conventions');
    expect(r.contents[0].uri).toBe('mergewatch://conventions/acme/web');
  });

  it('resources/read missing uri returns -32602', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'resources/read', params: {} },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.INVALID_PARAMS);
  });

  it('resources/read unauthenticated returns -32001', async () => {
    const res = await dispatchMcpRequest(
      {
        jsonrpc: '2.0', id: 1,
        method: 'resources/read',
        params: { uri: 'mergewatch://conventions/a/b' },
      },
      deps, null,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });
});

describe('dispatchMcpRequest — bad requests', () => {
  it('unknown method returns -32601', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'foo/bar' },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.METHOD_NOT_FOUND);
  });

  it('wrong jsonrpc version returns -32600', async () => {
    const res = await dispatchMcpRequest(
      { jsonrpc: '1.0' as any, id: 1, method: 'ping' },
      deps, auth,
    );
    if (!res || !isError(res)) throw new Error('expected error');
    expect(res.error.code).toBe(ERROR_CODES.INVALID_REQUEST);
  });
});

describe('dispatchMcpBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns one response per non-notification request, preserving ids', async () => {
    const res = await dispatchMcpBatch(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ],
      deps, auth,
    );
    expect(res).not.toBeNull();
    expect(res!.map((r) => r.id)).toEqual([1, 2]);
  });

  it('returns null when every request is a notification', async () => {
    const res = await dispatchMcpBatch(
      [
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', method: 'notifications/cancelled' },
      ],
      deps, auth,
    );
    expect(res).toBeNull();
  });
});
