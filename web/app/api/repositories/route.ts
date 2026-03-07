import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";

const TABLE = process.env.DYNAMODB_TABLE_INSTALLATIONS;

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

  if (!TABLE) {
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
      TableName: TABLE,
      Key: { installationId, repoFullName },
      UpdateExpression: "SET monitored = :m",
      ExpressionAttributeValues: { ":m": enabled },
    }),
  );

  return NextResponse.json({ ok: true });
}
