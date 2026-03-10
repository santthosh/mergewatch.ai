/**
 * Spinner — consistent loading indicator used across the app.
 *
 * Sizes: sm (16px), md (20px), lg (32px)
 */
export default function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" }[size];
  const border = size === "lg" ? "border-[3px]" : "border-2";

  return (
    <div
      className={`${dims} ${border} animate-spin rounded-full border-zinc-600 border-t-primer-green`}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * LoadingOverlay — covers the page/container with a centered spinner.
 * Use for full-page transitions like org switching.
 */
export function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Spinner size="lg" />
      {label && (
        <p className="text-sm text-primer-muted">{label}</p>
      )}
    </div>
  );
}
