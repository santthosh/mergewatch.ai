export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import { fetchUserInstallations, TokenExpiredError } from "@/lib/github-repos";
import ReviewsClient from "@/components/ReviewsClient";

interface ReviewsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
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

  const orgParam = typeof params.org === "string" ? params.org : undefined;
  const activeInstallation = orgParam
    ? installations.find((i) => String(i.id) === orgParam) ?? installations[0]
    : installations[0];

  const installationId = String(activeInstallation.id);

  // Get monitored repo names for the filter dropdown
  const installationsTable = process.env.DYNAMODB_TABLE_INSTALLATIONS;
  const repos: string[] = [];

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
        if (item.monitored === true) {
          repos.push(item.repoFullName as string);
        }
      }
    } catch {
      // ignore
    }
  }

  repos.sort();

  return (
    <ReviewsClient
      repos={repos}
      installationId={installationId}
    />
  );
}
