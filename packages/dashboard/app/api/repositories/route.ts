import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  fetchInstallationReposPage,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";

const INSTALLATIONS_TABLE = process.env.DYNAMODB_TABLE_INSTALLATIONS;
const REVIEWS_TABLE = process.env.DYNAMODB_TABLE_REVIEWS;

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
    const installations = await fetchUserInstallations(accessToken);
    const installation = installations.find((i) => String(i.id) === installationIdParam);
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

    // Fetch monitored flags + config from DynamoDB (single partition query, cached for all pages)
    const monitoredMap = new Map<string, boolean>();
    const configMap = new Map<string, boolean>();

    if (INSTALLATIONS_TABLE) {
      try {
        const result = await ddb.send(
          new QueryCommand({
            TableName: INSTALLATIONS_TABLE,
            KeyConditionExpression: "installationId = :iid",
            ExpressionAttributeValues: { ":iid": installationIdParam },
          }),
        );
        for (const item of result.Items ?? []) {
          const name = item.repoFullName as string;
          monitoredMap.set(name, item.monitored === true);
          const cfg = item.config;
          configMap.set(
            name,
            cfg != null && typeof cfg === "object" && Object.keys(cfg).length > 0,
          );
        }
      } catch {
        // DynamoDB error — defaults apply
      }
    }

    // Fetch review stats for this page's repos
    const statsMap = new Map<
      string,
      { reviewCount: number; issueCount: number; lastReviewedAt: string | null }
    >();

    if (REVIEWS_TABLE) {
      // Query in parallel for all repos on this page
      const statsPromises = ghRepos.map(async (r) => {
        try {
          const result = await ddb.send(
            new QueryCommand({
              TableName: REVIEWS_TABLE,
              KeyConditionExpression: "repoFullName = :repo",
              ExpressionAttributeValues: { ":repo": r.repoFullName },
              ScanIndexForward: false,
              Limit: 100,
            }),
          );

          let reviewCount = 0;
          let issueCount = 0;
          let lastReviewedAt: string | null = null;

          for (const item of result.Items ?? []) {
            if (item.status === "complete") {
              reviewCount++;
              if (!lastReviewedAt) {
                lastReviewedAt =
                  (item.completedAt as string) ?? (item.createdAt as string) ?? null;
              }
              const fc = item.findingCount;
              if (typeof fc === "number") issueCount += fc;
            }
          }

          if (reviewCount > 0) {
            statsMap.set(r.repoFullName, { reviewCount, issueCount, lastReviewedAt });
          }
        } catch {
          // Skip stats for this repo
        }
      });

      await Promise.all(statsPromises);
    }

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

    // Compute active/paused counts from full DynamoDB data (covers all repos, not just this page)
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

  if (!INSTALLATIONS_TABLE) {
    return NextResponse.json(
      { error: "DYNAMODB_TABLE_INSTALLATIONS not configured" },
      { status: 500 },
    );
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
  let installations;
  try {
    installations = await fetchUserInstallations(accessToken);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    throw err;
  }

  const installation = installations.find((i) => String(i.id) === installationId);
  if (!installation) {
    return NextResponse.json({ error: "Installation not found" }, { status: 404 });
  }

  const isAdmin = await checkInstallationAdmin(accessToken, installation);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  await ddb.send(
    new UpdateCommand({
      TableName: INSTALLATIONS_TABLE,
      Key: { installationId, repoFullName },
      UpdateExpression: "SET monitored = :m",
      ExpressionAttributeValues: { ":m": enabled },
    }),
  );

  return NextResponse.json({ ok: true });
}
