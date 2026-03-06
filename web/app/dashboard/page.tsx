import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  fetchInstallationRepos,
  checkInstallationAdmin,
} from "@/lib/github-repos";
import { type Review } from "@/components/ReviewTable";
import DashboardContent from "@/components/DashboardContent";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Dashboard page — shows repos from the selected installation and recent reviews.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    redirect("/");
  }

  const params = await searchParams;

  // Fetch installations
  const installations = await fetchUserInstallations(accessToken);

  if (installations.length === 0) {
    redirect("/onboarding");
  }

  // Determine active installation from ?org= param or default to first
  const orgParam = typeof params.org === "string" ? params.org : undefined;
  const activeInstallation = orgParam
    ? installations.find((i) => String(i.id) === orgParam) ?? installations[0]
    : installations[0];

  // Fetch repos for the active installation
  const { repos: installationRepos } = await fetchInstallationRepos(
    accessToken,
    activeInstallation.id,
  );

  // Check admin status
  const isAdmin = await checkInstallationAdmin(accessToken, activeInstallation);

  // Fetch recent reviews from DynamoDB for these repos
  let reviews: Review[] = [];
  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;

  if (reviewsTable && installationRepos.length > 0) {
    try {
      for (const repo of installationRepos.slice(0, 10)) {
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

  const repos = installationRepos.map((ir) => ({
    repoFullName: ir.repoFullName,
    installedAt: ir.installedAt,
    reviewCount: reviewCountMap.get(ir.repoFullName) ?? 0,
  }));

  return (
    <DashboardContent
      repos={repos}
      reviews={reviews}
      isAdmin={isAdmin}
    />
  );
}
