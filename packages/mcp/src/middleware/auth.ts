/**
 * API-key authentication middleware for the MCP server.
 *
 * Transport layers (Lambda Function URL, Express) call resolveApiKey() with the
 * incoming Authorization header, then pass the AuthResolution into tool handlers.
 * No auth logic lives in the MCP server itself.
 */

import { createHash } from 'node:crypto';
import type { IApiKeyStore } from '@mergewatch/core';

/** Raw-key prefix for live MergeWatch secret keys. */
export const API_KEY_PREFIX = 'mw_sk_live_';

export type AuthErrorCode = 'missing' | 'invalid' | 'revoked';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthResolution {
  installationId: string;
  /** Either 'all' or a list of owner/repo strings this key can access. */
  scope: 'all' | string[];
  /** sha256 hex of the raw key — never surface the raw key beyond this layer. */
  keyHash: string;
}

/** sha256-hex a raw API key. */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Extract the raw key from a "Bearer <key>" header. Throws AuthError on bad shape. */
export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader || !authHeader.trim()) {
    throw new AuthError('missing', 'Authorization header is required');
  }
  const match = authHeader.trim().match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new AuthError('invalid', 'Authorization header must be "Bearer <token>"');
  }
  const token = match[1];
  if (!token.startsWith(API_KEY_PREFIX)) {
    throw new AuthError('invalid', 'Invalid API key format');
  }
  return token;
}

/**
 * Resolve a Bearer token to an installation + scope. Fires off a non-blocking
 * lastUsedAt update — failures there don't fail the request.
 */
export async function resolveApiKey(
  authHeader: string | undefined,
  apiKeyStore: IApiKeyStore,
): Promise<AuthResolution> {
  const rawKey = extractBearerToken(authHeader);
  const keyHash = hashApiKey(rawKey);
  const record = await apiKeyStore.getByHash(keyHash);
  if (!record) {
    throw new AuthError('revoked', 'API key not found or revoked');
  }

  // Fire-and-forget: don't block the request on a side-effect write.
  void apiKeyStore
    .touchLastUsed(keyHash, new Date().toISOString())
    .catch((err) => {
      console.warn('[mcp-auth] touchLastUsed failed:', err);
    });

  return {
    installationId: record.installationId,
    scope: record.scope,
    keyHash,
  };
}

/** True when the resolved key can access the given owner/repo. */
export function isRepoInScope(auth: AuthResolution, ownerRepo: string): boolean {
  if (auth.scope === 'all') return true;
  return auth.scope.includes(ownerRepo);
}
