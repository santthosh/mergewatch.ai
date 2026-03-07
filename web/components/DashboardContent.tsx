"use client";

import { useState } from "react";
import RepoCard from "./RepoCard";
import ReviewTable, { type Review } from "./ReviewTable";
import RepoPicker, { type AvailableRepo } from "./RepoPicker";
import { LoadingOverlay } from "./Spinner";

interface DashboardContentProps {
  repos: { repoFullName: string; installedAt: string; reviewCount: number }[];
  reviews: Review[];
  isAdmin?: boolean;
  installationId?: string;
  monitoredNames?: string[];
}

export default function DashboardContent({
  repos,
  reviews,
  isAdmin = false,
  installationId,
  monitoredNames: monitoredNamesArray,
}: DashboardContentProps) {
  const [showManage, setShowManage] = useState(false);
  const [saving, setSaving] = useState(false);

  const monitoredSet = new Set(monitoredNamesArray ?? repos.map((r) => r.repoFullName));

  async function handleSave(selected: AvailableRepo[]) {
    if (!installationId) return;

    setSaving(true);
    setShowManage(false);

    const res = await fetch("/api/repos/monitored", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installationId,
        repos: selected.map((r) => ({ repoFullName: r.repoFullName })),
      }),
    });

    if (res.ok) {
      window.location.reload();
    } else {
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <LoadingOverlay label="Updating monitored repositories..." />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard</h1>
        {isAdmin && (
          <button
            onClick={() => setShowManage(true)}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition hover:border-primer-blue hover:text-primer-blue"
          >
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Manage Repositories
          </button>
        )}
      </div>

      {/* Manage Repos Modal */}
      {showManage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl sm:max-w-xl sm:rounded-xl sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">Manage Repositories</h2>
            <RepoPicker
              monitoredNames={monitoredSet}
              onSave={handleSave}
              onCancel={() => setShowManage(false)}
              saveLabel="Save Changes"
              installationId={installationId}
            />
          </div>
        </div>
      )}

      {/* Connected repos */}
      <section className="mt-8 sm:mt-10">
        <h2 className="mb-4 text-lg font-semibold">Monitored Repositories</h2>
        {repos.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-6 py-10 text-center">
            <p className="text-sm text-primer-muted">
              {isAdmin
                ? "No repositories are being monitored. Click \"Manage Repositories\" to select repos."
                : "No repositories are being monitored for this organization."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard
                key={repo.repoFullName}
                {...repo}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent reviews */}
      <section className="mt-8 sm:mt-12">
        <h2 className="mb-4 text-lg font-semibold">Recent Reviews</h2>
        <ReviewTable reviews={reviews} />
      </section>
    </div>
  );
}
