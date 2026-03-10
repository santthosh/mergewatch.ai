import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface AccountInfo {
  login: string;
  type: "User" | "Organization";
  avatarUrl: string;
  installed: boolean;
}

/**
 * GET /api/installations
 *
 * Returns the user's accounts (personal + orgs) and whether the
 * MergeWatch GitHub App is installed on each.
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

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
  };

  try {
    // Fetch user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers,
      cache: "no-store",
    });
    if (!userRes.ok) {
      return NextResponse.json({ accounts: [] });
    }
    const user = await userRes.json();

    // Fetch user's orgs
    const orgsRes = await fetch("https://api.github.com/user/orgs?per_page=100", {
      headers,
      cache: "no-store",
    });
    const orgs = orgsRes.ok ? await orgsRes.json() : [];
    console.log("[/api/installations] orgs status:", orgsRes.status, "count:", orgs.length, "logins:", orgs.map?.((o: any) => o.login));

    // Fetch current installations
    const installationsRes = await fetch(
      "https://api.github.com/user/installations?per_page=100",
      { headers, cache: "no-store" },
    );
    const installedAccounts = new Set<string>();
    if (installationsRes.ok) {
      const data = await installationsRes.json();
      for (const inst of data.installations ?? []) {
        if (inst.account?.login) {
          installedAccounts.add(inst.account.login.toLowerCase());
        }
      }
    }

    // Build account list: personal first, then orgs
    const accounts: AccountInfo[] = [
      {
        login: user.login,
        type: "User",
        avatarUrl: user.avatar_url,
        installed: installedAccounts.has(user.login.toLowerCase()),
      },
      ...orgs.map((org: any) => ({
        login: org.login,
        type: "Organization" as const,
        avatarUrl: org.avatar_url,
        installed: installedAccounts.has(org.login.toLowerCase()),
      })),
    ];

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("[/api/installations] error:", err);
    return NextResponse.json({ accounts: [] });
  }
}
