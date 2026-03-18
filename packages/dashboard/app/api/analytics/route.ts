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
 * GET /api/analytics?installation_id=<id>
 *
 * Returns aggregated analytics data for repos the user has access to.
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
  const repoParam = sp.get("repo") ?? undefined;

  // Validate date parameters
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
  const rawStart = sp.get("start_date");
  const rawEnd = sp.get("end_date");
  const startDate = rawStart && isoDateRegex.test(rawStart) ? rawStart : undefined;
  const endDate = rawEnd && isoDateRegex.test(rawEnd) ? rawEnd : undefined;

  try {
    const userInstallations = await fetchUserInstallations(accessToken);
    if (userInstallations.length === 0) {
      return NextResponse.json({ analytics: null });
    }

    const targetInstallations = installationIdParam
      ? userInstallations.filter((i) => String(i.id) === installationIdParam)
      : userInstallations;

    const store = await getDashboardStore();

    // Get repos the user can actually access via GitHub API, then intersect
    // with monitored repos from the store.
    const githubAccessible = await Promise.all(
      targetInstallations.map((inst) => fetchAccessibleRepoNames(accessToken, inst.id)),
    );
    const userRepoNames = new Set<string>();
    for (const set of githubAccessible) {
      set.forEach((name) => userRepoNames.add(name));
    }

    const accessibleRepos = new Set<string>();
    for (const installation of targetInstallations) {
      const items = await store.installations.listByInstallation(String(installation.id));
      for (const item of items) {
        if (item.monitored === true && userRepoNames.has(item.repoFullName)) {
          accessibleRepos.add(item.repoFullName);
        }
      }
    }

    if (accessibleRepos.size === 0) {
      return NextResponse.json({ analytics: null, availableRepos: [] });
    }

    const allRepos = Array.from(accessibleRepos).sort();
    const targetRepos = repoParam
      ? allRepos.filter((r) => r === repoParam)
      : allRepos;

    // Fetch up to 500 reviews for aggregation (with optional date filter)
    const result = await store.reviews.listReviews(targetRepos, 500, undefined, undefined, startDate, endDate);
    const reviews = result.items;

    // --- Aggregate analytics in-memory ---

    // Score trend: average mergeScore per day
    const scoreByDate = new Map<string, { sum: number; count: number }>();
    // Severity breakdown
    const severityBreakdown: Record<string, number> = { critical: 0, warning: 0, info: 0 };
    // Duration stats
    const durations: number[] = [];
    // Repo breakdown
    const repoBreakdown = new Map<string, number>();
    // Category breakdown
    const categoryBreakdown: Record<string, number> = { security: 0, bug: 0, style: 0 };
    // Totals
    let totalFindings = 0;
    let mergeScoreSum = 0;
    let mergeScoreCount = 0;
    // Status counts
    const statusCounts: Record<string, number> = { complete: 0, failed: 0, skipped: 0, pending: 0, in_progress: 0 };
    // Findings-per-review trend
    const findingsByDate = new Map<string, { sum: number; count: number }>();
    // Merge score distribution (1-5)
    const mergeScoreDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const review of reviews) {
      // Status counts
      if (review.status && statusCounts[review.status] !== undefined) {
        statusCounts[review.status]++;
      }

      // Score trend
      if (review.createdAt && review.mergeScore != null) {
        const date = review.createdAt.substring(0, 10); // YYYY-MM-DD
        const entry = scoreByDate.get(date) ?? { sum: 0, count: 0 };
        entry.sum += review.mergeScore;
        entry.count += 1;
        scoreByDate.set(date, entry);
        mergeScoreSum += review.mergeScore;
        mergeScoreCount += 1;

        // Merge score distribution
        const rounded = Math.round(review.mergeScore);
        if (rounded >= 1 && rounded <= 5) {
          mergeScoreDistribution[rounded]++;
        }
      }

      // Severity and category from findings
      if (review.findings && Array.isArray(review.findings)) {
        totalFindings += review.findings.length;
        for (const finding of review.findings) {
          if (finding.severity && severityBreakdown[finding.severity] !== undefined) {
            severityBreakdown[finding.severity]++;
          }
          if (finding.category && categoryBreakdown[finding.category] !== undefined) {
            categoryBreakdown[finding.category]++;
          }
        }
      }

      // Findings-per-review trend (only completed reviews)
      if (review.createdAt && review.status === "complete") {
        const date = review.createdAt.substring(0, 10);
        const fc = review.findingCount ?? 0;
        const entry = findingsByDate.get(date) ?? { sum: 0, count: 0 };
        entry.sum += fc;
        entry.count += 1;
        findingsByDate.set(date, entry);
      }

      // Duration stats
      if (review.durationMs != null && review.status === "complete") {
        durations.push(review.durationMs);
      }

      // Repo breakdown
      const repoCount = repoBreakdown.get(review.repoFullName) ?? 0;
      repoBreakdown.set(review.repoFullName, repoCount + 1);
    }

    // Compute score trend sorted by date
    const scoreTrend = Array.from(scoreByDate.entries())
      .map(([date, { sum, count }]) => ({
        date,
        avgScore: Math.round((sum / count) * 100) / 100,
        count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Duration statistics
    durations.sort((a, b) => a - b);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;
    const p95Duration = durations.length > 0
      ? durations[Math.floor(durations.length * 0.95)]
      : 0;

    const analytics = {
      totalReviews: reviews.length,
      totalFindings,
      avgMergeScore: mergeScoreCount > 0
        ? Math.round((mergeScoreSum / mergeScoreCount) * 100) / 100
        : 0,
      scoreTrend,
      severityBreakdown,
      durationStats: {
        avgMs: avgDuration,
        p95Ms: p95Duration,
        count: durations.length,
      },
      repoBreakdown: Array.from(repoBreakdown.entries())
        .map(([repo, count]) => ({ repo, count }))
        .sort((a, b) => b.count - a.count),
      categoryBreakdown,
      statusCounts,
      findingsPerReviewTrend: Array.from(findingsByDate.entries())
        .map(([date, { sum, count }]) => ({
          date,
          avgFindings: Math.round((sum / count) * 100) / 100,
          count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      mergeScoreDistribution,
    };

    return NextResponse.json({ analytics, availableRepos: allRepos });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/analytics] error:", err);
    return NextResponse.json({ analytics: null });
  }
}
