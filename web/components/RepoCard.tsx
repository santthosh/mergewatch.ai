"use client";

import RelativeTime from "./RelativeTime";

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
    <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] px-4 py-3 sm:px-5 sm:py-4">
      <div className="min-w-0 flex-1">
        <a
          href={`https://github.com/${repoFullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium text-white hover:text-[#00ff88] transition-colors"
        >
          {repoFullName}
        </a>
        <p className="mt-0.5 text-xs text-[#555]">
          Connected <RelativeTime date={installedAt} />
        </p>
      </div>

      <div className="ml-3 flex flex-shrink-0 items-center gap-2">
        <span className="rounded-full bg-[#00ff88]/10 px-3 py-1 text-xs font-medium text-[#00ff88]">
          {reviewCount} review{reviewCount !== 1 && "s"}
        </span>
      </div>
    </div>
  );
}
