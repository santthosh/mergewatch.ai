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
 * GET /api/reviews?installation_id=<id>&status=<status>&repo=<repoFullName>&cursor=<base64>&limit=<n>
 *
 * Returns paginated reviews for repos the user has access to.
 * Cursor is a base64-encoded JSON object with per-repo LastEvaluatedKeys.
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
  const cursorParam = sp.get("cursor");

  // Decode cursor: { [repoFullName]: DynamoDB LastEvaluatedKey, _exhausted: string[] }
  let cursorState: {
    keys: Record<string, Record<string, unknown>>;
    exhausted: string[];
  } = { keys: {}, exhausted: [] };

  if (cursorParam) {
    try {
      cursorState = JSON.parse(Buffer.from(cursorParam, "base64url").toString());
    } catch {
      // Invalid cursor — start fresh
    }
  }

  try {
    const installations = await fetchUserInstallations(accessToken);
    if (installations.length === 0) {
      return NextResponse.json({ reviews: [], nextCursor: null });
    }

    const targetInstallations = installationIdParam
      ? installations.filter((i) => String(i.id) === installationIdParam)
      : installations;

    // Get monitored repos
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
      return NextResponse.json({ reviews: [], nextCursor: null, stats: { total: 0, completed: 0, findings: 0 } });
    }

    if (repoFilter && !accessibleRepos.has(repoFilter)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetRepos = repoFilter ? [repoFilter] : Array.from(accessibleRepos);

    // Compute aggregate stats across all target repos (parallel count queries)
    let statsTotal = 0;
    let statsCompleted = 0;
    let statsFindings = 0;

    const statsPromises = targetRepos.map(async (repoFullName) => {
      try {
        const result = await ddb.send(
          new QueryCommand({
            TableName: REVIEWS_TABLE!,
            KeyConditionExpression: "repoFullName = :repo",
            ExpressionAttributeValues: { ":repo": repoFullName },
            ProjectionExpression: "#s, findingCount",
            ExpressionAttributeNames: { "#s": "status" },
          }),
        );
        for (const item of result.Items ?? []) {
          statsTotal++;
          if (item.status === "complete") {
            statsCompleted++;
          }
          if (typeof item.findingCount === "number") {
            statsFindings += item.findingCount;
          }
        }
      } catch {
        // skip
      }
    });
    await Promise.all(statsPromises);

    // Query each non-exhausted repo, fetching enough rows to fill the page
    const allReviews: Record<string, unknown>[] = [];
    const nextCursorState: typeof cursorState = {
      keys: {},
      exhausted: [...cursorState.exhausted],
    };

    for (const repoFullName of targetRepos) {
      if (cursorState.exhausted.includes(repoFullName)) continue;

      const params: Record<string, unknown> = {
        TableName: REVIEWS_TABLE,
        KeyConditionExpression: "repoFullName = :repo",
        ExpressionAttributeValues: { ":repo": repoFullName } as Record<string, unknown>,
        ScanIndexForward: false,
        // Fetch more than needed per repo so we have enough after merge+sort
        Limit: limit,
      };

      if (statusFilter) {
        params.FilterExpression = "#s = :status";
        params.ExpressionAttributeNames = { "#s": "status" };
        (params.ExpressionAttributeValues as Record<string, unknown>)[":status"] =
          statusFilter === "completed" ? "complete" : statusFilter;
      }

      // Resume from where we left off for this repo
      if (cursorState.keys[repoFullName]) {
        params.ExclusiveStartKey = cursorState.keys[repoFullName];
      }

      const result = await ddb.send(new QueryCommand(params as any));
      allReviews.push(...(result.Items ?? []));

      if (result.LastEvaluatedKey) {
        nextCursorState.keys[repoFullName] = result.LastEvaluatedKey as Record<string, unknown>;
      } else {
        // This repo has no more results
        nextCursorState.exhausted.push(repoFullName);
      }
    }

    // Sort all results by createdAt descending
    allReviews.sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
    );

    // Take only `limit` items for this page
    const paged = allReviews.slice(0, limit);

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
        mergeScore: item.mergeScore ?? undefined,
      };
    });

    // Determine if there are more results
    const hasMore =
      // More items than we returned (overflow from merge)
      allReviews.length > limit ||
      // Some repos still have DynamoDB pages left
      Object.keys(nextCursorState.keys).length > 0 ||
      // Not all repos are exhausted yet
      nextCursorState.exhausted.length < targetRepos.length;

    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify(nextCursorState)).toString("base64url")
      : null;

    return NextResponse.json({
      reviews,
      nextCursor,
      stats: { total: statsTotal, completed: statsCompleted, findings: statsFindings },
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/reviews] error:", err);
    return NextResponse.json({ reviews: [], nextCursor: null });
  }
}
