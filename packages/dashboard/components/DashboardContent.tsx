"use client";

import { useState, useEffect } from "react";
import RepoCard from "./RepoCard";
import ReviewTable, { type Review } from "./ReviewTable";
import ReviewDrawer from "./ReviewDrawer";
import RepoPicker, { type AvailableRepo } from "./RepoPicker";
import { LoadingOverlay } from "./Spinner";

interface DashboardContentProps {
  repos: { repoFullName: string; installedAt: string; reviewCount: number }[];
  reviews?: Review[];
  isAdmin?: boolean;
  installationId?: string;
  monitoredNames?: string[];
}

export default function DashboardContent({
  repos,
  reviews: serverReviews,
  isAdmin = false,
  installationId,
  monitoredNames: monitoredNamesArray,
}: DashboardContentProps) {
  const [showManage, setShowManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>(serverReviews ?? []);
  const [loadingReviews, setLoadingReviews] = useState(!serverReviews?.length);

  const monitoredSet = new Set(monitoredNamesArray ?? repos.map((r) => r.repoFullName));

  // Per-repo review counts derived from fetched reviews
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});

  // Fetch reviews client-side from /api/reviews (works reliably on Amplify)
  useEffect(() => {
    if (serverReviews && serverReviews.length > 0) return;
    if (!installationId) return;

    let cancelled = false;
    async function fetchReviews() {
      try {
        const res = await fetch(`/api/reviews?installation_id=${installationId}&limit=100`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const mapped = (data.reviews ?? []).map((r: any) => ({
            id: r.id,
            repoFullName: r.repoFullName,
            prNumber: r.prNumber,
            prTitle: r.prTitle ?? "",
            status: r.status,
            model: r.model ?? "",
            createdAt: r.createdAt ?? "",
          }));
          setReviews(mapped);

          // Compute per-repo review counts
          const counts: Record<string, number> = {};
          for (const r of mapped) {
            counts[r.repoFullName] = (counts[r.repoFullName] ?? 0) + 1;
          }
          setReviewCounts(counts);
        }
      } catch {
        // Silently ignore — reviews section will show empty state
      } finally {
        if (!cancelled) setLoadingReviews(false);
      }
    }

    fetchReviews();
    return () => { cancelled = true; };
  }, [installationId, serverReviews]);

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
          <div className="rounded-lg border border-border-default bg-surface-card p-12 text-center">
            <p className="text-base font-medium text-fg-primary">No monitored repositories</p>
            <p className="mt-2 text-sm text-fg-secondary">
              {isAdmin
                ? "Click \"Manage Repositories\" to select which repos MergeWatch should review."
                : "No repositories are being monitored for this organization."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard
                key={repo.repoFullName}
                repoFullName={repo.repoFullName}
                installedAt={repo.installedAt}
                reviewCount={reviewCounts[repo.repoFullName] ?? 0}
                loading={loadingReviews}
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
        {loadingReviews ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-card-hover" />
            ))}
          </div>
        ) : (
          <ReviewTable reviews={reviews} onSelect={handleReviewSelect} />
        )}
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
