/**
 * Shared access control helpers for dashboard routes and pages.
 *
 * Every route that returns repo-scoped data MUST verify the user has access
 * to the repo via the GitHub API — not via the store. The store contains ALL
 * repos in an installation, but a user may only have access to a subset
 * (e.g., different GitHub permission levels within the same org).
 */

import {
  fetchUserInstallations,
  fetchAccessibleRepoNames,
  TokenExpiredError,
} from "@/lib/github-repos";

/**
 * Build the set of repo full names the user can actually access via GitHub.
 *
 * Uses the GitHub API (GET /user/installations/{id}/repositories) which
 * only returns repos visible to the authenticated user — not all repos
 * in the installation.
 */
export async function getAccessibleRepos(
  accessToken: string,
): Promise<Set<string>> {
  const installations = await fetchUserInstallations(accessToken);
  if (installations.length === 0) return new Set();

  const sets = await Promise.all(
    installations.map((inst) => fetchAccessibleRepoNames(accessToken, inst.id)),
  );

  const repos = new Set<string>();
  for (const set of sets) {
    set.forEach((name) => repos.add(name));
  }

  return repos;
}

/**
 * Check if the user has access to a specific repo via GitHub.
 *
 * For single-repo checks this is more efficient than getAccessibleRepos()
 * because it makes a single targeted API call.
 */
export async function canAccessRepo(
  accessToken: string,
  repoFullName: string,
): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    },
  );

  if (res.status === 401 || res.status === 403) {
    throw new TokenExpiredError();
  }

  return res.ok;
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
