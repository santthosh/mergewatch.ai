export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDashboardStore } from "@/lib/store";
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
  const store = await getDashboardStore();
  const repos: string[] = [];

  try {
    const items = await store.installations.listByInstallation(installationId);
    for (const item of items) {
      if (item.monitored === true) {
        repos.push(item.repoFullName);
      }
    }
  } catch {
    // ignore
  }

  repos.sort();

  return (
    <ReviewsClient
      repos={repos}
      installationId={installationId}
    />
  );
}
