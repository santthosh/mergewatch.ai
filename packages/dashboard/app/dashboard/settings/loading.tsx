export default function SettingsLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default sm:px-8 sm:pt-8 sm:pb-6">
        <div className="h-6 w-28 animate-pulse rounded bg-surface-subtle" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-surface-subtle" />
      </div>

      {/* Settings sections skeleton */}
      <div className="px-4 sm:px-8 pb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="mt-8">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-subtle mb-4" />
            <div className="rounded-lg border border-border-default overflow-hidden">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex items-center justify-between px-4 py-4 border-b border-border-subtle last:border-0">
                  <div>
                    <div className="h-4 w-36 animate-pulse rounded bg-surface-subtle" />
                    <div className="mt-1.5 h-3 w-52 animate-pulse rounded bg-surface-subtle" />
                  </div>
                  <div className="h-6 w-11 animate-pulse rounded-full bg-surface-subtle" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
