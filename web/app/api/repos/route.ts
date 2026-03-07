import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  fetchUserInstallations,
  fetchInstallationRepos,
  TokenExpiredError,
} from "@/lib/github-repos";

export const dynamic = "force-dynamic";

/**
 * GET /api/repos?q=<search>&installation_id=<id>
 *
 * Returns repositories the user has connected via the MergeWatch GitHub App.
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

  const query = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";
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

    const allRepos: { repoFullName: string; installedAt: string; installationId: string }[] = [];

    for (const installation of targetInstallations) {
      const { repos } = await fetchInstallationRepos(
        accessToken,
        installation.id,
        query,
      );
      allRepos.push(...repos);
    }

    allRepos.sort((a, b) => a.repoFullName.localeCompare(b.repoFullName));

    return NextResponse.json({
      repos: allRepos,
      totalCount: allRepos.length,
      hasMore: false,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/repos] unexpected error:", err);
    return NextResponse.json({ repos: [], totalCount: 0, hasMore: false });
  }
}
