"use client";

/**
 * RepoCard — displays a single connected repository.
 *
 * Shows the repo's full name (org/repo), install date, and the
 * total number of reviews MergeWatch has performed on it.
 */
export default function RepoCard({
  repoFullName,
  installedAt,
  reviewCount,
}: {
  repoFullName: string;
  installedAt: string;
  reviewCount: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-4">
      {/* Repo name + install date */}
      <div>
        <a
          href={`https://github.com/${repoFullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primer-blue hover:underline"
        >
          {repoFullName}
        </a>
        <p className="mt-0.5 text-xs text-primer-muted">
          Connected {new Date(installedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Review count badge */}
      <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-primer-green">
        {reviewCount} review{reviewCount !== 1 && "s"}
      </span>
    </div>
  );
}
