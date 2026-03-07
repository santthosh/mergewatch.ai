import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";

const TABLE = process.env.DYNAMODB_TABLE_INSTALLATIONS;

/**
 * PUT /api/repos/monitored
 *
 * Admin-only: set the monitored repos for a given installation.
 * Accepts { installationId, repos: { repoFullName }[] }.
 * Sets monitored=true on selected repos, monitored=false on the rest.
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

  // Fetch all existing repos for this installation
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "installationId = :iid",
      ExpressionAttributeValues: { ":iid": installationId },
    }),
  );

  const incomingNames = new Set(incoming.map((r) => r.repoFullName));

  // Update each existing repo: monitored=true if selected, monitored=false otherwise
  for (const item of existing.Items ?? []) {
    const repoFullName = item.repoFullName as string;
    const shouldMonitor = incomingNames.has(repoFullName);

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { installationId, repoFullName },
        UpdateExpression: "SET monitored = :m",
        ExpressionAttributeValues: { ":m": shouldMonitor },
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
