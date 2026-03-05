import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import RepoCard from "@/components/RepoCard";
import ReviewTable, { type Review } from "@/components/ReviewTable";
import ConnectRepo from "@/components/ConnectRepo";

/**
 * Dashboard page — shown after the user signs in.
 *
 * Server Component that:
 *  1. Validates the session (redirects to landing if unauthenticated)
 *  2. Fetches connected repos from DynamoDB
 *  3. Fetches recent reviews from DynamoDB
 *  4. Renders the dashboard shell with RepoCard list + ReviewTable
 */
export default async function DashboardPage() {
  // ── Auth gate ──────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const userEmail = session.user?.email ?? "";

  // ── Fetch connected repos ─────────────────────────────────────────────
  let repos: { repoFullName: string; installedAt: string; reviewCount: number }[] = [];

  const installTable = process.env.DYNAMODB_TABLE_INSTALLATIONS;
  if (installTable) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: installTable,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userEmail },
      }),
    );
    repos = (result.Items ?? []).map((item) => ({
      repoFullName: item.repoFullName as string,
      installedAt: item.installedAt as string,
      reviewCount: (item.reviewCount as number) ?? 0,
    }));
  }

  // ── Fetch recent reviews ──────────────────────────────────────────────
  let reviews: Review[] = [];

  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;
  if (reviewsTable) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: reviewsTable,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userEmail },
        ScanIndexForward: false, // newest first
        Limit: 20,
      }),
    );
    reviews = (result.Items ?? []).map((item) => ({
      id: item.id as string,
      repoFullName: item.repoFullName as string,
      prNumber: item.prNumber as number,
      prTitle: item.prTitle as string,
      status: item.status as Review["status"],
      model: item.model as string,
      createdAt: item.createdAt as string,
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-primer-muted">
            Welcome back, {session.user?.name ?? userEmail}
          </p>
        </div>
        <ConnectRepo />
      </div>

      {/* Connected repos */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Connected Repositories</h2>
        {repos.length === 0 ? (
          <p className="text-sm text-primer-muted">
            No repos connected yet. Click &quot;Connect Repo&quot; to install
            the MergeWatch GitHub App on your repositories.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard key={repo.repoFullName} {...repo} />
            ))}
          </div>
        )}
      </section>

      {/* Recent reviews */}
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Recent Reviews</h2>
        <ReviewTable reviews={reviews} />
      </section>
    </div>
  );
}
