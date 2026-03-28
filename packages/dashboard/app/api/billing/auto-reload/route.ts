import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchUserInstallations, checkInstallationAdmin, TokenExpiredError } from "@/lib/github-repos";

const BILLING_API_URL = process.env.BILLING_API_URL;
const BILLING_API_SECRET = process.env.BILLING_API_SECRET;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const installationId = body.installationId as string | undefined;
  if (!installationId) return NextResponse.json({ error: "Missing installationId" }, { status: 400 });

  // Verify admin access
  try {
    const installations = await fetchUserInstallations(accessToken);
    const installation = installations.find((i) => String(i.id) === installationId);
    if (!installation) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const isAdmin = await checkInstallationAdmin(accessToken, installation);
    if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    throw err;
  }

  if (!BILLING_API_URL) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const res = await fetch(`${BILLING_API_URL}/auto-reload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(BILLING_API_SECRET ? { Authorization: `Bearer ${BILLING_API_SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
