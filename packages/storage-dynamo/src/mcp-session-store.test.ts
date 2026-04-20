import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoMcpSessionStore } from './mcp-session-store.js';

const TABLE = 'test-sessions';

function makeClient(response: unknown = {}) {
  return { send: vi.fn().mockResolvedValue(response) } as any;
}

describe('DynamoMcpSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('get returns the item when present', async () => {
    const record = {
      sessionId: 'sess-1',
      installationId: 'inst-1',
      firstBilledAt: '2026-04-19T00:00:00.000Z',
      maxBilledCents: 50,
      iteration: 2,
      ttl: 1_800_000_000,
    };
    const client = makeClient({ Item: record });
    const store = new DynamoMcpSessionStore(client, TABLE);
    const got = await store.get('sess-1');
    expect(got).toEqual(record);
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(GetCommand);
    expect(call.input.Key).toEqual({ sessionId: 'sess-1' });
  });

  it('get returns null when absent', async () => {
    const client = makeClient({});
    const store = new DynamoMcpSessionStore(client, TABLE);
    expect(await store.get('missing')).toBeNull();
  });

  it('upsert writes the record with ttl intact (unix epoch seconds)', async () => {
    const client = makeClient();
    const store = new DynamoMcpSessionStore(client, TABLE);
    const firstBilledAt = '2026-04-19T00:00:00.000Z';
    const ttl = Math.floor(new Date(firstBilledAt).getTime() / 1000) + 1800;
    const record = {
      sessionId: 'sess-1',
      installationId: 'inst-1',
      firstBilledAt,
      maxBilledCents: 10,
      iteration: 1,
      ttl,
    };
    await store.upsert(record);
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(PutCommand);
    expect(call.input).toEqual({ TableName: TABLE, Item: record });
    // Roundtrip sanity: ttl * 1000 -> Date should be firstBilled + 30min
    expect(new Date(ttl * 1000).toISOString()).toBe('2026-04-19T00:30:00.000Z');
  });
});
