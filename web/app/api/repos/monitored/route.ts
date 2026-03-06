import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  checkInstallationAdmin,
} from "@/lib/github-repos";

const TABLE = process.env.DYNAMODB_TABLE_INSTALLATIONS;

/**
 * PUT /api/repos/monitored
 *
 * Admin-only: set the monitored repos for a given installation.
 * Accepts { installationId, repos: { repoFullName }[] }.
 * Adds new repos and removes repos no longer in the list.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  if (!TABLE) {
    return NextResponse.json(
      { error: "DYNAMODB_TABLE_INSTALLATIONS not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const installationId: string = String(body.installationId);
  const incoming: { repoFullName: string }[] = body.repos ?? [];

  if (!installationId) {
    return NextResponse.json(
      { error: "installationId is required" },
      { status: 400 },
    );
  }

  // Verify the user is an admin for this installation
  const installations = await fetchUserInstallations(accessToken);
  const installation = installations.find((i) => String(i.id) === installationId);

  if (!installation) {
    return NextResponse.json(
      { error: "Installation not found" },
      { status: 404 },
    );
  }

  const isAdmin = await checkInstallationAdmin(accessToken, installation);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  // Fetch existing monitored repos from DynamoDB
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "installationId = :iid",
      ExpressionAttributeValues: { ":iid": installationId },
    }),
  );

  const existingNames = new Set(
    (existing.Items ?? []).map((i) => i.repoFullName as string),
  );
  const incomingNames = new Set(incoming.map((r) => r.repoFullName));

  // Repos to add (in incoming but not existing)
  const toAdd = incoming.filter((r) => !existingNames.has(r.repoFullName));

  // Repos to remove (in existing but not incoming)
  const toRemove = Array.from(existingNames).filter(
    (n) => !incomingNames.has(n),
  );

  const now = new Date().toISOString();

  // Add new repos
  for (const repo of toAdd) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          installationId,
          repoFullName: repo.repoFullName,
          installedAt: now,
          config: {},
        },
      }),
    );
  }

  // Remove deselected repos
  for (const repoFullName of toRemove) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { installationId, repoFullName },
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
