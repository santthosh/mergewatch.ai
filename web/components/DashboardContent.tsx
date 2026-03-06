"use client";

import { useState, useEffect, useCallback } from "react";
import RepoCard from "./RepoCard";
import ReviewTable, { type Review } from "./ReviewTable";
import ConnectRepo from "./ConnectRepo";
import RepoPicker, { type AvailableRepo } from "./RepoPicker";

interface DashboardContentProps {
  userName: string;
  repos: { repoFullName: string; installedAt: string; reviewCount: number }[];
  reviews: Review[];
}

/**
 * DashboardContent — client component that renders the normal dashboard
 * with a "Manage Repositories" panel for adding/removing monitored repos.
 */
export default function DashboardContent({
  userName,
  repos: initialRepos,
  reviews,
}: DashboardContentProps) {
  const [repos, setRepos] = useState(initialRepos);
  const [showManage, setShowManage] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const fetchAvailableRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/repos");
      if (res.ok) {
        const data = await res.json();
        setAvailableRepos(
          (data.repos ?? []).map((r: any) => ({
            repoFullName: r.repoFullName,
            installationId: r.installationId,
          })),
        );
      }
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  function openManage() {
    setShowManage(true);
    fetchAvailableRepos();
  }

  async function handleRemove(repoFullName: string) {
    const res = await fetch("/api/repos/monitored", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoFullName }),
    });

    if (res.ok) {
      setRepos((prev) => prev.filter((r) => r.repoFullName !== repoFullName));
      // If no repos left, reload to trigger onboarding
      if (repos.length <= 1) {
        window.location.reload();
      }
    }
  }

  async function handleSave(selected: AvailableRepo[]) {
    const res = await fetch("/api/repos/monitored", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repos: selected }),
    });

    if (res.ok) {
      setShowManage(false);
      window.location.reload();
    }
  }

  const monitoredNames = new Set(repos.map((r) => r.repoFullName));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-primer-muted">
            Welcome back, {userName}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openManage}
            className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition hover:border-primer-blue hover:text-primer-blue"
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
          <ConnectRepo />
        </div>
      </div>

      {/* Manage Repos Modal */}
      {showManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">Manage Repositories</h2>
            {loadingRepos ? (
              <p className="py-8 text-center text-sm text-primer-muted">
                Loading repositories...
              </p>
            ) : (
              <RepoPicker
                availableRepos={availableRepos}
                monitoredNames={monitoredNames}
                onSave={handleSave}
                onCancel={() => setShowManage(false)}
                saveLabel="Save Changes"
              />
            )}
          </div>
        </div>
      )}

      {/* Connected repos */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Monitored Repositories</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {repos.map((repo) => (
            <RepoCard
              key={repo.repoFullName}
              {...repo}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </section>

      {/* Recent reviews */}
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Recent Reviews</h2>
        <ReviewTable reviews={reviews} />
      </section>
    </div>
  );
}
