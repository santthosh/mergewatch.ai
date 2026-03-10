/**
 * AWS SSM-backed GitHub App authentication provider.
 *
 * Extracted from src/github/client.ts — getSSMParameter cache +
 * getInstallationOctokit function.
 *
 * Reads GitHub App credentials (App ID, private key) from AWS SSM
 * Parameter Store at cold-start time and caches them for the lifetime
 * of the Lambda container.
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { IGitHubAuthProvider } from '@mergewatch/core';

const ssm = new SSMClient({});

/** Simple in-memory cache so we only call SSM once per Lambda container. */
const ssmCache: Record<string, string> = {};

/**
 * Fetch a parameter from SSM Parameter Store (with decryption).
 * Results are cached for the lifetime of the process.
 */
async function getSSMParameter(name: string): Promise<string> {
  if (ssmCache[name]) {
    return ssmCache[name];
  }

  const response = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter "${name}" not found or empty`);
  }

  ssmCache[name] = value;
  return value;
}

export class SSMGitHubAuthProvider implements IGitHubAuthProvider {
  constructor(
    private readonly appIdParam: string = process.env.GITHUB_APP_ID_PARAM ?? '/mergewatch/prod/github-app-id',
    private readonly privateKeyParam: string = process.env.GITHUB_PRIVATE_KEY_PARAM ?? '/mergewatch/prod/github-private-key',
  ) {}

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const [appId, privateKey] = await Promise.all([
      getSSMParameter(this.appIdParam),
      getSSMParameter(this.privateKeyParam),
    ]);

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(appId),
        privateKey,
        installationId,
      },
    });
  }
}

/**
 * Load the GitHub webhook secret from SSM Parameter Store.
 * Cached after the first call so cold-start cost is paid only once.
 */
let cachedWebhookSecret: string | undefined;

export async function getWebhookSecret(
  paramName: string = process.env.GITHUB_WEBHOOK_SECRET_PARAM ?? '/mergewatch/prod/github-webhook-secret',
): Promise<string> {
  if (cachedWebhookSecret) return cachedWebhookSecret;

  const value = await getSSMParameter(paramName);
  cachedWebhookSecret = value;
  return value;
}
