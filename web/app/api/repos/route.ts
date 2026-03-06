import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Fetch all pages from a paginated GitHub API endpoint. */
async function fetchAllPages(url: string, accessToken: string): Promise<any[]> {
  const items: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });

    if (!res.ok) break;

    const data = await res.json();
    // The repos endpoint nests under "repositories", installations under "installations"
    const list = data.repositories ?? data.installations ?? data;
    if (Array.isArray(list)) {
      items.push(...list);
    }

    // Parse Link header for next page
    const link: string = res.headers.get("link") ?? "";
    const match: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = match ? match[1] : null;
  }

  return items;
}

/**
 * GET /api/repos
 *
 * Returns all repositories the authenticated user has connected
 * via the MergeWatch GitHub App. Handles pagination automatically.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  try {
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
      return NextResponse.json({ repos: [], debug: { step: "installations", status: installationsRes.status } });
    }

    const data = await installationsRes.json();
    const installations = data.installations ?? [];

    const repos: { repoFullName: string; installedAt: string; installationId: string }[] = [];

    for (const installation of installations) {
      const allRepos = await fetchAllPages(
        `https://api.github.com/user/installations/${installation.id}/repositories?per_page=100`,
        accessToken,
      );

      for (const repo of allRepos) {
        repos.push({
          repoFullName: repo.full_name,
          installedAt: installation.created_at ?? "",
          installationId: String(installation.id),
        });
      }
    }

    // Sort alphabetically for consistent ordering
    repos.sort((a, b) => a.repoFullName.localeCompare(b.repoFullName));

    return NextResponse.json({ repos });
  } catch (err) {
    console.error("[/api/repos] unexpected error:", err);
    return NextResponse.json({ repos: [] });
  }
}
