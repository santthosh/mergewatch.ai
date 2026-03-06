"use client";

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
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 sm:px-5 sm:py-4">
      {/* Repo name + install date */}
      <div className="min-w-0 flex-1">
        <a
          href={`https://github.com/${repoFullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium text-primer-blue hover:underline"
        >
          {repoFullName}
        </a>
        <p className="mt-0.5 text-xs text-primer-muted">
          Connected {new Date(installedAt).toLocaleDateString()}
        </p>
      </div>

      <div className="ml-3 flex flex-shrink-0 items-center gap-2">
        {/* Review count badge */}
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-primer-green">
          {reviewCount} review{reviewCount !== 1 && "s"}
        </span>
      </div>
    </div>
  );
}
