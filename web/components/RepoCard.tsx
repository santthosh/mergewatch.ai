"use client";

export default function RepoCard({
  repoFullName,
  installedAt,
  reviewCount,
  onRemove,
}: {
  repoFullName: string;
  installedAt: string;
  reviewCount: number;
  onRemove?: (repoFullName: string) => void;
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

        {/* Remove button */}
        {onRemove && (
          <button
            onClick={() => onRemove(repoFullName)}
            title="Remove from monitoring"
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
