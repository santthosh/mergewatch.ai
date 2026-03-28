import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchUserInstallations, TokenExpiredError } from "@/lib/github-repos";

const BILLING_API_URL = process.env.BILLING_API_URL;
const BILLING_API_SECRET = process.env.BILLING_API_SECRET;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id");
  if (!installationId) return NextResponse.json({ error: "Missing installation_id" }, { status: 400 });

  // Verify access
  try {
    const installations = await fetchUserInstallations(accessToken);
    const hasAccess = installations.some((i) => String(i.id) === installationId);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    throw err;
  }

  if (!BILLING_API_URL) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const res = await fetch(`${BILLING_API_URL}/status?installationId=${installationId}`, {
    headers: BILLING_API_SECRET ? { Authorization: `Bearer ${BILLING_API_SECRET}` } : {},
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
