import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/repos
 *
 * Returns the list of repositories the authenticated user has connected
 * via the MergeWatch GitHub App, fetched from the GitHub API.
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

  // Debug: identify token type (ghu_ = GitHub App, gho_ = OAuth App)
  console.log("[/api/repos] token prefix:", accessToken.substring(0, 4), "length:", accessToken.length);

  // Verify token works at all by calling /user
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  console.log("[/api/repos] /user status:", userRes.status);
  if (userRes.ok) {
    const userData = await userRes.json();
    console.log("[/api/repos] /user login:", userData.login);
  }

  try {
    const installationsRes = await fetch(
      "https://api.github.com/user/installations",
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
    console.log("[/api/repos] installations count:", data.installations?.length ?? 0);

    const repos: { repoFullName: string; installedAt: string; installationId: string }[] = [];

    for (const installation of data.installations ?? []) {
      const reposRes = await fetch(
        `https://api.github.com/user/installations/${installation.id}/repositories`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        },
      );

      if (reposRes.ok) {
        const reposData = await reposRes.json();
        console.log(`[/api/repos] installation ${installation.id}: ${reposData.total_count ?? 0} repos`);
        for (const repo of reposData.repositories ?? []) {
          repos.push({
            repoFullName: repo.full_name,
            installedAt: installation.created_at ?? "",
            installationId: String(installation.id),
          });
        }
      } else {
        const body = await reposRes.text();
        console.error(`[/api/repos] repos fetch failed for installation ${installation.id}:`, reposRes.status, body);
      }
    }

    console.log("[/api/repos] total repos found:", repos.length);
    return NextResponse.json({ repos });
  } catch (err) {
    console.error("[/api/repos] unexpected error:", err);
    return NextResponse.json({ repos: [] });
  }
}
