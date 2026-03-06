import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
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
 *  2. Fetches user's GitHub App installations via GitHub API
 *  3. Fetches recent reviews from DynamoDB for those repos
 *  4. Renders the dashboard shell with RepoCard list + ReviewTable
 */
export default async function DashboardPage() {
  // ── Auth gate ──────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const accessToken = (session as any).accessToken as string | undefined;

  // ── Fetch repos from GitHub App installations ───────────────────────
  let repos: { repoFullName: string; installedAt: string; reviewCount: number }[] = [];

  if (accessToken) {
    try {
      const installationsRes = await fetch(
        "https://api.github.com/user/installations",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        },
      );

      if (installationsRes.ok) {
        const data = await installationsRes.json();
        const installations = data.installations ?? [];

        for (const installation of installations) {
          const reposRes = await fetch(
            `https://api.github.com/user/installations/${installation.id}/repositories`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github+json",
              },
              cache: "no-store",
            },
          );

          if (reposRes.ok) {
            const reposData = await reposRes.json();
            for (const repo of reposData.repositories ?? []) {
              repos.push({
                repoFullName: repo.full_name,
                installedAt: installation.created_at ?? "",
                reviewCount: 0,
              });
            }
          }
        }
      }
    } catch {
      // GitHub API error — show empty state
    }
  }

  // ── Fetch recent reviews from DynamoDB ──────────────────────────────
  let reviews: Review[] = [];

  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;
  if (reviewsTable && repos.length > 0) {
    try {
      // Fetch reviews for the user's repos
      for (const repo of repos.slice(0, 10)) {
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

      // Sort by newest first
      reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      reviews = reviews.slice(0, 20);
    } catch {
      // DynamoDB error — show empty state
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-primer-muted">
            Welcome back, {session.user?.name ?? session.user?.email ?? ""}
          </p>
        </div>
        <ConnectRepo />
      </div>

      {/* Connected repos */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Connected Repositories</h2>
        {repos.length === 0 ? (
          <p className="text-sm text-primer-muted">
            No repos connected yet. Click &quot;Add Repositories&quot; to install
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
