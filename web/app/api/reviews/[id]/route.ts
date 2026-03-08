import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";

const REVIEWS_TABLE = process.env.DYNAMODB_TABLE_REVIEWS;

/**
 * GET /api/reviews/[id]
 *
 * Fetch a single review by id. The id is URL-encoded "owner/repo:prNumber#commitSha".
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REVIEWS_TABLE) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const colonIdx = decoded.lastIndexOf(":");
  if (colonIdx === -1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const repoFullName = decoded.slice(0, colonIdx);
  const prNumberCommitSha = decoded.slice(colonIdx + 1);

  const result = await ddb.send(
    new GetCommand({
      TableName: REVIEWS_TABLE,
      Key: { repoFullName, prNumberCommitSha },
    }),
  );

  if (!result.Item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const item = result.Item;
  return NextResponse.json({
    review: {
      repoFullName: item.repoFullName,
      prNumberCommitSha: item.prNumberCommitSha,
      prNumber: Number(String(item.prNumberCommitSha).split("#")[0]),
      commitSha: String(item.prNumberCommitSha).split("#")[1] ?? "",
      prTitle: item.prTitle ?? "",
      status: item.status === "complete" ? "completed" : item.status,
      model: item.model ?? "",
      createdAt: item.createdAt ?? "",
      completedAt: item.completedAt ?? undefined,
      commentId: item.commentId ?? undefined,
      prAuthor: item.prAuthor ?? undefined,
      prAuthorAvatar: item.prAuthorAvatar ?? undefined,
      headBranch: item.headBranch ?? undefined,
      baseBranch: item.baseBranch ?? undefined,
      findingCount: item.findingCount ?? undefined,
      topSeverity: item.topSeverity ?? undefined,
      durationMs: item.durationMs ?? undefined,
      summaryText: item.summaryText ?? undefined,
      diagramText: item.diagramText ?? undefined,
      findings: item.findings ?? [],
      settingsUsed: item.settingsUsed ?? undefined,
      feedback: item.feedback ?? undefined,
      mergeScore: item.mergeScore ?? undefined,
      mergeScoreReason: item.mergeScoreReason ?? undefined,
    },
  });
}

/**
 * POST /api/reviews/[id]
 *
 * Submit feedback (thumbs up/down) for a review.
 * Body: { feedback: "up" | "down" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REVIEWS_TABLE) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const colonIdx = decoded.lastIndexOf(":");
  if (colonIdx === -1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const repoFullName = decoded.slice(0, colonIdx);
  const prNumberCommitSha = decoded.slice(colonIdx + 1);

  const body = await req.json();
  const feedback = body.feedback;
  if (feedback !== "up" && feedback !== "down" && feedback !== null) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  if (feedback === null) {
    await ddb.send(
      new UpdateCommand({
        TableName: REVIEWS_TABLE,
        Key: { repoFullName, prNumberCommitSha },
        UpdateExpression: "REMOVE feedback",
      }),
    );
  } else {
    await ddb.send(
      new UpdateCommand({
        TableName: REVIEWS_TABLE,
        Key: { repoFullName, prNumberCommitSha },
        UpdateExpression: "SET feedback = :fb",
        ExpressionAttributeValues: { ":fb": feedback },
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
