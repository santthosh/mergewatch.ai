import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";

/**
 * GET /api/repos
 *
 * Returns the list of repositories the authenticated user has connected
 * via the MergeWatch GitHub App. Records are stored in DynamoDB, keyed
 * by the user's GitHub login.
 *
 * Response shape:
 *   { repos: Array<{ repoFullName: string; installedAt: string; reviewCount: number }> }
 */
export async function GET() {
  // Require an authenticated session
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tableName = process.env.DYNAMODB_TABLE_INSTALLATIONS;
  if (!tableName) {
    return NextResponse.json(
      { error: "Server misconfigured: missing DYNAMODB_TABLE_INSTALLATIONS" },
      { status: 500 },
    );
  }

  // Query installations partitioned by the user's email
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": session.user.email },
    }),
  );

  const repos = (result.Items ?? []).map((item) => ({
    repoFullName: item.repoFullName as string,
    installedAt: item.installedAt as string,
    reviewCount: (item.reviewCount as number) ?? 0,
  }));

  return NextResponse.json({ repos });
}
