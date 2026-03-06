import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  QueryCommand,
  PutCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";

const TABLE = process.env.DYNAMODB_TABLE_MONITORED_REPOS;

function getUserId(session: any): string | null {
  return session?.githubUserId ?? null;
}

/**
 * GET /api/repos/monitored
 *
 * Returns all monitored repos for the authenticated user.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubUserId = getUserId(session);
  if (!githubUserId || !TABLE) {
    return NextResponse.json({ repos: [] });
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "githubUserId = :uid",
      ExpressionAttributeValues: { ":uid": githubUserId },
    }),
  );

  const repos = (result.Items ?? []).map((item) => ({
    repoFullName: item.repoFullName as string,
    enabledAt: item.enabledAt as string,
    installationId: item.installationId as string,
  }));

  return NextResponse.json({ repos });
}

/**
 * PUT /api/repos/monitored
 *
 * Batch-set monitored repos. Accepts { repos: { repoFullName, installationId }[] }.
 * Adds new repos and removes any previously monitored repos not in the list.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubUserId = getUserId(session);
  console.log("[/api/repos/monitored] PUT githubUserId:", githubUserId, "TABLE:", TABLE);
  if (!githubUserId) {
    return NextResponse.json(
      { error: "Missing githubUserId — please sign out and sign back in" },
      { status: 500 },
    );
  }
  if (!TABLE) {
    return NextResponse.json(
      { error: "DYNAMODB_TABLE_MONITORED_REPOS not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const incoming: { repoFullName: string; installationId: string }[] =
    body.repos ?? [];

  // Fetch existing monitored repos
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "githubUserId = :uid",
      ExpressionAttributeValues: { ":uid": githubUserId },
    }),
  );

  const existingNames = new Set(
    (existing.Items ?? []).map((i) => i.repoFullName as string),
  );
  const incomingNames = new Set(incoming.map((r) => r.repoFullName));

  // Repos to add (in incoming but not existing)
  const toAdd = incoming.filter((r) => !existingNames.has(r.repoFullName));

  // Repos to remove (in existing but not incoming)
  const toRemove = Array.from(existingNames).filter((n) => !incomingNames.has(n));

  // Batch write in chunks of 25 (DynamoDB limit)
  const writeRequests = [
    ...toAdd.map((r) => ({
      PutRequest: {
        Item: {
          githubUserId,
          repoFullName: r.repoFullName,
          enabledAt: new Date().toISOString(),
          installationId: r.installationId,
        },
      },
    })),
    ...toRemove.map((name) => ({
      DeleteRequest: {
        Key: { githubUserId, repoFullName: name },
      },
    })),
  ];

  for (let i = 0; i < writeRequests.length; i += 25) {
    const batch = writeRequests.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE]: batch },
      }),
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/repos/monitored
 *
 * Remove a single repo from monitoring. Accepts { repoFullName }.
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubUserId = getUserId(session);
  if (!githubUserId || !TABLE) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { repoFullName } = body;

  if (!repoFullName) {
    return NextResponse.json(
      { error: "repoFullName is required" },
      { status: 400 },
    );
  }

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { githubUserId, repoFullName },
    }),
  );

  return NextResponse.json({ ok: true });
}
