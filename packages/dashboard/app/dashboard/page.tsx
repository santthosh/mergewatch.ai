export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDashboardStore } from "@/lib/store";
import type { InstallationItem } from "@mergewatch/core";
import {
  fetchUserInstallations,
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
 * "Monitored" means the repo has a record in the store with monitored=true.
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
      redirect("/signout");
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

  // Parallelize admin check and store query (both independent of each other)
  const store = await getDashboardStore();

  const [isAdmin, monitoredItems] = await Promise.all([
    checkInstallationAdmin(accessToken, activeInstallation),
    store.installations.listByInstallation(installationId).catch((): InstallationItem[] => []),
  ]);

  const monitoredItemsList = monitoredItems.filter((item) => item.monitored === true);
  const monitoredNames = new Set(monitoredItemsList.map((item) => item.repoFullName));

  // Build repos list from monitored store items (reviews are fetched client-side via /api/reviews)
  const repos = monitoredItemsList
    .sort((a, b) => a.repoFullName.localeCompare(b.repoFullName))
    .map((item) => ({
      repoFullName: item.repoFullName,
      installedAt: item.installedAt || new Date().toISOString(),
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
