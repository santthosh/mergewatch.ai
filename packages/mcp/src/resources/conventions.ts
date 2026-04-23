/**
 * mergewatch://conventions/{owner}/{repo} resource handler.
 *
 * Serves the repo's conventions markdown (AGENTS.md / CONVENTIONS.md / the
 * configured conventions: path) so MCP clients can inspect what MergeWatch
 * would inject into agent prompts.
 */

import { fetchConventions } from '@mergewatch/core';
import type { AuthResolution } from '../middleware/auth.js';
import { isRepoInScope } from '../middleware/auth.js';
import type { McpServerDeps } from '../server-deps.js';

export const CONVENTIONS_URI_PREFIX = 'mergewatch://conventions/';

export interface ConventionsResourceOutput {
  uri: string;
  found: boolean;
  mimeType: 'text/markdown';
  /** Empty string when found=false. */
  text: string;
  /** Source path in the repo when found=true. */
  sourcePath?: string;
  /** True when the file exceeded the size cap and was truncated. */
  truncated?: boolean;
}

/** Parse `mergewatch://conventions/{owner}/{repo}` into owner + repo. */
export function parseConventionsUri(uri: string): { owner: string; repo: string } | null {
  if (!uri.startsWith(CONVENTIONS_URI_PREFIX)) return null;
  const path = uri.slice(CONVENTIONS_URI_PREFIX.length);
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

export async function handleConventionsResource(
  uri: string,
  deps: McpServerDeps,
  authContext: AuthResolution,
): Promise<ConventionsResourceOutput> {
  const parsed = parseConventionsUri(uri);
  if (!parsed) {
    throw new Error(`Invalid conventions URI: ${uri}`);
  }
  const repoFullName = `${parsed.owner}/${parsed.repo}`;
  if (!isRepoInScope(authContext, repoFullName)) {
    throw new Error(`conventions: API key scope does not grant access to ${repoFullName}`);
  }

  const octokit = await deps.authProvider.getInstallationOctokit(Number(authContext.installationId));
  const loaded = await fetchConventions(octokit, parsed.owner, parsed.repo, undefined).catch(
    () => null,
  );

  if (!loaded) {
    return { uri, found: false, mimeType: 'text/markdown', text: '' };
  }
  return {
    uri,
    found: true,
    mimeType: 'text/markdown',
    text: loaded.content,
    sourcePath: loaded.sourcePath,
    truncated: loaded.truncated,
  };
}
