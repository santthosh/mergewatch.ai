import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-ssm', () => {
  return {
    SSMClient: class {
      send = mockSend;
    },
    GetParameterCommand: class {
      constructor(public input: any) {}
    },
  };
});

describe('SSM billing secrets', () => {
  const originalStage = process.env.STAGE;

  beforeEach(async () => {
    vi.resetModules();
    mockSend.mockReset();
    process.env.STAGE = 'test';
  });

  afterEach(() => {
    if (originalStage === undefined) {
      delete process.env.STAGE;
    } else {
      process.env.STAGE = originalStage;
    }
  });

  async function loadModule() {
    // Re-import to get a fresh module with reset cache
    return await import('./ssm');
  }

  it('fetches Stripe secret key with correct parameter name', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: 'sk_test_123' } });
    const { getStripeSecretKey } = await loadModule();
    const result = await getStripeSecretKey();
    expect(result).toBe('sk_test_123');
  });

  it('fetches Stripe webhook secret', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: 'whsec_test' } });
    const { getStripeWebhookSecret } = await loadModule();
    const result = await getStripeWebhookSecret();
    expect(result).toBe('whsec_test');
  });

  it('fetches billing API secret', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: 'billing_secret' } });
    const { getBillingApiSecret } = await loadModule();
    const result = await getBillingApiSecret();
    expect(result).toBe('billing_secret');
  });

  it('caches SSM parameter on second call', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: 'cached_value' } });
    const { getStripeSecretKey } = await loadModule();

    const first = await getStripeSecretKey();
    const second = await getStripeSecretKey();

    expect(first).toBe('cached_value');
    expect(second).toBe('cached_value');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('throws when SSM returns empty value', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: undefined } });
    const { getStripeSecretKey } = await loadModule();
    await expect(getStripeSecretKey()).rejects.toThrow('not found or empty');
  });

  it('throws when SSM call fails', async () => {
    mockSend.mockRejectedValue(new Error('AccessDeniedException'));
    const { getStripeSecretKey } = await loadModule();
    await expect(getStripeSecretKey()).rejects.toThrow('Failed to fetch SSM parameter');
  });

  it('throws when STAGE env var is missing', async () => {
    delete process.env.STAGE;
    const { getStripeSecretKey } = await loadModule();
    await expect(getStripeSecretKey()).rejects.toThrow('STAGE environment variable');
  });
});
