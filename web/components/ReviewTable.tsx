"use client";

/**
 * ReviewTable — renders recent PR reviews in a responsive table.
 *
 * Each row shows the repo, PR number/title, review status, the model
 * that was used, and a human-readable timestamp.
 */

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

/** Maps review status to a coloured badge. */
const statusStyles: Record<Review["status"], string> = {
  pending: "bg-primer-orange/20 text-primer-orange",
  in_progress: "bg-primer-blue/20 text-primer-blue",
  completed: "bg-primer-green/20 text-primer-green",
  failed: "bg-primer-red/20 text-primer-red",
};

export default function ReviewTable({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-primer-muted">
        No reviews yet. Connect a repo and open a pull request to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
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
                {r.repoFullName}
              </td>
              <td className="px-4 py-3">
                <a
                  href={`https://github.com/${r.repoFullName}/pull/${r.prNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  #{r.prNumber} {r.prTitle}
                </a>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[r.status]}`}
                >
                  {r.status.replace("_", " ")}
                </span>
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
  );
}
