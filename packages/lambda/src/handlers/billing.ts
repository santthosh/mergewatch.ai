/**
 * AWS Lambda handler for MergeWatch billing operations.
 *
 * Routes:
 *   POST /billing/setup   — Create Stripe Customer + Checkout Session (card setup)
 *   GET  /billing/success  — Redirect to dashboard after successful setup
 *   POST /billing/topup    — Charge saved card and credit balance
 *   POST /billing/webhook  — Stripe webhook events
 *   GET  /billing/status   — Return billing state for dashboard
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  getStripe,
  ensureStripeCustomer,
  createSetupSession,
  createTopUp,
  getBillingFields,
  updateBillingFields,
  closeBillingIssue,
  FREE_REVIEW_LIMIT,
} from '@mergewatch/billing';
import { SSMGitHubAuthProvider } from '../github-auth-ssm.js';

// -- Singletons ---------------------------------------------------------------

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const INSTALLATIONS_TABLE = process.env.INSTALLATIONS_TABLE ?? 'mergewatch-installations';
const DASHBOARD_BASE_URL = process.env.DASHBOARD_BASE_URL ?? 'https://mergewatch.ai';

const authProvider = new SSMGitHubAuthProvider();
const BILLING_API_SECRET = process.env.BILLING_API_SECRET;

// -- Helpers ------------------------------------------------------------------

function json(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function redirect(url: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: '',
  };
}

/**
 * Verify the request carries a valid Bearer token matching BILLING_API_SECRET.
 * This ensures only the dashboard proxy (which adds the token after NextAuth + GitHub
 * admin checks) can call billing endpoints. Webhook route uses Stripe signature instead.
 */
function verifyBillingAuth(event: APIGatewayProxyEventV2): boolean {
  if (!BILLING_API_SECRET) {
    console.warn('[billing] BILLING_API_SECRET not set — rejecting all non-webhook requests');
    return false;
  }
  const authHeader = event.headers['authorization'] ?? '';
  return authHeader === `Bearer ${BILLING_API_SECRET}`;
}

// -- Route handlers -----------------------------------------------------------

async function handleSetup(body: Record<string, unknown>): Promise<APIGatewayProxyResultV2> {
  const installationId = body.installationId as string | undefined;
  if (!installationId) {
    return json(400, { error: 'installationId is required' });
  }

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(stripe, dynamodb, INSTALLATIONS_TABLE, installationId);
  const returnUrl = `${DASHBOARD_BASE_URL}/dashboard/billing`;
  const checkoutUrl = await createSetupSession(stripe, customerId, returnUrl);

  return json(200, { url: checkoutUrl });
}

async function handleSuccess(): Promise<APIGatewayProxyResultV2> {
  return redirect(`${DASHBOARD_BASE_URL}/dashboard/billing?setup=complete`);
}

async function handleTopUp(body: Record<string, unknown>): Promise<APIGatewayProxyResultV2> {
  const installationId = body.installationId as string | undefined;
  const amountCents = body.amountCents as number | undefined;

  if (!installationId || !amountCents || amountCents < 100) {
    return json(400, { error: 'installationId and amountCents (>= 100) are required' });
  }

  const stripe = getStripe();
  const { paymentIntentId, newBalanceCents } = await createTopUp(
    stripe, dynamodb, INSTALLATIONS_TABLE, installationId, amountCents,
  );

  // Close billing issue if one is open
  const fields = await getBillingFields(dynamodb, INSTALLATIONS_TABLE, installationId);
  if (fields.blockIssueNumber && fields.blockIssueRepo) {
    try {
      const octokit = await authProvider.getInstallationOctokit(Number(installationId));
      await closeBillingIssue(octokit, installationId, dynamodb, INSTALLATIONS_TABLE, fields.blockIssueNumber, fields.blockIssueRepo);
    } catch (err) {
      console.warn('Failed to close billing issue after top-up:', err);
    }
  }

  return json(200, { paymentIntentId, newBalanceCents });
}

async function handleWebhook(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const stripe = getStripe();
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret || !event.body) {
    return json(400, { error: 'Missing stripe-signature header, webhook secret, or request body' });
  }

  // API Gateway HttpApi may base64-encode the body
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return json(400, { error: 'Invalid signature' });
  }

  switch (stripeEvent.type) {
    case 'customer.updated': {
      // Sync balance from Stripe to DynamoDB
      const customer = stripeEvent.data.object as any;
      if (!customer) break;
      const installationId = customer.metadata?.mergewatchInstallationId;
      if (installationId) {
        // Stripe balance is negative for credits, we store as positive cents
        const balanceCents = Math.abs(customer.balance ?? 0);
        await updateBillingFields(dynamodb, INSTALLATIONS_TABLE, installationId, { balanceCents });
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const pi = stripeEvent.data.object as any;
      if (!pi) break;
      const installationId = pi.metadata?.mergewatchInstallationId;
      if (installationId && pi.metadata?.type === 'auto-reload') {
        await updateBillingFields(dynamodb, INSTALLATIONS_TABLE, installationId, {
          autoReloadInFlight: false,
        });
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = stripeEvent.data.object as any;
      if (!pi) break;
      const installationId = pi.metadata?.mergewatchInstallationId;
      if (installationId && pi.metadata?.type === 'auto-reload') {
        await updateBillingFields(dynamodb, INSTALLATIONS_TABLE, installationId, {
          autoReloadInFlight: false,
        });
        console.warn(`Auto-reload payment failed for installation ${installationId}`);
      }
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${stripeEvent.type}`);
  }

  return json(200, { received: true });
}

async function handleStatus(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const installationId = event.queryStringParameters?.installationId;
  if (!installationId) {
    return json(400, { error: 'installationId query parameter is required' });
  }

  const fields = await getBillingFields(dynamodb, INSTALLATIONS_TABLE, installationId);

  const stripe = getStripe();
  let hasPaymentMethod = false;

  if (fields.stripeCustomerId) {
    try {
      const methods = await stripe.paymentMethods.list({
        customer: fields.stripeCustomerId,
        type: 'card',
        limit: 1,
      });
      hasPaymentMethod = methods.data.length > 0;
    } catch {
      // Non-critical
    }
  }

  return json(200, {
    freeReviewsUsed: fields.freeReviewsUsed ?? 0,
    freeReviewLimit: FREE_REVIEW_LIMIT,
    balanceCents: fields.balanceCents ?? 0,
    hasPaymentMethod,
    stripeCustomerId: fields.stripeCustomerId ?? null,
    autoReloadEnabled: fields.autoReloadEnabled ?? false,
    autoReloadThresholdCents: fields.autoReloadThresholdCents ?? null,
    autoReloadAmountCents: fields.autoReloadAmountCents ?? null,
    blockedAt: fields.blockedAt ?? null,
    totalBilledCents: fields.totalBilledCents ?? 0,
    prCount: fields.prCount ?? 0,
    prTimestamps: fields.prTimestamps ?? [],
  });
}

async function handleAutoReload(body: Record<string, unknown>): Promise<APIGatewayProxyResultV2> {
  const installationId = body.installationId as string | undefined;
  const enabled = body.enabled as boolean | undefined;
  const thresholdCents = body.thresholdCents as number | undefined;
  const amountCents = body.amountCents as number | undefined;

  if (!installationId || typeof enabled !== 'boolean') {
    return json(400, { error: 'installationId and enabled are required' });
  }

  if (enabled && (!thresholdCents || !amountCents || thresholdCents < 100 || amountCents < 500)) {
    return json(400, { error: 'thresholdCents (>= 100) and amountCents (>= 500) required when enabling' });
  }

  await updateBillingFields(dynamodb, INSTALLATIONS_TABLE, installationId, {
    autoReloadEnabled: enabled,
    autoReloadThresholdCents: enabled ? thresholdCents : undefined,
    autoReloadAmountCents: enabled ? amountCents : undefined,
    autoReloadInFlight: false,
  });

  return json(200, { ok: true });
}

// -- Main handler (path-based routing) ----------------------------------------

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath?.replace(/\/+$/, '') ?? '';
  const method = event.requestContext?.http?.method ?? 'GET';

  console.log(`Billing handler: ${method} ${path}`);

  try {
    // Parse body for POST requests
    let body: Record<string, unknown> = {};
    if (method === 'POST' && event.body) {
      // Don't parse webhook body — it needs the raw string for signature verification
      if (!path.endsWith('/webhook')) {
        try {
          body = JSON.parse(event.body);
        } catch {
          return json(400, { error: 'Invalid JSON body' });
        }
      }
    }

    // Webhook uses Stripe signature auth; success is a harmless redirect.
    // All other routes require Bearer token from the dashboard proxy.
    if (method === 'POST' && path.endsWith('/webhook')) {
      return await handleWebhook(event);
    }

    if (method === 'GET' && path.endsWith('/success')) {
      return await handleSuccess();
    }

    // Auth gate — only the dashboard proxy should reach these
    if (!verifyBillingAuth(event)) {
      return json(401, { error: 'Unauthorized' });
    }

    if (method === 'POST' && path.endsWith('/setup')) {
      return await handleSetup(body);
    }

    if (method === 'POST' && path.endsWith('/topup')) {
      return await handleTopUp(body);
    }

    if (method === 'GET' && path.endsWith('/status')) {
      return await handleStatus(event);
    }

    if (method === 'POST' && path.endsWith('/auto-reload')) {
      return await handleAutoReload(body);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Billing handler error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
