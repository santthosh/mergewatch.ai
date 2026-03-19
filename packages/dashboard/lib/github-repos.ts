import { cache } from "react";
import { createHash } from "crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_HEADERS = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/vnd.github+json",
});

/** Hash a token so we never store raw credentials as cache keys. */
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

// --- TTL cache for fetchAccessibleRepoNames (persists across requests in warm containers) ---
const REPO_NAMES_TTL_MS = 60_000; // 60 seconds
const REPO_NAMES_CACHE_MAX = 50;
const repoNamesCache = new Map<string, { data: Set<string>; expiry: number }>();

/** Evict expired entries from a TTL map. */
function evictExpired(map: Map<string, { expiry: number }>) {
  const now = Date.now();
  const expired: string[] = [];
  map.forEach((entry, key) => {
    if (now >= entry.expiry) expired.push(key);
  });
  expired.forEach((key) => map.delete(key));
}

/** Thrown when the GitHub token is expired or revoked. */
export class TokenExpiredError extends Error {
  constructor() {
    super("GitHub token expired");
    this.name = "TokenExpiredError";
  }
}

/** Thrown when a GitHub API call fails due to a network error (timeout, DNS, etc.). */
export class GitHubNetworkError extends Error {
  constructor(cause?: unknown) {
    const msg = cause instanceof Error ? cause.message : "Network error";
    super(`GitHub API unavailable: ${msg}`);
    this.name = "GitHubNetworkError";
    this.cause = cause;
  }
}

export interface Installation {
  id: number;
  account: {
    login: string;
    avatar_url: string;
    type: "User" | "Organization";
  };
  created_at: string;
  permissions: Record<string, string>;
}

export interface RepoResult {
  repoFullName: string;
  installedAt: string;
  installationId: string;
  language: string | null;
  isPrivate: boolean;
  htmlUrl: string;
}

/**
 * Fetch all GitHub App installations accessible to the authenticated user.
 */
async function _fetchUserInstallationsImpl(
  accessToken: string,
): Promise<Installation[]> {
  let res: Response;
  try {
    res = await fetch(
      `${GITHUB_API}/user/installations?per_page=100`,
      { headers: GITHUB_HEADERS(accessToken), cache: "no-store" },
    );
  } catch (err) {
    throw new GitHubNetworkError(err);
  }

  if (res.status === 401 || res.status === 403) {
    throw new TokenExpiredError();
  }

  if (!res.ok) {
    console.error("[github-repos] installations fetch failed:", res.status);
    return [];
  }

  const data = await res.json();
  return (data.installations ?? []).map((i: any) => ({
    id: i.id,
    account: {
      login: i.account?.login ?? "",
      avatar_url: i.account?.avatar_url ?? "",
      type: i.account?.type ?? "User",
    },
    created_at: i.created_at ?? "",
    permissions: i.permissions ?? {},
  }));
}

/** React.cache()-wrapped: deduplicates within a single server render pass. */
export const fetchUserInstallations = cache(_fetchUserInstallationsImpl);

/**
 * Fetch repos for a specific installation. Supports optional search query.
 */
export async function fetchInstallationRepos(
  accessToken: string,
  installationId: number,
  query?: string,
): Promise<{ repos: RepoResult[]; totalCount: number }> {
  const allRepos: RepoResult[] = [];
  let totalCount = 0;
  let nextUrl: string | null =
    `${GITHUB_API}/user/installations/${installationId}/repositories?per_page=100`;

  while (nextUrl) {
    let res: Response;
    try {
      res = await fetch(nextUrl, {
        headers: GITHUB_HEADERS(accessToken),
        cache: "no-store",
      });
    } catch (err) {
      throw new GitHubNetworkError(err);
    }

    if (!res.ok) break;

    const page = await res.json();
    totalCount = page.total_count ?? totalCount;

    for (const repo of page.repositories ?? []) {
      allRepos.push({
        repoFullName: repo.full_name,
        installedAt: repo.created_at ?? "",
        installationId: String(installationId),
        language: repo.language ?? null,
        isPrivate: repo.private ?? false,
        htmlUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
      });
    }

    const link: string = res.headers.get("link") ?? "";
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = match ? match[1] : null;
  }

  let results = allRepos;
  if (query) {
    const q = query.toLowerCase();
    results = allRepos.filter((r) => r.repoFullName.toLowerCase().includes(q));
  }

  results.sort((a, b) => a.repoFullName.localeCompare(b.repoFullName));

  return { repos: results, totalCount };
}

/**
 * Fetch a single page of repos for an installation.
 * Returns repos + whether there are more pages.
 */
export async function fetchInstallationReposPage(
  accessToken: string,
  installationId: number,
  page: number = 1,
  perPage: number = 30,
): Promise<{ repos: RepoResult[]; totalCount: number; hasMore: boolean }> {
  const url = `${GITHUB_API}/user/installations/${installationId}/repositories?per_page=${perPage}&page=${page}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: GITHUB_HEADERS(accessToken),
      cache: "no-store",
    });
  } catch (err) {
    throw new GitHubNetworkError(err);
  }

  if (res.status === 401 || res.status === 403) {
    throw new TokenExpiredError();
  }

  if (!res.ok) {
    return { repos: [], totalCount: 0, hasMore: false };
  }

  const data = await res.json();
  const totalCount: number = data.total_count ?? 0;

  const repos: RepoResult[] = (data.repositories ?? []).map((repo: any) => ({
    repoFullName: repo.full_name,
    installedAt: repo.created_at ?? "",
    installationId: String(installationId),
    language: repo.language ?? null,
    isPrivate: repo.private ?? false,
    htmlUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
  }));

  const hasMore = page * perPage < totalCount;
  return { repos, totalCount, hasMore };
}

/**
 * Fetch the full set of repo names the user can access for a given installation.
 * Uses GitHub's paginated API which only returns repos visible to the authenticated user.
 */
async function _fetchAccessibleRepoNamesImpl(
  accessToken: string,
  installationId: number,
): Promise<Set<string>> {
  // Check TTL cache first (persists across requests in warm containers / long-lived processes)
  const cacheKey = `${tokenHash(accessToken)}:${installationId}`;
  const cached = repoNamesCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const names = new Set<string>();
  let nextUrl: string | null =
    `${GITHUB_API}/user/installations/${installationId}/repositories?per_page=100`;

  while (nextUrl) {
    let res: Response;
    try {
      res = await fetch(nextUrl, {
        headers: GITHUB_HEADERS(accessToken),
        cache: "no-store",
      });
    } catch (err) {
      throw new GitHubNetworkError(err);
    }

    if (res.status === 401 || res.status === 403) {
      throw new TokenExpiredError();
    }
    if (!res.ok) break;

    const page = await res.json();
    for (const repo of page.repositories ?? []) {
      names.add(repo.full_name);
    }

    const link: string = res.headers.get("link") ?? "";
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = match ? match[1] : null;
  }

  // Store in TTL cache (evict stale entries first to bound memory)
  evictExpired(repoNamesCache);
  if (repoNamesCache.size >= REPO_NAMES_CACHE_MAX) {
    const oldest = repoNamesCache.keys().next().value!;
    repoNamesCache.delete(oldest);
  }
  repoNamesCache.set(cacheKey, { data: names, expiry: Date.now() + REPO_NAMES_TTL_MS });

  return names;
}

/** React.cache()-wrapped: deduplicates within a single server render pass. */
export const fetchAccessibleRepoNames = cache(_fetchAccessibleRepoNamesImpl);

/**
 * Check if the authenticated user is an admin for the given installation.
 *
 * - Personal account installations: only the account owner is admin.
 * - Org installations: only org admins are considered installation admins.
 */
async function _checkInstallationAdminImpl(
  accessToken: string,
  installation: Installation,
): Promise<boolean> {
  if (installation.account.type === "User") {
    // Personal account — only the owner should be admin.
    // Compare the authenticated user's login against the installation account.
    let res: Response;
    try {
      res = await fetch(`${GITHUB_API}/user`, {
        headers: GITHUB_HEADERS(accessToken),
        cache: "no-store",
      });
    } catch (err) {
      throw new GitHubNetworkError(err);
    }
    if (res.status === 401 || res.status === 403) {
      throw new TokenExpiredError();
    }
    if (!res.ok) return false;
    const user = await res.json();
    return user.login === installation.account.login;
  }

  // For org installations, check user's membership role
  let res: Response;
  try {
    res = await fetch(
      `${GITHUB_API}/user/memberships/orgs/${installation.account.login}`,
      { headers: GITHUB_HEADERS(accessToken), cache: "no-store" },
    );
  } catch (err) {
    throw new GitHubNetworkError(err);
  }

  if (res.status === 401 || res.status === 403) {
    throw new TokenExpiredError();
  }
  if (!res.ok) return false;

  const membership = await res.json();
  return membership.role === "admin";
}

/**
 * React.cache()-wrapped admin check.
 * We store the latest Installation per id so the cache() wrapper only receives
 * primitive args (reference-equality safe). The map is cleared before each
 * write to avoid unbounded growth — only the current render's installations
 * are kept.
 */
let _lastInstallation: { id: number; inst: Installation } | null = null;

const _checkAdminCached = cache(
  async (accessToken: string, installationId: number): Promise<boolean> => {
    if (!_lastInstallation || _lastInstallation.id !== installationId) return false;
    return _checkInstallationAdminImpl(accessToken, _lastInstallation.inst);
  },
);

export async function checkInstallationAdmin(
  accessToken: string,
  installation: Installation,
): Promise<boolean> {
  _lastInstallation = { id: installation.id, inst: installation };
  return _checkAdminCached(accessToken, installation.id);
}
