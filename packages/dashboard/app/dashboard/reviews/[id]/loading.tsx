export default function ReviewDetailLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      {/* Back link skeleton */}
      <div className="h-4 w-32 animate-pulse rounded bg-surface-subtle mb-6" />

      {/* Header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="h-7 w-80 animate-pulse rounded bg-surface-subtle" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-surface-subtle" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-surface-subtle" />
      </div>

      {/* Two-column skeleton */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border-default overflow-hidden">
          <div className="bg-surface-card-hover px-4 py-2.5 border-b border-border-default">
            <div className="h-3 w-28 animate-pulse rounded bg-surface-subtle" />
          </div>
          <div className="space-y-0 divide-y divide-border-subtle px-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="h-4 w-4 animate-pulse rounded bg-surface-subtle" />
                <div className="flex-1">
                  <div className="h-3 w-16 animate-pulse rounded bg-surface-subtle" />
                  <div className="mt-1.5 h-4 w-32 animate-pulse rounded bg-surface-subtle" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border-default overflow-hidden">
          <div className="bg-surface-card-hover px-4 py-2.5 border-b border-border-default">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-subtle" />
          </div>
          <div className="space-y-0 divide-y divide-border-subtle">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="h-4 w-28 animate-pulse rounded bg-surface-subtle" />
                <div className="h-4 w-16 animate-pulse rounded bg-surface-subtle" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
