"use client";

import { useState } from "react";
import RelativeTime from "./RelativeTime";
import { ChevronRight, ChevronDown, GitCommit } from "lucide-react";

/** Shape of a single review record (matches the DynamoDB schema). */
export interface Review {
  id: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  model: string;
  createdAt: string;
}

/** Extract short commit SHA from review id (format: "prNumber#commitSha"). */
function commitSha(r: Review): string {
  return r.id.split("#")[1] ?? "";
}

/** Maps review status to a coloured badge. */
const statusStyles: Record<Review["status"], { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-primer-orange/15", text: "text-primer-orange", label: "Pending" },
  in_progress: { bg: "bg-primer-blue/15", text: "text-primer-blue", label: "In Progress" },
  completed: { bg: "bg-primer-green/15", text: "text-primer-green", label: "Completed" },
  failed: { bg: "bg-primer-red/15", text: "text-primer-red", label: "Failed" },
  skipped: { bg: "bg-[#555]/15", text: "text-fg-secondary", label: "Skipped" },
};

function StatusBadge({ status }: { status: Review["status"] }) {
  const s = statusStyles[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

/** Group reviews by PR (repo + prNumber). Returns groups sorted by latest review. */
function groupByPR(reviews: Review[]): { key: string; latest: Review; older: Review[] }[] {
  const map = new Map<string, Review[]>();
  for (const r of reviews) {
    const key = `${r.repoFullName}#${r.prNumber}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }

  const groups: { key: string; latest: Review; older: Review[] }[] = [];
  map.forEach((list, key) => {
    list.sort((a: Review, b: Review) => b.createdAt.localeCompare(a.createdAt));
    groups.push({ key, latest: list[0], older: list.slice(1) });
  });

  groups.sort((a: { latest: Review }, b: { latest: Review }) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  return groups;
}

function PRGroup({
  latest,
  older,
  onSelect,
}: {
  latest: Review;
  older: Review[];
  onSelect?: (r: Review) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOlder = older.length > 0;

  return (
    <>
      <div className="flex gap-2">
        {hasOlder ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-start pt-3.5 pl-1 text-primer-blue"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <div className="w-5 shrink-0" />
        )}
        <button
          onClick={() => onSelect?.(latest)}
          className="min-w-0 flex-1 rounded-lg border border-border-default bg-surface-card px-4 py-3 text-left transition hover:border-fg-faint hover:bg-surface-card-hover"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-fg-primary">
                #{latest.prNumber} {latest.prTitle || latest.repoFullName}
              </span>
              <p className="mt-0.5 truncate text-xs text-fg-tertiary">
                {latest.repoFullName}
              </p>
            </div>
            <StatusBadge status={latest.status} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-fg-tertiary">
            <span className="inline-flex items-center gap-1">
              <GitCommit size={11} />
              <code>{commitSha(latest)}</code>
            </span>
            {latest.model && <span>{latest.model}</span>}
            <RelativeTime date={latest.createdAt} />
          </div>
        </button>
      </div>

      {expanded && older.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect?.(r)}
          className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-border-subtle bg-surface-inset px-4 py-2.5 text-left transition hover:border-fg-faint hover:bg-surface-card-hover"
        >
          <div className="flex items-center gap-3 text-xs text-fg-tertiary">
            <span className="inline-flex items-center gap-1">
              <GitCommit size={11} />
              <code>{commitSha(r)}</code>
            </span>
            <StatusBadge status={r.status} />
            <RelativeTime date={r.createdAt} />
          </div>
        </button>
      ))}
    </>
  );
}

function PRTableGroup({
  latest,
  older,
  onSelect,
}: {
  latest: Review;
  older: Review[];
  onSelect?: (r: Review) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOlder = older.length > 0;

  return (
    <>
      <tr
        onClick={() => onSelect?.(latest)}
        className="cursor-pointer transition hover:bg-surface-card-hover"
      >
        <td className="w-10 px-2 py-3 text-center">
          {hasOlder ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="inline-flex items-center justify-center rounded p-1 text-primer-blue hover:bg-surface-subtle"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-4 py-3 font-medium text-fg-primary">
          {latest.repoFullName}
        </td>
        <td className="px-4 py-3 text-fg-primary">
          #{latest.prNumber} {latest.prTitle}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className="inline-flex items-center gap-1 text-fg-secondary">
            <GitCommit size={12} />
            <code className="text-xs">{commitSha(latest)}</code>
          </span>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={latest.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-fg-tertiary">
          <RelativeTime date={latest.createdAt} />
        </td>
      </tr>
      {expanded && older.map((r) => (
        <tr
          key={r.id}
          onClick={() => onSelect?.(r)}
          className="cursor-pointer bg-surface-inset transition hover:bg-surface-card-hover"
        >
          <td className="w-10" />
          <td className="px-4 py-2 text-xs text-fg-secondary" />
          <td className="px-4 py-2 text-xs text-fg-secondary">
            #{r.prNumber} {r.prTitle}
          </td>
          <td className="whitespace-nowrap px-4 py-2">
            <span className="inline-flex items-center gap-1 text-fg-secondary">
              <GitCommit size={11} />
              <code className="text-xs">{commitSha(r)}</code>
            </span>
          </td>
          <td className="px-4 py-2">
            <StatusBadge status={r.status} />
          </td>
          <td className="whitespace-nowrap px-4 py-2 text-fg-tertiary">
            <RelativeTime date={r.createdAt} />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function ReviewTable({
  reviews,
  onSelect,
}: {
  reviews: Review[];
  onSelect?: (review: Review) => void;
}) {
  if (reviews.length === 0) {
    return (
      <div className="rounded-lg border border-border-default bg-surface-card p-12 text-center">
        <p className="text-base font-medium text-fg-primary">No reviews yet</p>
        <p className="mt-2 text-sm text-fg-secondary">
          Reviews will appear here once MergeWatch has reviewed some pull requests.
        </p>
      </div>
    );
  }

  const groups = groupByPR(reviews);

  return (
    <>
      {/* Mobile: card layout */}
      <div className="flex flex-col gap-2 md:hidden">
        {groups.map((g) => (
          <PRGroup key={g.key} latest={g.latest} older={g.older} onSelect={onSelect} />
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden overflow-x-auto rounded-lg border border-border-default md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-default bg-surface-card text-xs uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="w-10 px-2 py-3" />
              <th className="px-4 py-3">Repo</th>
              <th className="px-4 py-3">Pull Request</th>
              <th className="px-4 py-3">Commit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {groups.map((g) => (
              <PRTableGroup key={g.key} latest={g.latest} older={g.older} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
