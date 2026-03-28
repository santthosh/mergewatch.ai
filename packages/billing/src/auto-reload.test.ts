import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeAutoReload } from './auto-reload';

vi.mock('./dynamo-billing', () => ({
  getBillingFields: vi.fn(),
}));

import { getBillingFields } from './dynamo-billing';
const mockGetFields = vi.mocked(getBillingFields);

const table = 'test-table';
const installationId = 'inst-123';

function createMockDynamo(sendBehavior?: (cmd: any) => any) {
  return {
    send: vi.fn(sendBehavior ?? (() => Promise.resolve({}))),
  } as any;
}

function createMockStripe() {
  return {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: 'pi_auto_123' }),
    },
    customers: {
      createBalanceTransaction: vi.fn().mockResolvedValue({}),
    },
    paymentMethods: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 'pm_card_123' }] }),
    },
  } as any;
}

describe('maybeAutoReload', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns false when autoReloadEnabled is false', async () => {
    mockGetFields.mockResolvedValue({ autoReloadEnabled: false });
    const result = await maybeAutoReload(createMockDynamo(), table, createMockStripe(), installationId);
    expect(result).toBe(false);
  });

  it('returns false when threshold/amount not configured', async () => {
    mockGetFields.mockResolvedValue({ autoReloadEnabled: true });
    const result = await maybeAutoReload(createMockDynamo(), table, createMockStripe(), installationId);
    expect(result).toBe(false);
  });

  it('returns false when balance is above threshold', async () => {
    mockGetFields.mockResolvedValue({
      autoReloadEnabled: true,
      autoReloadThresholdCents: 100,
      autoReloadAmountCents: 1000,
      balanceCents: 500,
      stripeCustomerId: 'cus_123',
    });
    const result = await maybeAutoReload(createMockDynamo(), table, createMockStripe(), installationId);
    expect(result).toBe(false);
  });

  it('returns false when no Stripe customer ID', async () => {
    mockGetFields.mockResolvedValue({
      autoReloadEnabled: true,
      autoReloadThresholdCents: 100,
      autoReloadAmountCents: 1000,
      balanceCents: 50,
    });
    const result = await maybeAutoReload(createMockDynamo(), table, createMockStripe(), installationId);
    expect(result).toBe(false);
  });

  it('returns false when mutex is already held (concurrent reload)', async () => {
    mockGetFields.mockResolvedValue({
      autoReloadEnabled: true,
      autoReloadThresholdCents: 100,
      autoReloadAmountCents: 1000,
      balanceCents: 50,
      stripeCustomerId: 'cus_123',
    });
    const condErr = new Error('Condition not met');
    (condErr as any).name = 'ConditionalCheckFailedException';
    const client = createMockDynamo(() => Promise.reject(condErr));

    const result = await maybeAutoReload(client, table, createMockStripe(), installationId);
    expect(result).toBe(false);
  });

  it('triggers reload when all conditions met', async () => {
    mockGetFields.mockResolvedValue({
      autoReloadEnabled: true,
      autoReloadThresholdCents: 100,
      autoReloadAmountCents: 1000,
      balanceCents: 50,
      stripeCustomerId: 'cus_123',
    });
    const client = createMockDynamo();
    const stripe = createMockStripe();

    const result = await maybeAutoReload(client, table, stripe, installationId);

    expect(result).toBe(true);
    // Mutex acquired
    expect(client.send).toHaveBeenCalled();
    // PaymentIntent created
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        amount: 1000,
        confirm: true,
        off_session: true,
        metadata: expect.objectContaining({ type: 'auto-reload' }),
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('auto-reload-inst-123-1000-') }),
    );
    // Balance credited
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledWith(
      'cus_123',
      expect.objectContaining({ amount: -1000 }),
    );
  });

  it('returns false, logs, and clears mutex when Stripe charge fails', async () => {
    mockGetFields.mockResolvedValue({
      autoReloadEnabled: true,
      autoReloadThresholdCents: 100,
      autoReloadAmountCents: 1000,
      balanceCents: 50,
      stripeCustomerId: 'cus_123',
    });
    const client = createMockDynamo();
    const stripe = createMockStripe();
    stripe.paymentIntents.create.mockRejectedValue(new Error('Card declined'));

    const result = await maybeAutoReload(client, table, stripe, installationId);

    expect(result).toBe(false);
    // Mutex acquired (1st call) then cleared (2nd call)
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('throws on non-ConditionalCheckFailed DynamoDB errors', async () => {
    mockGetFields.mockResolvedValue({
      autoReloadEnabled: true,
      autoReloadThresholdCents: 100,
      autoReloadAmountCents: 1000,
      balanceCents: 50,
      stripeCustomerId: 'cus_123',
    });
    const client = createMockDynamo(() => Promise.reject(new Error('Access denied')));

    await expect(
      maybeAutoReload(client, table, createMockStripe(), installationId),
    ).rejects.toThrow('Access denied');
  });
});
