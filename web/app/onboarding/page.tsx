import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import Header from "@/components/Header";
import Onboarding from "@/components/Onboarding";

/**
 * Onboarding page — guided setup for new users.
 *
 * If the user already has monitored repos, redirects to /dashboard.
 */
export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const githubUserId = (session as any).githubUserId as string | undefined;
  const monitoredTable = process.env.DYNAMODB_TABLE_MONITORED_REPOS;

  // If user already has monitored repos, skip to dashboard
  if (monitoredTable && githubUserId) {
    try {
      const result = await ddb.send(
        new QueryCommand({
          TableName: monitoredTable,
          KeyConditionExpression: "githubUserId = :uid",
          ExpressionAttributeValues: { ":uid": githubUserId },
          Limit: 1,
        }),
      );

      if ((result.Items ?? []).length > 0) {
        redirect("/dashboard");
      }
    } catch {
      // DynamoDB error — show onboarding anyway
    }
  }

  return (
    <div>
      <Header
        userName={session.user?.name ?? session.user?.email ?? ""}
        userImage={session.user?.image}
      />
      <Onboarding />
    </div>
  );
}
