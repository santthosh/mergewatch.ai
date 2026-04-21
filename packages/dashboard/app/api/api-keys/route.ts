import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  fetchUserInstallations,
  checkInstallationAdmin,
  TokenExpiredError,
} from "@/lib/github-repos";
import { generateApiKey } from "@/lib/api-keys";
import type { ApiKeyRecord, IApiKeyStore } from "@mergewatch/core";

export const dynamic = "force-dynamic";

// ─── Store singleton (SaaS only — API keys are a DynamoDB-backed feature) ───

let _store: IApiKeyStore | null = null;

async function getApiKeyStore(): Promise<IApiKeyStore> {
  if (_store) return _store;
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
  const { DynamoApiKeyStore } = await import("@mergewatch/storage-dynamo");

  const raw = new DynamoDBClient({
    region: process.env.APP_REGION ?? process.env.AWS_REGION ?? "us-east-1",
  });
  const client = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
  });
  _store = new DynamoApiKeyStore(
    client,
    process.env.API_KEYS_TABLE ?? "mergewatch-api-keys",
  );
  return _store;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Synthesise a display prefix from the hash — never reveals any secret material. */
function displayPrefix(keyHash: string): string {
  return `mw_sk_…${keyHash.slice(0, 8)}`;
}

function toPublicRecord(r: ApiKeyRecord) {
  return {
    keyHash: r.keyHash,
    label: r.label,
    scope: r.scope,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt ?? null,
    prefix: displayPrefix(r.keyHash),
  };
}

async function requireInstallationAccess(
  accessToken: string,
  installationId: string,
) {
  const installations = await fetchUserInstallations(accessToken);
  const installation = installations.find((i) => String(i.id) === installationId);
  if (!installation) return { ok: false as const, reason: "forbidden" };
  return { ok: true as const, installation };
}

// ─── GET /api/api-keys?installation_id=... ─────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const installationId = req.nextUrl.searchParams.get("installation_id");
  if (!installationId) {
    return NextResponse.json({ error: "Missing installation_id" }, { status: 400 });
  }

  try {
    const access = await requireInstallationAccess(accessToken, installationId);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const store = await getApiKeyStore();
    const records = await store.listByInstallation(installationId);
    const keys = records
      .map(toPublicRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ keys });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/api-keys GET] error:", err);
    return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
  }
}

// ─── POST /api/api-keys ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  const githubUserId = (session as any).githubUserId as string | undefined;
  if (!accessToken || !githubUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { installationId?: string; label?: string; scope?: "all" | string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const installationId = body.installationId;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const scope = body.scope;

  if (!installationId) {
    return NextResponse.json({ error: "Missing installationId" }, { status: 400 });
  }
  if (!label || label.length > 100) {
    return NextResponse.json({ error: "Label required (1-100 chars)" }, { status: 400 });
  }
  if (scope !== "all" && !(Array.isArray(scope) && scope.every((s) => typeof s === "string"))) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }
  if (Array.isArray(scope) && scope.length === 0) {
    return NextResponse.json({ error: "Select at least one repo" }, { status: 400 });
  }

  try {
    const access = await requireInstallationAccess(accessToken, installationId);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const isAdmin = await checkInstallationAdmin(accessToken, access.installation);
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { raw, hash } = generateApiKey();
    const record: Omit<ApiKeyRecord, "lastUsedAt"> = {
      keyHash: hash,
      installationId,
      label,
      scope,
      createdBy: githubUserId,
      createdAt: new Date().toISOString(),
    };

    const store = await getApiKeyStore();
    await store.create(record);

    return NextResponse.json({
      keyHash: record.keyHash,
      label: record.label,
      scope: record.scope,
      raw,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/api-keys POST] error:", err);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}

// ─── DELETE /api/api-keys?key_hash=...&installation_id=... ─────────────────

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keyHash = req.nextUrl.searchParams.get("key_hash");
  const installationId = req.nextUrl.searchParams.get("installation_id");
  if (!keyHash || !installationId) {
    return NextResponse.json({ error: "Missing key_hash or installation_id" }, { status: 400 });
  }

  try {
    const access = await requireInstallationAccess(accessToken, installationId);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const isAdmin = await checkInstallationAdmin(accessToken, access.installation);
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const store = await getApiKeyStore();
    const existing = await store.getByHash(keyHash);
    if (!existing || existing.installationId !== installationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await store.delete(keyHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    console.error("[/api/api-keys DELETE] error:", err);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
