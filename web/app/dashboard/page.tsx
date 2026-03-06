import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import { type Review } from "@/components/ReviewTable";
import DashboardContent from "@/components/DashboardContent";

/**
 * Dashboard page — shows monitored repos and recent reviews.
 *
 * Redirects to /onboarding if the user has no monitored repos.
 */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const githubUserId = (session as any).githubUserId as string | undefined;

  // ── Fetch monitored repos from DynamoDB ──────────────────────────────
  const monitoredTable = process.env.DYNAMODB_TABLE_MONITORED_REPOS;
  let monitoredRepos: { repoFullName: string; enabledAt: string; installationId: string }[] = [];

  if (monitoredTable && githubUserId) {
    try {
      const result = await ddb.send(
        new QueryCommand({
          TableName: monitoredTable,
          KeyConditionExpression: "githubUserId = :uid",
          ExpressionAttributeValues: { ":uid": githubUserId },
        }),
      );

      monitoredRepos = (result.Items ?? []).map((item) => ({
        repoFullName: item.repoFullName as string,
        enabledAt: item.enabledAt as string,
        installationId: item.installationId as string,
      }));
    } catch {
      // DynamoDB error — redirect to onboarding
    }
  }

  // No monitored repos → onboarding
  if (monitoredRepos.length === 0) {
    redirect("/onboarding");
  }

  // ── Fetch recent reviews from DynamoDB for monitored repos ────────────
  let reviews: Review[] = [];

  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;
  if (reviewsTable) {
    try {
      for (const repo of monitoredRepos.slice(0, 10)) {
        const result = await ddb.send(
          new QueryCommand({
            TableName: reviewsTable,
            KeyConditionExpression: "repoFullName = :repo",
            ExpressionAttributeValues: { ":repo": repo.repoFullName },
            ScanIndexForward: false,
            Limit: 10,
          }),
        );

        for (const item of result.Items ?? []) {
          reviews.push({
            id: item.prNumberCommitSha as string,
            repoFullName: item.repoFullName as string,
            prNumber: Number(String(item.prNumberCommitSha).split("#")[0]),
            prTitle: (item.prTitle as string) ?? "",
            status: (item.status === "complete" ? "completed" : item.status as Review["status"]) ?? "pending",
            model: (item.model as string) ?? "",
            createdAt: (item.createdAt as string) ?? "",
          });
        }
      }

      reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      reviews = reviews.slice(0, 20);
    } catch {
      // DynamoDB error — show empty state
    }
  }

  // Build repos list with review counts
  const reviewCountMap = new Map<string, number>();
  for (const r of reviews) {
    reviewCountMap.set(r.repoFullName, (reviewCountMap.get(r.repoFullName) ?? 0) + 1);
  }

  const repos = monitoredRepos.map((mr) => ({
    repoFullName: mr.repoFullName,
    installedAt: mr.enabledAt,
    reviewCount: reviewCountMap.get(mr.repoFullName) ?? 0,
  }));

  return (
    <DashboardContent
      repos={repos}
      reviews={reviews}
    />
  );
}
