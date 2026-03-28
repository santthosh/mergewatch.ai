/**
 * SSM Parameter Store helpers for billing secrets.
 *
 * Reads secrets at runtime (not via CloudFormation env var references)
 * because CloudFormation doesn't support ssm-secure in Lambda env vars.
 * Values are cached for the lifetime of the Lambda container.
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const cache: Record<string, string> = {};

async function getSSMParameter(name: string): Promise<string> {
  if (cache[name]) return cache[name];

  const response = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter "${name}" not found or empty`);
  }

  cache[name] = value;
  return value;
}

const stage = process.env.STAGE ?? 'prod';

export async function getStripeSecretKey(): Promise<string> {
  return getSSMParameter(`/mergewatch/${stage}/stripe-secret-key`);
}

export async function getStripeWebhookSecret(): Promise<string> {
  return getSSMParameter(`/mergewatch/${stage}/stripe-webhook-secret`);
}

export async function getBillingApiSecret(): Promise<string> {
  return getSSMParameter(`/mergewatch/${stage}/billing-api-secret`);
}
