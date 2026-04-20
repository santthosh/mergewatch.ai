"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Copy, Check, X, Trash2, Plus, AlertTriangle } from "lucide-react";

interface ApiKey {
  keyHash: string;
  label: string;
  scope: "all" | string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  prefix: string;
}

interface Props {
  installationId: string;
  isAdmin: boolean;
  accountLogin: string;
  accountType: "User" | "Organization";
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function scopeSummary(scope: "all" | string[]) {
  if (scope === "all") return "All repos";
  if (scope.length === 1) return scope[0];
  return `${scope.length} repos`;
}

export default function ApiKeysManager({
  installationId,
  isAdmin,
  accountLogin,
  accountType,
}: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ raw: string; label: string } | null>(null);
  const [revokingHash, setRevokingHash] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/api-keys?installation_id=${encodeURIComponent(installationId)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreated = useCallback(
    (raw: string, label: string) => {
      setRevealedKey({ raw, label });
      setModalOpen(false);
      loadKeys();
    },
    [loadKeys]
  );

  const handleRevoke = useCallback(
    async (keyHash: string, label: string) => {
      if (!confirm(`Revoke "${label}"? This cannot be undone.`)) return;
      setRevokingHash(keyHash);
      try {
        const res = await fetch(
          `/api/api-keys?key_hash=${encodeURIComponent(keyHash)}&installation_id=${encodeURIComponent(installationId)}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setKeys((prev) => prev.filter((k) => k.keyHash !== keyHash));
        }
      } finally {
        setRevokingHash(null);
      }
    },
    [installationId]
  );

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default sm:px-8 sm:pt-8 sm:pb-6">
        <h1 className="text-fg-primary text-xl font-semibold">API Keys</h1>
        <p className="text-fg-tertiary text-sm mt-1">
          API keys unlock the MergeWatch MCP server for coding agents in this installation.
        </p>
      </div>

      <div className="px-4 sm:px-8 pb-6">
        {/* Read-only banner */}
        {!isAdmin && (
          <div className="flex items-center gap-2 px-4 py-2.5 mt-6 bg-surface-subtle border border-surface-subtle rounded-lg text-fg-secondary text-sm">
            <Lock size={13} className="shrink-0" />
            <span>
              Only{" "}
              {accountType === "Organization" ? "org owners" : "the account owner"} can create or revoke keys.
              {accountType === "Organization" && (
                <>
                  {" "}
                  Manage roles in{" "}
                  <a
                    href={`https://github.com/orgs/${accountLogin}/people`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-green hover:underline"
                  >
                    GitHub
                  </a>
                  .
                </>
              )}
            </span>
          </div>
        )}

        {/* One-time reveal panel */}
        {revealedKey && (
          <RevealPanel
            raw={revealedKey.raw}
            label={revealedKey.label}
            onDismiss={() => setRevealedKey(null)}
          />
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">
            Keys
          </h2>
          {isAdmin && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-[#00ff88] px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-[#00e67a]"
            >
              <Plus size={14} />
              Generate new key
            </button>
          )}
        </div>

        {/* Keys list */}
        <div className="mt-3 rounded-lg border border-border-default overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-fg-tertiary">Loading…</div>
          ) : keys.length === 0 ? (
            <div className="p-6 text-sm text-fg-tertiary">
              No API keys yet. Generate one to get started.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {keys.map((k) => (
                <div
                  key={k.keyHash}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3.5 gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg-primary truncate">{k.label}</div>
                    <div className="text-xs text-fg-tertiary mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <code className="font-mono text-[11px] text-fg-secondary">
                        {k.prefix}
                      </code>
                      <span>{scopeSummary(k.scope)}</span>
                      <span>Created {formatDate(k.createdAt)}</span>
                      <span>Last used {formatDate(k.lastUsedAt)}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRevoke(k.keyHash, k.label)}
                      disabled={revokingHash === k.keyHash}
                      className="flex items-center gap-1 rounded-md border border-surface-subtle px-2.5 py-1.5 text-xs text-fg-secondary transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 size={12} />
                      {revokingHash === k.keyHash ? "Revoking…" : "Revoke"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <CreateKeyModal
          installationId={installationId}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ─── One-time reveal panel ─────────────────────────────────────────────────

function RevealPanel({
  raw,
  label,
  onDismiss,
}: {
  raw: string;
  label: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; user can still select manually
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-[#00ff88]/40 bg-[#00ff88]/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#00ff88]" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-fg-primary">
            Key created: {label}
          </div>
          <p className="text-xs text-fg-tertiary mt-1">
            This is the only time you&apos;ll see this key. Store it somewhere safe.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded bg-surface-inset px-3 py-2 text-xs font-mono text-fg-primary">
              {raw}
            </code>
            <button
              onClick={copy}
              className="flex items-center gap-1 rounded-md border border-surface-subtle px-2.5 py-2 text-xs text-fg-secondary transition-colors hover:text-fg-primary"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3">
            <button
              onClick={onDismiss}
              className="text-xs text-fg-secondary hover:text-fg-primary underline"
            >
              I&apos;ve saved it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create-key modal ───────────────────────────────────────────────────────

function CreateKeyModal({
  installationId,
  onClose,
  onCreated,
}: {
  installationId: string;
  onClose: () => void;
  onCreated: (raw: string, label: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [scopeMode, setScopeMode] = useState<"all" | "specific">("all");
  const [repos, setRepos] = useState<string[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (scopeMode !== "specific" || repos.length > 0) return;
    setReposLoading(true);
    fetch(`/api/repos?installation_id=${encodeURIComponent(installationId)}&per_page=100`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .then((d) => setRepos((d.repos ?? []).map((r: any) => r.repoFullName)))
      .finally(() => setReposLoading(false));
  }, [scopeMode, installationId, repos.length]);

  function toggleRepo(full: string) {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(full)) next.delete(full);
      else next.add(full);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (scopeMode === "specific" && selectedRepos.size === 0) {
      setError("Select at least one repo.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          label: label.trim(),
          scope: scopeMode === "all" ? "all" : Array.from(selectedRepos),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create key.");
        return;
      }
      onCreated(data.raw, data.label);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4">
      <div className="w-full max-w-md rounded-lg border border-border-default bg-surface-elevated p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-fg-primary">
            Generate new API key
          </h3>
          <button
            onClick={onClose}
            className="text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 100))}
              placeholder="e.g. Laptop — Cursor"
              className="w-full rounded-md border border-surface-subtle bg-surface-card-hover px-3 py-2 text-sm text-fg-primary placeholder-fg-muted focus:border-[#00ff88]/40 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              Scope
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
                <input
                  type="radio"
                  checked={scopeMode === "all"}
                  onChange={() => setScopeMode("all")}
                />
                All repos in this installation
              </label>
              <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
                <input
                  type="radio"
                  checked={scopeMode === "specific"}
                  onChange={() => setScopeMode("specific")}
                />
                Specific repos
              </label>
            </div>

            {scopeMode === "specific" && (
              <div className="mt-2 max-h-48 overflow-auto rounded-md border border-surface-subtle bg-surface-inset">
                {reposLoading ? (
                  <div className="p-3 text-xs text-fg-tertiary">Loading repos…</div>
                ) : repos.length === 0 ? (
                  <div className="p-3 text-xs text-fg-tertiary">No repos available.</div>
                ) : (
                  repos.map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-fg-secondary hover:bg-hover cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRepos.has(r)}
                        onChange={() => toggleRepo(r)}
                      />
                      <span className="truncate font-mono">{r}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-400">{error}</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:text-fg-primary"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "bg-[#00ff88] text-black hover:bg-[#00e67a]",
              "disabled:opacity-60"
            )}
          >
            {submitting ? "Creating…" : "Create key"}
          </button>
        </div>
      </div>
    </div>
  );
}
