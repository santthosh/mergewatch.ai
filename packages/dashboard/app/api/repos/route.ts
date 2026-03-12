import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  fetchUserInstallations,
  fetchInstallationReposPage,
  TokenExpiredError,
} from "@/lib/github-repos";

export const dynamic = "force-dynamic";

const PER_PAGE = 30;

/**
 * GET /api/repos?page=1&per_page=30&installation_id=<id>
 *
 * Returns repositories the user has connected via the MergeWatch GitHub App.
 * Paginated — returns one page at a time with hasMore flag.
 * Optionally filter by installation_id to scope to a single org/account.
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

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const perPage = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("per_page") ?? String(PER_PAGE))));
  const installationIdParam = req.nextUrl.searchParams.get("installation_id");

  try {
    const installations = await fetchUserInstallations(accessToken);

    if (installations.length === 0) {
      return NextResponse.json({ repos: [], totalCount: 0, hasMore: false });
    }

    // Filter to specific installation if requested
    const targetInstallations = installationIdParam
      ? installations.filter((i) => String(i.id) === installationIdParam)
      : installations;

    if (targetInstallations.length === 1) {
      // Single installation — use GitHub pagination directly
      const inst = targetInstallations[0];
      const { repos, totalCount, hasMore } = await fetchInstallationReposPage(
        accessToken,
        inst.id,
        page,
        perPage,
      );
      return NextResponse.json({ repos, totalCount, hasMore });
    }

    // Multiple installations — fetch the requested page from each and merge
    const results = await Promise.all(
      targetInstallations.map((inst) =>
        fetchInstallationReposPage(accessToken, inst.id, page, perPage),
      ),
    );

    const allRepos = results.flatMap((r) => r.repos);
    allRepos.sort((a, b) => a.repoFullName.localeCompare(b.repoFullName));

    const totalCount = results.reduce((sum, r) => sum + r.totalCount, 0);
    const hasMore = results.some((r) => r.hasMore);

    return NextResponse.json({
      repos: allRepos,
      totalCount,
      hasMore,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/repos] unexpected error:", err);
    return NextResponse.json({ repos: [], totalCount: 0, hasMore: false });
  }
}
