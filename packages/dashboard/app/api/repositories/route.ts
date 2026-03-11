import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDashboardStore } from "@/lib/store";
import {
  fetchUserInstallations,
  fetchInstallationReposPage,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";

/**
 * GET /api/repositories?installation_id=<id>&page=<n>&per_page=<n>
 *
 * Returns a single page of repos enriched with monitored flags and review stats.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  const installationIdParam = req.nextUrl.searchParams.get("installation_id");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const perPage = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("per_page") ?? "30")));

  if (!installationIdParam) {
    return NextResponse.json({ error: "installation_id is required" }, { status: 400 });
  }

  try {
    const userInstallations = await fetchUserInstallations(accessToken);
    const installation = userInstallations.find((i) => String(i.id) === installationIdParam);
    if (!installation) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    // Fetch one page of repos from GitHub
    const { repos: ghRepos, totalCount, hasMore } = await fetchInstallationReposPage(
      accessToken,
      installation.id,
      page,
      perPage,
    );

    const store = await getDashboardStore();

    // Fetch monitored flags + config from store
    const monitoredMap = new Map<string, boolean>();
    const configMap = new Map<string, boolean>();

    try {
      const items = await store.installations.listByInstallation(installationIdParam);
      for (const item of items) {
        monitoredMap.set(item.repoFullName, item.monitored === true);
        const cfg = item.config;
        configMap.set(
          item.repoFullName,
          cfg != null && typeof cfg === "object" && Object.keys(cfg).length > 0,
        );
      }
    } catch {
      // Store error — defaults apply
    }

    // Fetch review stats for this page's repos
    const repoNames = ghRepos.map((r) => r.repoFullName);
    const statsMap = await store.reviews.getRepoStats(repoNames);

    // Build enriched response
    const repos = ghRepos.map((r) => {
      const stats = statsMap.get(r.repoFullName);
      return {
        fullName: r.repoFullName,
        githubUrl: r.htmlUrl,
        language: r.language,
        isPrivate: r.isPrivate,
        enabled: monitoredMap.get(r.repoFullName) ?? false,
        reviewCount: stats?.reviewCount ?? 0,
        issueCount: stats?.issueCount ?? 0,
        lastReviewedAt: stats?.lastReviewedAt ?? null,
        hasConfig: configMap.get(r.repoFullName) ?? false,
        installationId: installationIdParam,
      };
    });

    // Compute active/paused counts from full store data (covers all repos, not just this page)
    let activeCount = 0;
    monitoredMap.forEach((monitored) => {
      if (monitored) activeCount++;
    });
    const pausedCount = totalCount - activeCount;

    return NextResponse.json({
      repos,
      totalCount,
      page,
      hasMore,
      activeCount,
      pausedCount,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/repositories] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/repositories
 *
 * Admin-only: toggle a repo's monitored status.
 * Accepts { installationId, repoFullName, enabled }.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  const body = await req.json();
  const installationId: string = String(body.installationId);
  const repoFullName: string = body.repoFullName;
  const enabled: boolean = body.enabled;

  if (!installationId || !repoFullName || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "installationId, repoFullName, and enabled (boolean) are required" },
      { status: 400 },
    );
  }

  // Verify admin access
  let userInstallations;
  try {
    userInstallations = await fetchUserInstallations(accessToken);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    throw err;
  }

  const installation = userInstallations.find((i) => String(i.id) === installationId);
  if (!installation) {
    return NextResponse.json({ error: "Installation not found" }, { status: 404 });
  }

  const isAdmin = await checkInstallationAdmin(accessToken, installation);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const store = await getDashboardStore();
  await store.installations.updateMonitored(installationId, repoFullName, enabled);

  return NextResponse.json({ ok: true });
}
