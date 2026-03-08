"use client";

import { useState } from "react";
import RepoCard from "./RepoCard";
import ReviewTable, { type Review } from "./ReviewTable";
import ReviewDrawer from "./ReviewDrawer";
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
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

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

  function handleReviewSelect(review: Review) {
    setSelectedReviewId(`${review.repoFullName}:${review.id}`);
  }

  if (saving) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-10">
        <LoadingOverlay label="Updating monitored repositories..." />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default flex items-start justify-between sm:px-8 sm:pt-8 sm:pb-6">
        <div>
          <h1 className="text-fg-primary text-xl font-semibold">Home</h1>
          <p className="text-fg-tertiary text-sm mt-1">
            Overview of your monitored repositories and recent reviews.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowManage(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card-hover border border-[#2a2a2a] rounded-md text-sm text-fg-secondary hover:text-fg-primary hover:border-fg-faint transition-colors"
          >
            Manage Repositories
          </button>
        )}
      </div>

      {/* Manage Repos Modal */}
      {showManage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay sm:items-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl border border-border-default bg-surface-card p-4 shadow-2xl sm:max-w-xl sm:rounded-xl sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-fg-primary">Manage Repositories</h2>
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
      <section className="px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted pb-3">
          Monitored Repositories
        </h2>
        {repos.length === 0 ? (
          <div className="rounded-lg border border-border-default bg-surface-card px-6 py-10 text-center">
            <p className="text-sm text-fg-tertiary">
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
      <section className="px-4 pb-6 sm:px-8 sm:pb-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted pb-3">
          Recent Reviews
        </h2>
        <ReviewTable reviews={reviews} onSelect={handleReviewSelect} />
      </section>

      {/* Drawer */}
      {selectedReviewId && (
        <ReviewDrawer
          reviewId={selectedReviewId}
          onClose={() => setSelectedReviewId(null)}
        />
      )}
    </div>
  );
}
