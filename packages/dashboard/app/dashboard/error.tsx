"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] Unhandled error:", error);
  }, [error]);

  const isTimeout =
    error.message?.includes("fetch failed") ||
    error.message?.includes("Connect Timeout") ||
    error.message?.includes("ETIMEDOUT") ||
    error.message?.includes("UND_ERR");

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="rounded-lg border border-border-default bg-surface-card p-12 text-center">
        <p className="text-base font-medium text-fg-primary">
          {isTimeout ? "Connection timed out" : "Something went wrong"}
        </p>
        <p className="mt-2 text-sm text-fg-secondary">
          {isTimeout
            ? "We couldn't reach GitHub. This is usually temporary — please try again."
            : "An unexpected error occurred while loading this page."}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-md bg-[#00ff88] px-4 py-2 text-sm font-medium text-black hover:bg-[#00e67a] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
