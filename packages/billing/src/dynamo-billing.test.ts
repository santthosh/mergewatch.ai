import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBillingFields,
  incrementFreeReviewsUsed,
  deductBalance,
  deductBalanceAndRecordUsage,
  updateBillingFields,
} from './dynamo-billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const table = 'test-table';
const installationId = 'inst-123';

function createMockClient(sendResult: any = {}) {
  return {
    send: vi.fn().mockResolvedValue(sendResult),
  } as any;
}

// ---------------------------------------------------------------------------
// getBillingFields
// ---------------------------------------------------------------------------

describe('getBillingFields', () => {
  it('returns billing fields from DynamoDB item', async () => {
    const client = createMockClient({ Item: { balanceCents: 500, freeReviewsUsed: 3 } });
    const result = await getBillingFields(client, table, installationId);
    expect(result).toEqual({ balanceCents: 500, freeReviewsUsed: 3 });
  });

  it('returns empty object when no item found', async () => {
    const client = createMockClient({ Item: undefined });
    const result = await getBillingFields(client, table, installationId);
    expect(result).toEqual({});
  });

  it('passes correct key with #SETTINGS sentinel', async () => {
    const client = createMockClient({});
    await getBillingFields(client, table, installationId);
    const input = client.send.mock.calls[0][0].input;
    expect(input.Key).toEqual({ installationId, repoFullName: '#SETTINGS' });
  });
});

// ---------------------------------------------------------------------------
// incrementFreeReviewsUsed
// ---------------------------------------------------------------------------

describe('incrementFreeReviewsUsed', () => {
  it('sends UpdateCommand with correct condition expression', async () => {
    const client = createMockClient();
    await incrementFreeReviewsUsed(client, table, installationId, 10);

    const input = client.send.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe('ADD freeReviewsUsed :one');
    expect(input.ConditionExpression).toContain('freeReviewsUsed < :limit');
    expect(input.ExpressionAttributeValues).toEqual({ ':one': 1, ':limit': 10 });
  });
});

// ---------------------------------------------------------------------------
// deductBalance
// ---------------------------------------------------------------------------

describe('deductBalance', () => {
  it('sends UpdateCommand with balance condition', async () => {
    const client = createMockClient();
    await deductBalance(client, table, installationId, 250);

    const input = client.send.mock.calls[0][0].input;
    expect(input.UpdateExpression).toContain('balanceCents = balanceCents - :amount');
    expect(input.ConditionExpression).toContain('balanceCents >= :amount');
    expect(input.ExpressionAttributeValues[':amount']).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// deductBalanceAndRecordUsage
// ---------------------------------------------------------------------------

describe('deductBalanceAndRecordUsage', () => {
  it('includes all usage fields in UpdateExpression', async () => {
    const client = createMockClient();
    await deductBalanceAndRecordUsage(client, table, installationId, {
      amountCents: 100,
      totalBilledCents: 500,
      prCount: 5,
      billingPeriod: '2026-04',
      prTimestamps: ['2026-04-01T00:00:00Z'],
    });

    const input = client.send.mock.calls[0][0].input;
    expect(input.UpdateExpression).toContain('balanceCents = balanceCents - :amount');
    expect(input.UpdateExpression).toContain('totalBilledCents = :totalBilled');
    expect(input.UpdateExpression).toContain('prCount = :prCount');
    expect(input.UpdateExpression).toContain('billingPeriod = :period');
    expect(input.UpdateExpression).toContain('prTimestamps = :timestamps');
    expect(input.ExpressionAttributeValues[':amount']).toBe(100);
    expect(input.ExpressionAttributeValues[':prCount']).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// updateBillingFields — expression builder (pure logic)
// ---------------------------------------------------------------------------

describe('updateBillingFields', () => {
  it('returns early for empty fields without calling DynamoDB', async () => {
    const client = createMockClient();
    await updateBillingFields(client, table, installationId, {});
    expect(client.send).not.toHaveBeenCalled();
  });

  it('builds SET expression for defined values', async () => {
    const client = createMockClient();
    await updateBillingFields(client, table, installationId, {
      balanceCents: 500,
      stripeCustomerId: 'cus_123',
    } as any);

    const input = client.send.mock.calls[0][0].input;
    expect(input.UpdateExpression).toContain('SET');
    expect(input.UpdateExpression).toContain('#balanceCents = :balanceCents');
    expect(input.UpdateExpression).toContain('#stripeCustomerId = :stripeCustomerId');
    expect(input.ExpressionAttributeNames['#balanceCents']).toBe('balanceCents');
    expect(input.ExpressionAttributeValues[':balanceCents']).toBe(500);
  });

  it('builds REMOVE expression for undefined values', async () => {
    const client = createMockClient();
    await updateBillingFields(client, table, installationId, {
      blockedAt: undefined,
      blockIssueNumber: undefined,
    } as any);

    const input = client.send.mock.calls[0][0].input;
    expect(input.UpdateExpression).toContain('REMOVE');
    expect(input.UpdateExpression).toContain('#blockedAt');
    expect(input.UpdateExpression).toContain('#blockIssueNumber');
    expect(input.ExpressionAttributeValues).toBeUndefined();
  });

  it('combines SET and REMOVE in a single expression', async () => {
    const client = createMockClient();
    await updateBillingFields(client, table, installationId, {
      balanceCents: 1000,
      blockedAt: undefined,
    } as any);

    const input = client.send.mock.calls[0][0].input;
    expect(input.UpdateExpression).toContain('SET');
    expect(input.UpdateExpression).toContain('REMOVE');
    expect(input.ExpressionAttributeNames['#balanceCents']).toBe('balanceCents');
    expect(input.ExpressionAttributeNames['#blockedAt']).toBe('blockedAt');
    expect(input.ExpressionAttributeValues[':balanceCents']).toBe(1000);
  });
});
