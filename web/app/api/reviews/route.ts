import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  TokenExpiredError,
} from "@/lib/github-repos";

export const dynamic = "force-dynamic";

const REVIEWS_TABLE = process.env.DYNAMODB_TABLE_REVIEWS;
const INSTALLATIONS_TABLE = process.env.DYNAMODB_TABLE_INSTALLATIONS;

/**
 * GET /api/reviews?installation_id=<id>&status=<status>&repo=<repoFullName>&cursor=<lastKey>&limit=<n>
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

  if (!REVIEWS_TABLE) {
    return NextResponse.json({ reviews: [], nextCursor: null });
  }

  const sp = req.nextUrl.searchParams;
  const installationIdParam = sp.get("installation_id");
  const statusFilter = sp.get("status");
  const repoFilter = sp.get("repo");
  const limit = Math.min(Number(sp.get("limit") ?? 25), 100);
  const cursor = sp.get("cursor");

  try {
    // Determine which repos the user has access to
    const installations = await fetchUserInstallations(accessToken);
    if (installations.length === 0) {
      return NextResponse.json({ reviews: [], nextCursor: null });
    }

    const targetInstallations = installationIdParam
      ? installations.filter((i) => String(i.id) === installationIdParam)
      : installations;

    // Get monitored repos for the user's installations
    const accessibleRepos = new Set<string>();
    for (const installation of targetInstallations) {
      if (INSTALLATIONS_TABLE) {
        const result = await ddb.send(
          new QueryCommand({
            TableName: INSTALLATIONS_TABLE,
            KeyConditionExpression: "installationId = :iid",
            ExpressionAttributeValues: { ":iid": String(installation.id) },
          }),
        );
        for (const item of result.Items ?? []) {
          if (item.monitored === true) {
            accessibleRepos.add(item.repoFullName as string);
          }
        }
      }
    }

    if (accessibleRepos.size === 0) {
      return NextResponse.json({ reviews: [], nextCursor: null });
    }

    // If filtering by a specific repo, verify access
    if (repoFilter && !accessibleRepos.has(repoFilter)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetRepos = repoFilter ? [repoFilter] : Array.from(accessibleRepos);

    // Query reviews for each repo
    const allReviews: Record<string, unknown>[] = [];

    for (const repoFullName of targetRepos) {
      const params: any = {
        TableName: REVIEWS_TABLE,
        KeyConditionExpression: "repoFullName = :repo",
        ExpressionAttributeValues: { ":repo": repoFullName },
        ScanIndexForward: false,
        Limit: limit,
      };

      if (statusFilter) {
        params.FilterExpression = "#s = :status";
        params.ExpressionAttributeNames = { "#s": "status" };
        params.ExpressionAttributeValues[":status"] = statusFilter === "completed" ? "complete" : statusFilter;
      }

      const result = await ddb.send(new QueryCommand(params));
      allReviews.push(...(result.Items ?? []));
    }

    // Sort by createdAt descending and limit
    allReviews.sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
    );
    const paged = allReviews.slice(0, limit);

    // Map to response format
    const reviews = paged.map((item) => {
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
        headBranch: item.headBranch ?? undefined,
        baseBranch: item.baseBranch ?? undefined,
        findingCount: item.findingCount ?? undefined,
        topSeverity: item.topSeverity ?? undefined,
        durationMs: item.durationMs ?? undefined,
      };
    });

    return NextResponse.json({
      reviews,
      nextCursor: paged.length === limit ? "more" : null,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/reviews] error:", err);
    return NextResponse.json({ reviews: [], nextCursor: null });
  }
}
