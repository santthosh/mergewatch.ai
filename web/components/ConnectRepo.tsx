"use client";

/**
 * ConnectRepo — a CTA button that sends the user to the GitHub App
 * installation page so they can grant MergeWatch access to new repos.
 *
 * The install URL is read from the NEXT_PUBLIC_GITHUB_APP_URL env var
 * so it can differ between staging and production.
 */
export default function ConnectRepo() {
  const appUrl =
    process.env.NEXT_PUBLIC_GITHUB_APP_URL ??
    "https://github.com/apps/mergewatch-ai/installations/new";

  return (
    <a
      href={appUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition hover:border-primer-green hover:text-primer-green"
    >
      {/* GitHub-style "+" icon */}
      <svg
        className="mr-2 h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4v16m8-8H4"
        />
      </svg>
      Connect Repo
    </a>
  );
}
