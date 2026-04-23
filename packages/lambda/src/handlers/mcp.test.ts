import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockResolveApiKey,
  mockDispatch,
  mockDispatchBatch,
  mockGetStripe,
  mockIsSaas,
  FakeAuthError,
} = vi.hoisted(() => {
  class FakeAuthError extends Error {
    constructor(public code: 'missing' | 'invalid' | 'revoked', message: string) {
      super(message);
      this.name = 'AuthError';
    }
  }
  return {
    mockResolveApiKey: vi.fn(),
    mockDispatch: vi.fn(),
    mockDispatchBatch: vi.fn(),
    mockGetStripe: vi.fn(),
    mockIsSaas: vi.fn(),
    FakeAuthError,
  };
});

vi.mock('@mergewatch/mcp', () => ({
  AuthError: FakeAuthError,
  resolveApiKey: mockResolveApiKey,
  dispatchMcpRequest: mockDispatch,
  dispatchMcpBatch: mockDispatchBatch,
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send() { return Promise.resolve({}); } },
}));
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: () => Promise.resolve({}) }),
  },
}));

vi.mock('@mergewatch/storage-dynamo', () => ({
  DynamoInstallationStore: class {},
  DynamoReviewStore: class {},
  DynamoApiKeyStore: class {},
  DynamoMcpSessionStore: class {},
}));

vi.mock('@mergewatch/llm-bedrock', () => ({
  BedrockLLMProvider: class {},
}));

vi.mock('@mergewatch/billing', () => ({
  billingCheck: vi.fn(),
  recordReview: vi.fn(),
  getStripe: mockGetStripe,
  isSaas: mockIsSaas,
}));

vi.mock('../github-auth-ssm.js', () => ({
  SSMGitHubAuthProvider: class {},
}));

import { handler } from './mcp';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '0',
      apiId: 'test',
      domainName: 'test.lambda-url.us-east-1.on.aws',
      domainPrefix: 'test',
      http: { method: 'POST', path: '/', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'r',
      routeKey: '$default',
      stage: '$default',
      time: 'now',
      timeEpoch: 0,
    } as any,
    isBase64Encoded: false,
    ...overrides,
  };
}

function okResult(statusCode: number, body?: unknown) {
  const r = body === undefined
    ? { statusCode }
    : { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return r;
}

describe('mcp Lambda — HTTP routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSaas.mockReturnValue(false);
  });

  it('GET returns health JSON', async () => {
    const res = await handler(makeEvent({ requestContext: {
      http: { method: 'GET' },
    } as any }));
    expect(res).toMatchObject({ statusCode: 200 });
  });

  it('OPTIONS returns 204', async () => {
    const res = await handler(makeEvent({ requestContext: {
      http: { method: 'OPTIONS' },
    } as any }));
    expect(res).toEqual({ statusCode: 204 });
  });

  it('PUT returns 405', async () => {
    const res = await handler(makeEvent({ requestContext: {
      http: { method: 'PUT' },
    } as any }));
    expect(res).toMatchObject({ statusCode: 405 });
  });

  it('invalid JSON body returns 400', async () => {
    const res = await handler(makeEvent({ body: 'not json' }));
    expect(res).toMatchObject({ statusCode: 400 });
  });
});

describe('mcp Lambda — auth gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSaas.mockReturnValue(false);
  });

  it('initialize without bearer succeeds (discovery is unauthenticated)', async () => {
    mockDispatch.mockResolvedValueOnce({
      jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26' },
    });
    const res = await handler(makeEvent({
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    }));
    expect(mockResolveApiKey).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'initialize' }),
      expect.any(Object),
      null, // auth was null
    );
    expect(res).toMatchObject({ statusCode: 200 });
  });

  it('tools/call without bearer returns 401', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: { diff: 'x' } },
      }),
    }));
    expect(mockResolveApiKey).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(res).toMatchObject({ statusCode: 401 });
  });

  it('tools/call with valid bearer resolves + dispatches with auth', async () => {
    mockResolveApiKey.mockResolvedValueOnce({
      installationId: 'inst-1', scope: 'all', keyHash: 'abc',
    });
    mockDispatch.mockResolvedValueOnce({ jsonrpc: '2.0', id: 1, result: { ok: true } });

    const res = await handler(makeEvent({
      headers: { authorization: 'Bearer mw_sk_live_abc123' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: { diff: 'x' } },
      }),
    }));
    expect(mockResolveApiKey).toHaveBeenCalledWith('Bearer mw_sk_live_abc123', expect.anything());
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ installationId: 'inst-1' }),
    );
    expect(res).toMatchObject({ statusCode: 200 });
  });

  it('Authorization header lookup is case-insensitive', async () => {
    mockResolveApiKey.mockResolvedValueOnce({ installationId: 'i', scope: 'all', keyHash: 'h' });
    mockDispatch.mockResolvedValueOnce({ jsonrpc: '2.0', id: 1, result: {} });

    await handler(makeEvent({
      headers: { Authorization: 'Bearer mw_sk_live_abc' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'resources/read',
        params: { uri: 'mergewatch://conventions/a/b' },
      }),
    }));
    expect(mockResolveApiKey).toHaveBeenCalledWith('Bearer mw_sk_live_abc', expect.anything());
  });

  it('revoked key returns 403', async () => {
    mockResolveApiKey.mockRejectedValueOnce(new FakeAuthError('revoked', 'Key revoked'));
    const res = await handler(makeEvent({
      headers: { authorization: 'Bearer mw_sk_live_x' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: { diff: 'x' } },
      }),
    }));
    expect(res).toMatchObject({ statusCode: 403 });
  });

  it('invalid bearer format returns 401', async () => {
    mockResolveApiKey.mockRejectedValueOnce(new FakeAuthError('invalid', 'Bad token'));
    const res = await handler(makeEvent({
      headers: { authorization: 'Bearer garbage' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'review_diff', arguments: {} },
      }),
    }));
    expect(res).toMatchObject({ statusCode: 401 });
  });
});

describe('mcp Lambda — batch + notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSaas.mockReturnValue(false);
  });

  it('batch request dispatches through dispatchMcpBatch', async () => {
    mockDispatchBatch.mockResolvedValueOnce([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, result: { tools: [] } },
    ]);
    const res = await handler(makeEvent({
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]),
    }));
    expect(mockDispatchBatch).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ statusCode: 200 });
  });

  it('notification-only batch returns 204', async () => {
    mockDispatchBatch.mockResolvedValueOnce(null);
    const res = await handler(makeEvent({
      body: JSON.stringify([
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ]),
    }));
    expect(res).toEqual({ statusCode: 204 });
  });

  it('single notification returns 204', async () => {
    mockDispatch.mockResolvedValueOnce(null);
    const res = await handler(makeEvent({
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }));
    expect(res).toEqual({ statusCode: 204 });
  });

  it('batch with any authenticated method requires a bearer', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'review_diff' } },
      ]),
    }));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockDispatchBatch).not.toHaveBeenCalled();
    expect(res).toMatchObject({ statusCode: 401 });
  });
});
