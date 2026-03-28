import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Mock the stripe module so we don't need a real API key
vi.mock('stripe', () => {
  return {
    default: vi.fn(function (this: any, key: string) { this.key = key; }),
  };
});

describe('getStripe', () => {
  beforeEach(() => {
    // Clear module cache so each test gets a fresh singleton
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when STRIPE_SECRET_KEY is not set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getStripe } = await import('./stripe-client');
    expect(() => getStripe()).toThrow('STRIPE_SECRET_KEY');
  });

  it('returns a Stripe instance when key is set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const { getStripe } = await import('./stripe-client');
    const stripe = getStripe();
    expect(stripe).toBeDefined();
    expect((stripe as any).key).toBe('sk_test_123');
  });

  it('returns the same cached instance on subsequent calls', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const { getStripe } = await import('./stripe-client');
    const first = getStripe();
    const second = getStripe();
    expect(first).toBe(second);
  });
});
