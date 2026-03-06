import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RepoResult {
  repoFullName: string;
  installedAt: string;
  installationId: string;
}

/**
 * GET /api/repos?q=<search>&page=1
 *
 * Returns repositories the user has connected via the MergeWatch GitHub App.
 *
 * - No query: returns first page (up to 100 repos)
 * - With q: fetches all repos and filters server-side, returns matches
 *
 * Response: { repos: RepoResult[], totalCount: number, hasMore: boolean }
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

  try {
    // Fetch installations
    const installationsRes = await fetch(
      "https://api.github.com/user/installations?per_page=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      },
    );

    if (!installationsRes.ok) {
      const body = await installationsRes.text();
      console.error("[/api/repos] installations fetch failed:", installationsRes.status, body);
      return NextResponse.json({
        repos: [],
        totalCount: 0,
        hasMore: false,
        debug: { step: "installations", status: installationsRes.status },
      });
    }

    const data = await installationsRes.json();
    const installations = data.installations ?? [];
    console.log("[/api/repos] installations:", JSON.stringify(installations.map((i: any) => ({
      id: i.id,
      account: i.account?.login,
      type: i.account?.type,
      repoSelection: i.repository_selection,
    }))));

    const allRepos: RepoResult[] = [];
    let totalCount = 0;

    for (const installation of installations) {
      console.log(`[/api/repos] fetching repos for installation ${installation.id} (${installation.account?.login})`);
      let nextUrl: string | null =
        `https://api.github.com/user/installations/${installation.id}/repositories?per_page=100`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        });

        if (!res.ok) break;

        const page = await res.json();
        console.log(`[/api/repos] installation ${installation.id}: page returned ${(page.repositories ?? []).length} repos, total_count=${page.total_count}`);
        totalCount = page.total_count ?? totalCount;

        for (const repo of page.repositories ?? []) {
          allRepos.push({
            repoFullName: repo.full_name,
            installedAt: installation.created_at ?? "",
            installationId: String(installation.id),
          });
        }

        // Parse Link header for next page
        const link: string = res.headers.get("link") ?? "";
        const match: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = match ? match[1] : null;
      }
    }

    // Filter by query if provided
    let results = allRepos;
    if (query) {
      results = allRepos.filter((r) =>
        r.repoFullName.toLowerCase().includes(query),
      );
    }

    // Sort alphabetically
    results.sort((a, b) => a.repoFullName.localeCompare(b.repoFullName));

    return NextResponse.json({
      repos: results,
      totalCount: allRepos.length,
      hasMore: false,
    });
  } catch (err) {
    console.error("[/api/repos] unexpected error:", err);
    return NextResponse.json({ repos: [], totalCount: 0, hasMore: false });
  }
}
