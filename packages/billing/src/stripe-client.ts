/**
 * Lazy-initialized Stripe client.
 *
 * Reads the Stripe secret key from SSM Parameter Store at first use
 * and caches the client for the lifetime of the Lambda container.
 *
 * Falls back to STRIPE_SECRET_KEY env var for local development / tests.
 */

import Stripe from 'stripe';
import { getStripeSecretKey } from './ssm';

let cachedStripe: Stripe | undefined;

/** Get or create the singleton Stripe client (async — fetches key from SSM on first call). */
export async function getStripe(): Promise<Stripe> {
  if (cachedStripe) return cachedStripe;

  // Prefer env var (local dev / tests), fall back to SSM (Lambda)
  const key = process.env.STRIPE_SECRET_KEY || await getStripeSecretKey();

  cachedStripe = new Stripe(key);
  return cachedStripe;
}
