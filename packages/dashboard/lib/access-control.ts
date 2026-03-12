/**
 * Shared access control helpers for dashboard routes and pages.
 *
 * Every route that returns repo-scoped data MUST verify the user has access
 * to the repo via their GitHub App installations. The store layer has no
 * knowledge of access control — all checks happen here.
 */

import { getDashboardStore } from "@/lib/store";
import { fetchUserInstallations, TokenExpiredError } from "@/lib/github-repos";

/**
 * Build the set of repo full names the user has access to (monitored repos
 * across all their GitHub App installations).
 *
 * Returns null if the token is invalid/expired.
 */
export async function getAccessibleRepos(
  accessToken: string,
): Promise<Set<string> | null> {
  const installations = await fetchUserInstallations(accessToken);
  if (installations.length === 0) return new Set();

  const store = await getDashboardStore();
  const repos = new Set<string>();

  for (const installation of installations) {
    const items = await store.installations.listByInstallation(
      String(installation.id),
    );
    for (const item of items) {
      repos.add(item.repoFullName);
    }
  }

  return repos;
}

/**
 * Check if the user has access to a specific repo.
 */
export async function canAccessRepo(
  accessToken: string,
  repoFullName: string,
): Promise<boolean> {
  const repos = await getAccessibleRepos(accessToken);
  if (!repos) return false;
  return repos.has(repoFullName);
}

/**
 * Check if the user has access to a specific installation.
 */
export async function canAccessInstallation(
  accessToken: string,
  installationId: string,
): Promise<boolean> {
  const installations = await fetchUserInstallations(accessToken);
  return installations.some((i) => String(i.id) === installationId);
}

export { TokenExpiredError };
