import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

  try {
    const installationsRes = await fetch(
      "https://api.github.com/user/installations",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!installationsRes.ok) {
      return NextResponse.json({ repos: [] });
    }

    const data = await installationsRes.json();
    const repos: { repoFullName: string; installedAt: string; installationId: string }[] = [];

    for (const installation of data.installations ?? []) {
      const reposRes = await fetch(
        `https://api.github.com/user/installations/${installation.id}/repositories`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
        },
      );

      if (reposRes.ok) {
        const reposData = await reposRes.json();
        for (const repo of reposData.repositories ?? []) {
          repos.push({
            repoFullName: repo.full_name,
            installedAt: installation.created_at ?? "",
            installationId: String(installation.id),
          });
        }
      }
    }

    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json({ repos: [] });
  }
}
