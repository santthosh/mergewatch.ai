/**
 * Lazy-initialized Stripe client.
 *
 * Reads STRIPE_SECRET_KEY from environment (set via SSM in Lambda).
 * The client is created on first use and cached for the lifetime of
 * the Lambda container.
 */

import Stripe from 'stripe';

let cachedStripe: Stripe | undefined;

/** Get or create the singleton Stripe client. */
export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }

  cachedStripe = new Stripe(key);

  return cachedStripe;
}
