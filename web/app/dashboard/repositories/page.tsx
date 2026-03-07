import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import {
  fetchUserInstallations,
  fetchInstallationRepos,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";
import RepositoriesClient, {
  type RepositoryView,
} from "./RepositoriesClient";

interface RepositoriesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RepositoriesPage({
  searchParams,
}: RepositoriesPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) redirect("/");

  const params = await searchParams;

  let installations;
  try {
    installations = await fetchUserInstallations(accessToken);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      redirect("/api/auth/signout");
    }
    throw err;
  }

  if (installations.length === 0) redirect("/onboarding");

  // Active installation from ?org= param
  const orgParam = typeof params.org === "string" ? params.org : undefined;
  const activeInstallation = orgParam
    ? installations.find((i) => String(i.id) === orgParam) ?? installations[0]
    : installations[0];

  const installationId = String(activeInstallation.id);
  const isAdmin = await checkInstallationAdmin(accessToken, activeInstallation);

  // Fetch repos from GitHub API
  const { repos: ghRepos } = await fetchInstallationRepos(
    accessToken,
    activeInstallation.id,
  );

  // Fetch monitored flags from DynamoDB
  const installationsTable = process.env.DYNAMODB_TABLE_INSTALLATIONS;
  const monitoredMap = new Map<string, boolean>();
  const configMap = new Map<string, boolean>();

  if (installationsTable) {
    try {
      const result = await ddb.send(
        new QueryCommand({
          TableName: installationsTable,
          KeyConditionExpression: "installationId = :iid",
          ExpressionAttributeValues: { ":iid": installationId },
        }),
      );
      for (const item of result.Items ?? []) {
        const name = item.repoFullName as string;
        monitoredMap.set(name, item.monitored === true);
        // Check if config exists (non-empty config object)
        const cfg = item.config;
        configMap.set(
          name,
          cfg != null && typeof cfg === "object" && Object.keys(cfg).length > 0,
        );
      }
    } catch {
      // DynamoDB error — default to not monitored
    }
  }

  // Fetch review stats from DynamoDB
  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;
  const statsMap = new Map<
    string,
    { reviewCount: number; issueCount: number; lastReviewedAt: string | null }
  >();

  if (reviewsTable) {
    try {
      const repoNames = ghRepos.map((r) => r.repoFullName);
      // Query reviews for each repo (limit to first 50 repos to avoid excessive queries)
      for (const repoName of repoNames.slice(0, 50)) {
        const result = await ddb.send(
          new QueryCommand({
            TableName: reviewsTable,
            KeyConditionExpression: "repoFullName = :repo",
            ExpressionAttributeValues: { ":repo": repoName },
            ScanIndexForward: false,
            Limit: 100,
          }),
        );

        const items = result.Items ?? [];
        let reviewCount = 0;
        let issueCount = 0;
        let lastReviewedAt: string | null = null;

        for (const item of items) {
          if (item.status === "complete") {
            reviewCount++;
            if (!lastReviewedAt) {
              lastReviewedAt = (item.completedAt as string) ?? (item.createdAt as string) ?? null;
            }
            const findingCount = item.findingCount;
            if (typeof findingCount === "number") {
              issueCount += findingCount;
            }
          }
        }

        if (reviewCount > 0 || items.length > 0) {
          statsMap.set(repoName, { reviewCount, issueCount, lastReviewedAt });
        }
      }
    } catch {
      // DynamoDB error — show zero stats
    }
  }

  // Build RepositoryView list
  const repos: RepositoryView[] = ghRepos.map((r) => {
    const stats = statsMap.get(r.repoFullName);
    return {
      fullName: r.repoFullName,
      githubUrl: r.htmlUrl,
      language: r.language,
      isPrivate: r.isPrivate,
      enabled: monitoredMap.get(r.repoFullName) ?? false,
      reviewCount: stats?.reviewCount ?? 0,
      issueCount: stats?.issueCount ?? 0,
      lastReviewedAt: stats?.lastReviewedAt ?? null,
      hasConfig: configMap.get(r.repoFullName) ?? false,
      installationId,
    };
  });

  return (
    <RepositoriesClient
      repos={repos}
      isAdmin={isAdmin}
      installationId={installationId}
      githubAppSlug={process.env.GITHUB_APP_SLUG}
    />
  );
}
