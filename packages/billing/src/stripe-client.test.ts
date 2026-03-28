import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Mock stripe module
vi.mock('stripe', () => ({
  default: vi.fn(function (this: any, key: string) { this.key = key; }),
}));

// Mock SSM module
vi.mock('./ssm', () => ({
  getStripeSecretKey: vi.fn().mockResolvedValue('sk_test_from_ssm'),
}));

describe('getStripe', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses env var when STRIPE_SECRET_KEY is set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_env');
    const { getStripe } = await import('./stripe-client');
    const stripe = await getStripe();
    expect(stripe).toBeDefined();
    expect((stripe as any).key).toBe('sk_test_env');
  });

  it('falls back to SSM when env var is not set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getStripe } = await import('./stripe-client');
    const stripe = await getStripe();
    expect(stripe).toBeDefined();
    expect((stripe as any).key).toBe('sk_test_from_ssm');
  });

  it('returns the same cached instance on subsequent calls', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_cached');
    const { getStripe } = await import('./stripe-client');
    const first = await getStripe();
    const second = await getStripe();
    expect(first).toBe(second);
  });
});
