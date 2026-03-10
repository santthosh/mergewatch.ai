export const dynamic = "force-dynamic";

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
import DashboardContent from "@/components/DashboardContent";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Dashboard page — shows monitored repos from the selected installation and recent reviews.
 *
 * "Monitored" means the repo has a record in the mergewatch-installations DynamoDB table.
 * Admins can manage which repos are monitored via the RepoPicker.
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
  let installations;
  try {
    installations = await fetchUserInstallations(accessToken);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      redirect("/api/auth/signout");
    }
    throw err;
  }

  if (installations.length === 0) {
    redirect("/onboarding");
  }

  // Determine active installation from ?org= param or default to first
  const orgParam = typeof params.org === "string" ? params.org : undefined;
  const activeInstallation = orgParam
    ? installations.find((i) => String(i.id) === orgParam) ?? installations[0]
    : installations[0];

  const installationId = String(activeInstallation.id);

  // Check admin status
  const isAdmin = await checkInstallationAdmin(accessToken, activeInstallation);

  // Fetch all repos available in this installation (from GitHub API)
  const { repos: allInstallationRepos } = await fetchInstallationRepos(
    accessToken,
    activeInstallation.id,
  );

  // Fetch monitored repos from mergewatch-installations DynamoDB table
  const installationsTable = process.env.DYNAMODB_TABLE_INSTALLATIONS;
  let monitoredNames = new Set<string>();

  if (installationsTable) {
    try {
      const result = await ddb.send(
        new QueryCommand({
          TableName: installationsTable,
          KeyConditionExpression: "installationId = :iid",
          ExpressionAttributeValues: { ":iid": installationId },
        }),
      );

      monitoredNames = new Set(
        (result.Items ?? [])
          .filter((item) => item.monitored === true)
          .map((item) => item.repoFullName as string),
      );
    } catch {
      // DynamoDB error — show empty state
    }
  }

  // Filter to only monitored repos — show nothing until admin selects repos
  const monitoredRepos = allInstallationRepos.filter((r) =>
    monitoredNames.has(r.repoFullName),
  );

  // Build repos list (reviews are fetched client-side via /api/reviews)
  const repos = monitoredRepos.map((ir) => ({
    repoFullName: ir.repoFullName,
    installedAt: ir.installedAt,
    reviewCount: 0,
  }));

  return (
    <DashboardContent
      repos={repos}
      isAdmin={isAdmin}
      installationId={installationId}
      monitoredNames={Array.from(monitoredNames)}
    />
  );
}
