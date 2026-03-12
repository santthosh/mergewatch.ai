import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDashboardStore } from "@/lib/store";
import { fetchUserInstallations, checkInstallationAdmin, TokenExpiredError } from "@/lib/github-repos";
import { DEFAULT_INSTALLATION_SETTINGS } from "@mergewatch/core";
import type { InstallationSettings } from "@mergewatch/core";

async function getAuthenticatedAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return null;

  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id");
  if (!installationId) return null;

  // TokenExpiredError propagates to the caller — API routes return 401
  const installations = await fetchUserInstallations(accessToken);
  const installation = installations.find((i) => String(i.id) === installationId);
  if (!installation) return null;

  const isAdmin = await checkInstallationAdmin(accessToken, installation);
  return { accessToken, installationId, installation, isAdmin };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id");
  if (!installationId) return NextResponse.json({ error: "Missing installation_id" }, { status: 400 });

  // Verify the user has access to this installation
  try {
    const installations = await fetchUserInstallations(accessToken);
    const hasAccess = installations.some((i) => String(i.id) === installationId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    return NextResponse.json({ settings: DEFAULT_INSTALLATION_SETTINGS });
  }

  try {
    const store = await getDashboardStore();
    const settings = await store.installations.getSettings(installationId);
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ settings: DEFAULT_INSTALLATION_SETTINGS });
  }
}

export async function PUT(req: NextRequest) {
  let auth;
  try {
    auth = await getAuthenticatedAdmin(req);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    throw err;
  }
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const settings = body.settings as InstallationSettings;
  if (!settings) return NextResponse.json({ error: "Missing settings" }, { status: 400 });

  // Validate
  if (!["Low", "Med", "High"].includes(settings.severityThreshold)) {
    return NextResponse.json({ error: "Invalid severityThreshold" }, { status: 400 });
  }
  if (typeof settings.maxComments !== "number" || settings.maxComments < 1 || settings.maxComments > 50) {
    return NextResponse.json({ error: "maxComments must be 1-50" }, { status: 400 });
  }
  if (typeof settings.customInstructions !== "string" || settings.customInstructions.length > 1000) {
    return NextResponse.json({ error: "customInstructions too long" }, { status: 400 });
  }

  try {
    const store = await getDashboardStore();
    await store.installations.updateSettings(auth.installationId, settings);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save settings:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
