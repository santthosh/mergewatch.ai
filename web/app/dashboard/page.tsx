import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import ReviewTable, { type Review } from "@/components/ReviewTable";
import ConnectRepo from "@/components/ConnectRepo";
import Onboarding from "@/components/Onboarding";
import DashboardContent from "@/components/DashboardContent";

/**
 * Dashboard page — shown after the user signs in.
 *
 * If the user has no monitored repos, shows the Onboarding flow.
 * Otherwise, renders the normal dashboard filtered to monitored repos.
 */
export default async function DashboardPage() {
  // ── Auth gate ──────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const accessToken = (session as any).accessToken as string | undefined;
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
      // DynamoDB error — show onboarding
    }
  }

  // ── No monitored repos → show onboarding ─────────────────────────────
  if (monitoredRepos.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-primer-muted">
              Welcome, {session.user?.name ?? session.user?.email ?? ""}
            </p>
          </div>
        </div>
        <Onboarding />
      </div>
    );
  }

  // ── Fetch recent reviews from DynamoDB for monitored repos ────────────
  let reviews: Review[] = [];

  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;
  if (reviewsTable) {
    try {
      for (const repo of monitoredRepos.slice(0, 10)) {
        const result = await ddb.send(
          new ScanCommand({
            TableName: reviewsTable,
            FilterExpression: "repoFullName = :repo",
            ExpressionAttributeValues: { ":repo": repo.repoFullName },
            Limit: 10,
          }),
        );

        for (const item of result.Items ?? []) {
          reviews.push({
            id: item.prNumberCommitSha as string,
            repoFullName: item.repoFullName as string,
            prNumber: Number(String(item.prNumberCommitSha).split("#")[0]),
            prTitle: (item.prTitle as string) ?? "",
            status: (item.status as Review["status"]) ?? "pending",
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

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <DashboardContent
      userName={session.user?.name ?? session.user?.email ?? ""}
      repos={repos}
      reviews={reviews}
    />
  );
}
