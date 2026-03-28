import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureStripeCustomer, createSetupSession, createTopUp } from './checkout';

// Mock DynamoDB layer
vi.mock('./dynamo-billing', () => ({
  getBillingFields: vi.fn(),
  updateBillingFields: vi.fn(),
}));

import { getBillingFields, updateBillingFields } from './dynamo-billing';
const mockGetFields = vi.mocked(getBillingFields);
const mockUpdateFields = vi.mocked(updateBillingFields);

const client = {} as any;
const table = 'test-table';
const installationId = 'inst-123';

function createMockStripe(overrides: Record<string, any> = {}) {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_new_123' }),
      createBalanceTransaction: vi.fn().mockResolvedValue({}),
      ...overrides.customers,
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/sess_123' }),
        ...overrides.sessions,
      },
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: 'pi_123' }),
      ...overrides.paymentIntents,
    },
    paymentMethods: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 'pm_card_123' }] }),
      ...overrides.paymentMethods,
    },
  } as any;
}

describe('ensureStripeCustomer', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns existing customer ID if already stored', async () => {
    mockGetFields.mockResolvedValue({ stripeCustomerId: 'cus_existing' });
    const stripe = createMockStripe();

    const result = await ensureStripeCustomer(stripe, client, table, installationId);

    expect(result).toBe('cus_existing');
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('creates a new Stripe customer and stores the ID', async () => {
    mockGetFields.mockResolvedValue({});
    const stripe = createMockStripe();

    const result = await ensureStripeCustomer(stripe, client, table, installationId);

    expect(result).toBe('cus_new_123');
    expect(stripe.customers.create).toHaveBeenCalledWith({
      metadata: { mergewatchInstallationId: installationId },
    });
    expect(mockUpdateFields).toHaveBeenCalledWith(client, table, installationId, {
      stripeCustomerId: 'cus_new_123',
    });
  });

  it('throws and logs when Stripe succeeds but DynamoDB write fails', async () => {
    mockGetFields.mockResolvedValue({});
    mockUpdateFields.mockRejectedValue(new Error('DynamoDB write failed'));
    const stripe = createMockStripe();

    await expect(
      ensureStripeCustomer(stripe, client, table, installationId),
    ).rejects.toThrow('DynamoDB write failed');

    // Stripe customer was created (call happened before DynamoDB error)
    expect(stripe.customers.create).toHaveBeenCalled();
  });
});

describe('createSetupSession', () => {
  it('returns checkout URL', async () => {
    const stripe = createMockStripe();

    const url = await createSetupSession(stripe, 'cus_123', 'https://mergewatch.ai/dashboard/billing');

    expect(url).toBe('https://checkout.stripe.com/sess_123');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'setup',
        payment_method_types: ['card'],
        success_url: 'https://mergewatch.ai/dashboard/billing?setup=complete',
        cancel_url: 'https://mergewatch.ai/dashboard/billing?setup=cancelled',
      }),
    );
  });

  it('throws when session has no URL', async () => {
    const stripe = createMockStripe();
    stripe.checkout.sessions.create.mockResolvedValue({ url: null });

    await expect(
      createSetupSession(stripe, 'cus_123', 'https://example.com'),
    ).rejects.toThrow('without a URL');
  });
});

describe('createTopUp', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('charges card, credits balance, and updates DynamoDB', async () => {
    mockGetFields.mockResolvedValue({ stripeCustomerId: 'cus_123', balanceCents: 500 });
    const stripe = createMockStripe();

    const result = await createTopUp(stripe, client, table, installationId, 1000);

    expect(result.paymentIntentId).toBe('pi_123');
    expect(result.newBalanceCents).toBe(1500); // 500 + 1000

    // PaymentIntent created with confirm + off_session
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        amount: 1000,
        currency: 'usd',
        confirm: true,
        off_session: true,
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('topup-inst-123-1000-') }),
    );

    // Balance transaction credited (negative amount)
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledWith(
      'cus_123',
      expect.objectContaining({ amount: -1000 }),
    );

    // DynamoDB updated
    expect(mockUpdateFields).toHaveBeenCalledWith(client, table, installationId, {
      balanceCents: 1500,
      blockedAt: undefined,
    });
  });

  it('throws when no Stripe customer exists', async () => {
    mockGetFields.mockResolvedValue({});
    const stripe = createMockStripe();

    await expect(
      createTopUp(stripe, client, table, installationId, 1000),
    ).rejects.toThrow('No Stripe customer found');
  });

  it('handles zero initial balance', async () => {
    mockGetFields.mockResolvedValue({ stripeCustomerId: 'cus_123' });
    const stripe = createMockStripe();

    const result = await createTopUp(stripe, client, table, installationId, 2500);

    expect(result.newBalanceCents).toBe(2500); // 0 + 2500
  });

  it('throws when Stripe balance credit fails after payment succeeds', async () => {
    mockGetFields.mockResolvedValue({ stripeCustomerId: 'cus_123', balanceCents: 500 });
    const stripe = createMockStripe({
      customers: {
        createBalanceTransaction: vi.fn().mockRejectedValue(new Error('Stripe balance error')),
      },
    });

    await expect(
      createTopUp(stripe, client, table, installationId, 1000),
    ).rejects.toThrow('Stripe balance error');

    // Payment was created (happened before the failure)
    expect(stripe.paymentIntents.create).toHaveBeenCalled();
    // DynamoDB was NOT updated (failed before reaching it)
    expect(mockUpdateFields).not.toHaveBeenCalled();
  });

  it('throws when DynamoDB update fails after payment + credit succeed', async () => {
    mockGetFields.mockResolvedValue({ stripeCustomerId: 'cus_123', balanceCents: 500 });
    mockUpdateFields.mockRejectedValue(new Error('DynamoDB timeout'));
    const stripe = createMockStripe();

    await expect(
      createTopUp(stripe, client, table, installationId, 1000),
    ).rejects.toThrow('DynamoDB timeout');

    // Both Stripe calls succeeded
    expect(stripe.paymentIntents.create).toHaveBeenCalled();
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalled();
  });
});
