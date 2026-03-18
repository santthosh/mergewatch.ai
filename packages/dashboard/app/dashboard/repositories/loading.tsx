export default function RepositoriesLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default sm:px-8 sm:pt-8 sm:pb-6">
        <div className="h-6 w-40 animate-pulse rounded bg-surface-subtle" />
        <div className="mt-2 h-4 w-60 animate-pulse rounded bg-surface-subtle" />
      </div>

      {/* Repo cards skeleton */}
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-card-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}
