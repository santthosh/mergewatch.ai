import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDashboardStore } from "@/lib/store";
import {
  fetchUserInstallations,
  fetchAccessibleRepoNames,
  TokenExpiredError,
} from "@/lib/github-repos";

export const dynamic = "force-dynamic";

/**
 * GET /api/reviews?installation_id=<id>&status=<status>&repo=<repoFullName>&cursor=<base64>&limit=<n>
 *
 * Returns paginated reviews for repos the user has access to.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const installationIdParam = sp.get("installation_id");
  const statusFilter = sp.get("status") || undefined;
  const repoFilter = sp.get("repo");
  const limit = Math.min(Number(sp.get("limit") ?? 25), 100);
  const cursorParam = sp.get("cursor") || undefined;

  try {
    const userInstallations = await fetchUserInstallations(accessToken);
    if (userInstallations.length === 0) {
      return NextResponse.json({ reviews: [], nextCursor: null });
    }

    const targetInstallations = installationIdParam
      ? userInstallations.filter((i) => String(i.id) === installationIdParam)
      : userInstallations;

    const store = await getDashboardStore();

    // Get repos the user can actually access via GitHub API.
    // The GitHub API only returns repos visible to the authenticated user,
    // preventing cross-repo data leaks.
    const githubAccessible = await Promise.all(
      targetInstallations.map((inst) => fetchAccessibleRepoNames(accessToken, inst.id)),
    );
    const userRepoNames = new Set<string>();
    for (const set of githubAccessible) {
      set.forEach((name) => userRepoNames.add(name));
    }

    if (userRepoNames.size === 0) {
      return NextResponse.json({ reviews: [], nextCursor: null, stats: { total: 0, completed: 0, findings: 0 } });
    }

    if (repoFilter && !userRepoNames.has(repoFilter)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetRepos = repoFilter ? [repoFilter] : Array.from(userRepoNames);

    // Fetch stats and reviews in parallel
    const [stats, result] = await Promise.all([
      store.reviews.getReviewStats(targetRepos),
      store.reviews.listReviews(targetRepos, limit, cursorParam, statusFilter),
    ]);

    const reviews = result.items.map((item) => {
      const prNumberCommitSha = String(item.prNumberCommitSha);
      const prNumber = Number(prNumberCommitSha.split("#")[0]);
      const commitSha = prNumberCommitSha.split("#")[1] ?? "";
      const status = item.status === "complete" ? "completed" : item.status;

      return {
        id: prNumberCommitSha,
        repoFullName: item.repoFullName,
        prNumber,
        commitSha,
        prTitle: item.prTitle ?? "",
        status,
        model: item.model ?? "",
        createdAt: item.createdAt ?? "",
        completedAt: item.completedAt ?? undefined,
        prAuthor: item.prAuthor ?? undefined,
        prAuthorAvatar: item.prAuthorAvatar ?? undefined,
        source: item.source ?? undefined,
        agentKind: item.agentKind ?? undefined,
        headBranch: item.headBranch ?? undefined,
        baseBranch: item.baseBranch ?? undefined,
        findingCount: item.findingCount ?? undefined,
        topSeverity: item.topSeverity ?? undefined,
        durationMs: item.durationMs ?? undefined,
        mergeScore: item.mergeScore ?? undefined,
      };
    });

    return NextResponse.json({
      reviews,
      nextCursor: result.nextCursor,
      stats,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/reviews] error:", err);
    return NextResponse.json({ reviews: [], nextCursor: null });
  }
}
