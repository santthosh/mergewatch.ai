import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDashboardStore } from "@/lib/store";
import {
  fetchUserInstallations,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";

/**
 * PUT /api/repos/monitored
 *
 * Admin-only: set the monitored repos for a given installation.
 * Accepts { installationId, repos: { repoFullName }[] }.
 * Sets monitored=true on selected repos, monitored=false on the rest.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  const body = await req.json();
  const installationId: string = String(body.installationId);
  const incoming: { repoFullName: string }[] = body.repos ?? [];

  if (!installationId) {
    return NextResponse.json(
      { error: "installationId is required" },
      { status: 400 },
    );
  }

  // Verify the user is an admin for this installation
  let userInstallations;
  try {
    userInstallations = await fetchUserInstallations(accessToken);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    throw err;
  }
  const installation = userInstallations.find((i) => String(i.id) === installationId);

  if (!installation) {
    return NextResponse.json(
      { error: "Installation not found" },
      { status: 404 },
    );
  }

  const isAdmin = await checkInstallationAdmin(accessToken, installation);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const store = await getDashboardStore();

  // Fetch all existing repos for this installation
  const existing = await store.installations.listByInstallation(installationId);
  const incomingNames = new Set(incoming.map((r) => r.repoFullName));

  // Update each existing repo: monitored=true if selected, monitored=false otherwise
  for (const item of existing) {
    const shouldMonitor = incomingNames.has(item.repoFullName);
    await store.installations.updateMonitored(installationId, item.repoFullName, shouldMonitor);
  }

  return NextResponse.json({ ok: true });
}
