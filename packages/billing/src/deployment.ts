export type DeploymentMode = 'saas' | 'self-hosted';

/**
 * Read the deployment mode from the DEPLOYMENT_MODE environment variable.
 * Defaults to 'self-hosted' when unset (safe default: billing is never enforced).
 */
export function getDeploymentMode(): DeploymentMode {
  const mode = process.env.DEPLOYMENT_MODE?.toLowerCase();
  if (mode === 'saas') return 'saas';
  return 'self-hosted';
}

/** Returns true when running in SaaS mode (billing enforced). */
export function isSaas(): boolean {
  return getDeploymentMode() === 'saas';
}

/** Returns true when running in self-hosted mode (no billing). */
export function isSelfHosted(): boolean {
  return getDeploymentMode() === 'self-hosted';
}
