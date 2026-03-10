/**
 * Provider-agnostic GitHub auth interface.
 *
 * Implementations:
 *   - SSMGitHubAuthProvider (packages/lambda) — reads credentials from AWS SSM
 *   - Future: EnvGitHubAuthProvider — reads credentials from environment variables
 */

import type { Octokit } from '@octokit/rest';

export interface IGitHubAuthProvider {
  getInstallationOctokit(installationId: number): Promise<Octokit>;
}
