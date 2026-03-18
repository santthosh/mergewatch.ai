export default function ReviewsLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default sm:px-8 sm:pt-8 sm:pb-6">
        <div className="h-6 w-28 animate-pulse rounded bg-surface-subtle" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface-subtle" />
      </div>

      {/* Stats strip skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 px-4 py-4 border-b border-border-default sm:px-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border-default bg-surface-card px-4 py-3">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-subtle" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-surface-subtle" />
          </div>
        ))}
      </div>

      {/* Filter bar skeleton */}
      <div className="px-4 py-4 border-b border-border-default sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="h-9 w-48 animate-pulse rounded-lg bg-surface-subtle" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-subtle" />
        </div>
      </div>

      {/* Table rows skeleton */}
      <div className="space-y-2 p-4 sm:p-8">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-card-hover" />
        ))}
      </div>
    </div>
  );
}
