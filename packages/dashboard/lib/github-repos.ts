const GITHUB_API = "https://api.github.com";
const GITHUB_HEADERS = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/vnd.github+json",
});

/** Thrown when the GitHub token is expired or revoked. */
export class TokenExpiredError extends Error {
  constructor() {
    super("GitHub token expired");
    this.name = "TokenExpiredError";
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
export async function fetchUserInstallations(
  accessToken: string,
): Promise<Installation[]> {
  const res = await fetch(
    `${GITHUB_API}/user/installations?per_page=100`,
    { headers: GITHUB_HEADERS(accessToken), cache: "no-store" },
  );

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
    const res = await fetch(nextUrl, {
      headers: GITHUB_HEADERS(accessToken),
      cache: "no-store",
    });

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
  const res = await fetch(url, {
    headers: GITHUB_HEADERS(accessToken),
    cache: "no-store",
  });

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
 * Check if the authenticated user is an admin for the given installation.
 *
 * For v1, we check if the user owns the installation account (personal account)
 * or has admin permission on the org.
 */
export async function checkInstallationAdmin(
  accessToken: string,
  installation: Installation,
): Promise<boolean> {
  // Personal account installations — user is always admin
  if (installation.account.type === "User") {
    return true;
  }

  // For org installations, check user's membership role
  const res = await fetch(
    `${GITHUB_API}/user/memberships/orgs/${installation.account.login}`,
    { headers: GITHUB_HEADERS(accessToken), cache: "no-store" },
  );

  if (!res.ok) return false;

  const membership = await res.json();
  return membership.role === "admin";
}
