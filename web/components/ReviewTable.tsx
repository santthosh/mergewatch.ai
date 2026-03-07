"use client";

import Link from "next/link";

/** Shape of a single review record (matches the DynamoDB schema). */
export interface Review {
  id: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  model: string;
  createdAt: string;
}

/** Build a URL-safe review detail path. id is "prNumber#commitSha", we encode "owner/repo:prNumber#commitSha". */
function reviewHref(r: Review): string {
  return `/dashboard/reviews/${encodeURIComponent(`${r.repoFullName}:${r.id}`)}`;
}

/** Maps review status to a coloured badge. */
const statusStyles: Record<Review["status"], string> = {
  pending: "bg-primer-orange/20 text-primer-orange",
  in_progress: "bg-primer-blue/20 text-primer-blue",
  completed: "bg-primer-green/20 text-primer-green",
  failed: "bg-primer-red/20 text-primer-red",
};

function StatusBadge({ status }: { status: Review["status"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function ReviewTable({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-primer-muted">
        No reviews yet. Connect a repo and open a pull request to get started.
      </p>
    );
  }

  return (
    <>
      {/* Mobile: card layout */}
      <div className="flex flex-col gap-3 md:hidden">
        {reviews.map((r) => (
          <Link
            key={r.id}
            href={reviewHref(r)}
            className="block rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition hover:border-zinc-700 hover:bg-zinc-900/80"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-white">
                  #{r.prNumber} {r.prTitle || r.repoFullName}
                </span>
                <p className="mt-0.5 truncate text-xs text-primer-muted">
                  {r.repoFullName}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-primer-muted">
              {r.model && <span>{r.model}</span>}
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-primer-muted">
            <tr>
              <th className="px-4 py-3">Repo</th>
              <th className="px-4 py-3">Pull Request</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {reviews.map((r) => (
              <tr key={r.id} className="transition hover:bg-zinc-900/40">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-primer-blue">
                  <Link href={reviewHref(r)} className="hover:underline">
                    {r.repoFullName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={reviewHref(r)} className="hover:underline">
                    #{r.prNumber} {r.prTitle}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-primer-muted">
                  {r.model}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-primer-muted">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
