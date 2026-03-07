"use client";

import { useState } from "react";
import Link from "next/link";
import RelativeTime from "./RelativeTime";
import { ChevronRight, ChevronDown, GitCommit } from "lucide-react";

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

/** Build a URL-safe review detail path. */
function reviewHref(r: Review): string {
  return `/dashboard/reviews/${encodeURIComponent(`${r.repoFullName}:${r.id}`)}`;
}

/** Extract short commit SHA from review id (format: "prNumber#commitSha"). */
function commitSha(r: Review): string {
  return r.id.split("#")[1] ?? "";
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

function PRGroup({ latest, older }: { latest: Review; older: Review[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasOlder = older.length > 0;

  return (
    <>
      {/* Main row — latest review */}
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
        <Link
          href={reviewHref(latest)}
          className="min-w-0 flex-1 block rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition hover:border-zinc-700 hover:bg-zinc-900/80"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-white">
                #{latest.prNumber} {latest.prTitle || latest.repoFullName}
              </span>
              <p className="mt-0.5 truncate text-xs text-primer-muted">
                {latest.repoFullName}
              </p>
            </div>
            <StatusBadge status={latest.status} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-primer-muted">
            <span className="inline-flex items-center gap-1">
              <GitCommit size={11} />
              <code>{commitSha(latest)}</code>
            </span>
            {latest.model && <span>{latest.model}</span>}
            <RelativeTime date={latest.createdAt} />
          </div>
        </Link>
      </div>

      {/* Older reviews (expanded) */}
      {expanded && older.map((r) => (
        <Link
          key={r.id}
          href={reviewHref(r)}
          className="ml-6 block rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-4 py-2.5 transition hover:border-zinc-700 hover:bg-zinc-900/60"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-primer-muted">
              <span className="inline-flex items-center gap-1">
                <GitCommit size={11} />
                <code>{commitSha(r)}</code>
              </span>
              <StatusBadge status={r.status} />
              <RelativeTime date={r.createdAt} />
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}

function PRTableGroup({ latest, older }: { latest: Review; older: Review[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasOlder = older.length > 0;

  return (
    <>
      <tr className="transition hover:bg-zinc-900/40">
        <td className="w-10 px-2 py-3 text-center">
          {hasOlder ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center justify-center rounded p-1 text-primer-blue hover:bg-zinc-800"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-4 py-3 font-medium text-primer-blue">
          <Link href={reviewHref(latest)} className="hover:underline">
            {latest.repoFullName}
          </Link>
        </td>
        <td className="px-4 py-3">
          <Link href={reviewHref(latest)} className="hover:underline">
            #{latest.prNumber} {latest.prTitle}
          </Link>
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <Link href={reviewHref(latest)} className="inline-flex items-center gap-1 text-primer-muted hover:text-white">
            <GitCommit size={12} />
            <code className="text-xs">{commitSha(latest)}</code>
          </Link>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={latest.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-primer-muted">
          <RelativeTime date={latest.createdAt} />
        </td>
      </tr>
      {expanded && older.map((r) => (
        <tr key={r.id} className="bg-zinc-900/20 transition hover:bg-zinc-900/40">
          <td className="w-10" />
          <td className="px-4 py-2 pl-8 text-xs text-primer-muted" />
          <td className="px-4 py-2 text-xs text-primer-muted">
            <Link href={reviewHref(r)} className="hover:underline opacity-70">
              #{r.prNumber} {r.prTitle}
            </Link>
          </td>
          <td className="whitespace-nowrap px-4 py-2">
            <Link href={reviewHref(r)} className="inline-flex items-center gap-1 text-primer-muted hover:text-white">
              <GitCommit size={11} />
              <code className="text-xs">{commitSha(r)}</code>
            </Link>
          </td>
          <td className="px-4 py-2">
            <StatusBadge status={r.status} />
          </td>
          <td className="whitespace-nowrap px-4 py-2 text-primer-muted">
            <RelativeTime date={r.createdAt} />
          </td>
        </tr>
      ))}
    </>
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

  const groups = groupByPR(reviews);

  return (
    <>
      {/* Mobile: card layout */}
      <div className="flex flex-col gap-2 md:hidden">
        {groups.map((g) => (
          <PRGroup key={g.key} latest={g.latest} older={g.older} />
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-primer-muted">
            <tr>
              <th className="w-10 px-2 py-3" />
              <th className="px-4 py-3">Repo</th>
              <th className="px-4 py-3">Pull Request</th>
              <th className="px-4 py-3">Commit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {groups.map((g) => (
              <PRTableGroup key={g.key} latest={g.latest} older={g.older} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
