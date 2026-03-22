/**
 * Auto-reload: automatically top up credits when balance drops below a threshold.
 *
 * Uses a DynamoDB conditional write on `autoReloadInFlight` as a mutex to
 * prevent concurrent Lambda invocations from triggering duplicate charges.
 * The webhook handler clears the mutex on payment success or failure.
 */

import type Stripe from 'stripe';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getBillingFields } from './dynamo-billing';

const SETTINGS_SK = '#SETTINGS';

/**
 * Check if auto-reload should trigger and execute it if so.
 *
 * Conditions:
 *   1. autoReloadEnabled is true
 *   2. balanceCents < autoReloadThresholdCents
 *   3. No reload already in flight (mutex)
 *   4. Stripe customer has a saved payment method
 *
 * @returns true if a reload was triggered, false otherwise
 */
export async function maybeAutoReload(
  client: DynamoDBDocumentClient,
  table: string,
  stripe: Stripe,
  installationId: string,
): Promise<boolean> {
  const fields = await getBillingFields(client, table, installationId);

  // Check if auto-reload is configured and needed
  if (!fields.autoReloadEnabled) return false;
  if (!fields.autoReloadThresholdCents || !fields.autoReloadAmountCents) return false;
  if ((fields.balanceCents ?? 0) >= fields.autoReloadThresholdCents) return false;
  if (!fields.stripeCustomerId) return false;

  // Try to acquire the mutex via conditional write
  try {
    await client.send(new UpdateCommand({
      TableName: table,
      Key: { installationId, repoFullName: SETTINGS_SK },
      UpdateExpression: 'SET autoReloadInFlight = :t',
      ConditionExpression: '(attribute_not_exists(autoReloadInFlight) OR autoReloadInFlight = :f)',
      ExpressionAttributeValues: {
        ':t': true,
        ':f': false,
      },
    }));
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Another Lambda is already handling this — skip
      return false;
    }
    throw err;
  }

  // Trigger the charge
  const amountCents = fields.autoReloadAmountCents;
  const window = Math.floor(Date.now() / (5 * 60 * 1000));
  const idempotencyKey = `auto-reload-${installationId}-${amountCents}-${window}`;

  try {
    await stripe.paymentIntents.create(
      {
        customer: fields.stripeCustomerId,
        amount: amountCents,
        currency: 'usd',
        confirm: true,
        off_session: true,
        metadata: {
          mergewatchInstallationId: installationId,
          type: 'auto-reload',
        },
      },
      { idempotencyKey },
    );

    // Credit the Stripe Customer Balance
    await stripe.customers.createBalanceTransaction(fields.stripeCustomerId, {
      amount: -amountCents,
      currency: 'usd',
      description: `MergeWatch auto-reload ($${(amountCents / 100).toFixed(2)})`,
      metadata: {
        mergewatchInstallationId: installationId,
        type: 'auto-reload',
      },
    });

    return true;
  } catch (err) {
    console.error(`Auto-reload failed for installation ${installationId}:`, err);
    // Mutex will be cleared by the webhook handler on payment_intent.payment_failed
    return false;
  }
}
