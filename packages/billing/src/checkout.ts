/**
 * Stripe Checkout session helpers for card setup and top-up.
 */

import type Stripe from 'stripe';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getBillingFields, updateBillingFields } from './dynamo-billing';

/**
 * Ensure a Stripe Customer exists for this installation.
 * Creates one if needed and persists the ID in DynamoDB.
 */
export async function ensureStripeCustomer(
  stripe: Stripe,
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
): Promise<string> {
  const fields = await getBillingFields(client, table, installationId);

  if (fields.stripeCustomerId) {
    return fields.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    metadata: {
      mergewatchInstallationId: installationId,
    },
  });

  try {
    await updateBillingFields(client, table, installationId, {
      stripeCustomerId: customer.id,
    });
  } catch (err) {
    // Stripe customer created but DynamoDB write failed — log for reconciliation.
    // Next call will create a duplicate customer unless this is resolved.
    console.error(`[billing] ORPHANED_CUSTOMER: Stripe customer ${customer.id} created for install=${installationId} but DynamoDB write failed:`, err);
    throw err;
  }

  return customer.id;
}

/**
 * Create a Stripe Checkout Session in `setup` mode to capture a payment method.
 */
export async function createSetupSession(
  stripe: Stripe,
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'setup',
    payment_method_types: ['card'],
    success_url: `${returnUrl}?setup=complete`,
    cancel_url: `${returnUrl}?setup=cancelled`,
  });

  if (!session.url) {
    throw new Error('Stripe Checkout session created without a URL');
  }

  return session.url;
}

/**
 * Create a top-up: charge the customer's saved card and credit their balance.
 *
 * Uses Stripe idempotency keys to prevent duplicate charges within a 5-minute window.
 */
export async function createTopUp(
  stripe: Stripe,
  client: DynamoDBDocumentClient,
  table: string,
  installationId: string,
  amountCents: number,
): Promise<{ paymentIntentId: string; newBalanceCents: number }> {
  const fields = await getBillingFields(client, table, installationId);

  if (!fields.stripeCustomerId) {
    throw new Error('No Stripe customer found — complete card setup first');
  }

  const customerId = fields.stripeCustomerId;

  // Look up the customer's saved payment method
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 1,
  });

  if (paymentMethods.data.length === 0) {
    throw new Error('No payment method on file — complete card setup first');
  }

  const paymentMethodId = paymentMethods.data[0].id;

  // 5-minute idempotency window
  const window = Math.floor(Date.now() / (5 * 60 * 1000));
  const idempotencyKey = `topup-${installationId}-${amountCents}-${window}`;

  // Charge the saved card
  const paymentIntent = await stripe.paymentIntents.create(
    {
      customer: customerId,
      payment_method: paymentMethodId,
      amount: amountCents,
      currency: 'usd',
      confirm: true,
      off_session: true,
      metadata: {
        mergewatchInstallationId: installationId,
        type: 'topup',
      },
    },
    { idempotencyKey },
  );

  // Credit the Stripe Customer Balance and update DynamoDB.
  // If either fails after payment succeeds, log for reconciliation.
  // The customer.updated webhook will eventually sync the Stripe balance to DynamoDB.
  try {
    await stripe.customers.createBalanceTransaction(customerId, {
      amount: -amountCents,
      currency: 'usd',
      description: `MergeWatch credit top-up ($${(amountCents / 100).toFixed(2)})`,
      metadata: {
        mergewatchInstallationId: installationId,
        paymentIntentId: paymentIntent.id,
      },
    });
  } catch (err) {
    console.error(`[billing] TOPUP_PARTIAL_FAILURE: payment ${paymentIntent.id} succeeded but Stripe balance credit failed for install=${installationId} amount=${amountCents}c:`, err);
    throw err;
  }

  // Update DynamoDB balance
  const newBalanceCents = (fields.balanceCents ?? 0) + amountCents;
  try {
    await updateBillingFields(client, table, installationId, {
      balanceCents: newBalanceCents,
      blockedAt: undefined,
    });
  } catch (err) {
    console.error(`[billing] TOPUP_PARTIAL_FAILURE: payment ${paymentIntent.id} + Stripe credit succeeded but DynamoDB update failed for install=${installationId}. customer.updated webhook will reconcile.`, err);
    throw err;
  }

  return { paymentIntentId: paymentIntent.id, newBalanceCents };
}
