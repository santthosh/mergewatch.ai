"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import RepoCard from "./RepoCard";
import ReviewTable, { type Review } from "./ReviewTable";
import ReviewDrawer from "./ReviewDrawer";

interface DashboardContentProps {
  repos: { repoFullName: string; reviewCount: number; lastReviewedAt: string | null }[];
  installationId?: string;
}

export default function DashboardContent({
  repos,
  installationId,
}: DashboardContentProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  // Fetch reviews client-side from /api/reviews (works reliably on Amplify)
  useEffect(() => {
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
        }
      } catch {
        // Silently ignore — reviews section will show empty state
      } finally {
        if (!cancelled) setLoadingReviews(false);
      }
    }

    fetchReviews();
    return () => { cancelled = true; };
  }, [installationId]);

  function handleReviewSelect(review: Review) {
    setSelectedReviewId(`${review.repoFullName}:${review.id}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default sm:px-8 sm:pt-8 sm:pb-6">
        <div>
          <h1 className="text-fg-primary text-xl font-semibold">Home</h1>
          <p className="text-fg-tertiary text-sm mt-1">
            Repositories with recent review activity.
          </p>
        </div>
      </div>

      {/* Active repos */}
      <section className="px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted pb-3">
          Active Repositories
        </h2>
        {repos.length === 0 ? (
          <div className="rounded-lg border border-border-default bg-surface-card p-12 text-center">
            <p className="text-base font-medium text-fg-primary">No reviews yet</p>
            <p className="mt-2 text-sm text-fg-secondary">
              MergeWatch will automatically review PRs on all installed repos.
              Open a pull request to see your first review.
            </p>
            <Link
              href="/dashboard/repositories"
              className="mt-4 inline-block text-sm text-accent-green hover:underline"
            >
              View all repositories
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard
                key={repo.repoFullName}
                repoFullName={repo.repoFullName}
                installedAt={repo.lastReviewedAt ?? ""}
                reviewCount={repo.reviewCount}
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
