import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoApiKeyStore, API_KEYS_INSTALLATION_INDEX } from './api-key-store.js';

const TABLE = 'test-api-keys';

function makeClient(response: unknown = {}) {
  return { send: vi.fn().mockResolvedValue(response) } as any;
}

describe('DynamoApiKeyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create issues a PutCommand with attribute_not_exists guard', async () => {
    const client = makeClient();
    const store = new DynamoApiKeyStore(client, TABLE);
    const record = {
      keyHash: 'abc',
      installationId: 'inst-1',
      label: 'dev laptop',
      scope: 'all' as const,
      createdBy: 'user-42',
      createdAt: '2026-04-19T00:00:00.000Z',
    };
    await store.create(record);
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(PutCommand);
    expect(call.input).toEqual({
      TableName: TABLE,
      Item: record,
      ConditionExpression: 'attribute_not_exists(keyHash)',
    });
  });

  it('getByHash returns the item when present', async () => {
    const record = {
      keyHash: 'abc',
      installationId: 'inst-1',
      label: 'x',
      scope: 'all',
      createdBy: 'u',
      createdAt: 't',
    };
    const client = makeClient({ Item: record });
    const store = new DynamoApiKeyStore(client, TABLE);
    const got = await store.getByHash('abc');
    expect(got).toEqual(record);
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(GetCommand);
    expect(call.input.Key).toEqual({ keyHash: 'abc' });
  });

  it('getByHash returns null when not found', async () => {
    const client = makeClient({});
    const store = new DynamoApiKeyStore(client, TABLE);
    expect(await store.getByHash('missing')).toBeNull();
  });

  it('listByInstallation queries the GSI', async () => {
    const items = [
      { keyHash: 'a', installationId: 'inst-1' },
      { keyHash: 'b', installationId: 'inst-1' },
    ];
    const client = makeClient({ Items: items });
    const store = new DynamoApiKeyStore(client, TABLE);
    const got = await store.listByInstallation('inst-1');
    expect(got).toEqual(items);
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(QueryCommand);
    expect(call.input).toEqual({
      TableName: TABLE,
      IndexName: API_KEYS_INSTALLATION_INDEX,
      KeyConditionExpression: 'installationId = :iid',
      ExpressionAttributeValues: { ':iid': 'inst-1' },
    });
  });

  it('listByInstallation returns [] when Items missing', async () => {
    const client = makeClient({});
    const store = new DynamoApiKeyStore(client, TABLE);
    expect(await store.listByInstallation('inst-x')).toEqual([]);
  });

  it('delete issues DeleteCommand by keyHash', async () => {
    const client = makeClient();
    const store = new DynamoApiKeyStore(client, TABLE);
    await store.delete('abc');
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(DeleteCommand);
    expect(call.input.Key).toEqual({ keyHash: 'abc' });
  });

  it('touchLastUsed updates lastUsedAt', async () => {
    const client = makeClient();
    const store = new DynamoApiKeyStore(client, TABLE);
    await store.touchLastUsed('abc', '2026-04-19T12:00:00.000Z');
    const call = client.send.mock.calls[0][0];
    expect(call).toBeInstanceOf(UpdateCommand);
    expect(call.input).toEqual({
      TableName: TABLE,
      Key: { keyHash: 'abc' },
      UpdateExpression: 'SET lastUsedAt = :ts',
      ExpressionAttributeValues: { ':ts': '2026-04-19T12:00:00.000Z' },
    });
  });
});
