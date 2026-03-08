"use client";

import { useState, useEffect, useCallback } from "react";
import RelativeTime from "./RelativeTime";
import ReviewDrawer from "./ReviewDrawer";
import {
  GitCommit,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";

// -- Types ------------------------------------------------------------------

interface ReviewListItem {
  id: string;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  model: string;
  createdAt: string;
  completedAt?: string;
  prAuthor?: string;
  prAuthorAvatar?: string;
  headBranch?: string;
  baseBranch?: string;
  findingCount?: number;
  topSeverity?: "critical" | "warning" | "info";
  durationMs?: number;
  mergeScore?: number;
}


interface ReviewsClientProps {
  repos: string[];
  installationId: string;
}

// -- Constants ---------------------------------------------------------------

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-primer-orange/15", text: "text-primer-orange", label: "Pending" },
  in_progress: { bg: "bg-primer-blue/15", text: "text-primer-blue", label: "In Progress" },
  completed: { bg: "bg-primer-green/15", text: "text-primer-green", label: "Completed" },
  failed: { bg: "bg-primer-red/15", text: "text-primer-red", label: "Failed" },
  skipped: { bg: "bg-[#555]/15", text: "text-[#888]", label: "Skipped" },
};

const severityStyles: Record<string, { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "Critical" },
  warning: { dot: "bg-yellow-500", label: "Warning" },
  info: { dot: "bg-blue-500", label: "Info" },
};

// -- Sub-components ---------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] ?? statusStyles.pending;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function SeverityDot({ severity }: { severity?: string }) {
  if (!severity) return null;
  const s = severityStyles[severity];
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1" title={s.label}>
      <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
    </span>
  );
}

const mergeScoreColors: Record<number, string> = {
  5: "text-primer-green",
  4: "text-primer-green",
  3: "text-primer-orange",
  2: "text-orange-500",
  1: "text-primer-red",
};

function MergeScoreCompact({ score }: { score?: number }) {
  if (score == null) return null;
  const color = mergeScoreColors[score] ?? "text-[#888]";
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`} title={`Merge readiness: ${score}/5`}>
      <span className="text-xs">{score}/5</span>
    </span>
  );
}

function FilterBar({
  repos,
  statusFilter,
  repoFilter,
  searchQuery,
  onStatusChange,
  onRepoChange,
  onSearchChange,
}: {
  repos: string[];
  statusFilter: string;
  repoFilter: string;
  searchQuery: string;
  onStatusChange: (v: string) => void;
  onRepoChange: (v: string) => void;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
        <input
          type="text"
          placeholder="Search PRs..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-[#444] focus:border-[#333] focus:outline-none"
        />
      </div>

      {/* Status filter */}
      <div className="relative">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="appearance-none rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] py-2 pl-3 pr-8 text-sm text-[#888] focus:border-[#333] focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In Progress</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555]" />
      </div>

      {/* Repo filter */}
      {repos.length > 1 && (
        <div className="relative">
          <select
            value={repoFilter}
            onChange={(e) => onRepoChange(e.target.value)}
            className="appearance-none rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] py-2 pl-3 pr-8 text-sm text-[#888] focus:border-[#333] focus:outline-none max-w-[200px]"
          >
            <option value="">All repos</option>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555]" />
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}


// -- Grouping ---------------------------------------------------------------

interface PRGroup {
  key: string;
  latest: ReviewListItem;
  older: ReviewListItem[];
}

function groupByPR(reviews: ReviewListItem[]): PRGroup[] {
  const map = new Map<string, ReviewListItem[]>();
  for (const r of reviews) {
    const key = `${r.repoFullName}#${r.prNumber}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  const groups: PRGroup[] = [];
  map.forEach((list, key) => {
    list.sort((a: ReviewListItem, b: ReviewListItem) => b.createdAt.localeCompare(a.createdAt));
    groups.push({ key, latest: list[0], older: list.slice(1) });
  });
  groups.sort((a: PRGroup, b: PRGroup) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  return groups;
}

function PRCardGroup({
  latest,
  older,
  onSelect,
}: {
  latest: ReviewListItem;
  older: ReviewListItem[];
  onSelect: (r: ReviewListItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOlder = older.length > 0;
  const sha = latest.commitSha || latest.id.split("#")[1] || "";

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
          onClick={() => onSelect(latest)}
          className="min-w-0 flex-1 rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] px-4 py-3 text-left transition hover:border-[#333] hover:bg-[#111]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-white">
                #{latest.prNumber} {latest.prTitle || latest.repoFullName}
              </span>
              <p className="mt-0.5 truncate text-xs text-[#555]">{latest.repoFullName}</p>
            </div>
            <div className="flex items-center gap-2">
              <MergeScoreCompact score={latest.mergeScore} />
              <StatusBadge status={latest.status} />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-[#555]">
            <span className="inline-flex items-center gap-1">
              <GitCommit size={11} />
              <code>{sha}</code>
            </span>
            {latest.findingCount !== undefined && (
              <span className="flex items-center gap-1">
                <SeverityDot severity={latest.topSeverity} />
                {latest.findingCount} issue{latest.findingCount !== 1 ? "s" : ""}
              </span>
            )}
            {latest.prAuthor && <span>{latest.prAuthor}</span>}
            <RelativeTime date={latest.createdAt} />
          </div>
        </button>
      </div>
      {expanded && older.map((r) => {
        const olderSha = r.commitSha || r.id.split("#")[1] || "";
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-[#1a1a1a] bg-[#060606] px-4 py-2.5 text-left transition hover:border-[#333] hover:bg-[#111]"
          >
            <div className="flex items-center gap-3 text-xs text-[#555]">
              <span className="inline-flex items-center gap-1">
                <GitCommit size={11} />
                <code>{olderSha}</code>
              </span>
              <StatusBadge status={r.status} />
              <RelativeTime date={r.createdAt} />
            </div>
          </button>
        );
      })}
    </>
  );
}

function PRTableGroup({
  latest,
  older,
  onSelect,
}: {
  latest: ReviewListItem;
  older: ReviewListItem[];
  onSelect: (r: ReviewListItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOlder = older.length > 0;
  const sha = latest.commitSha || latest.id.split("#")[1] || "";

  return (
    <>
      <tr
        onClick={() => onSelect(latest)}
        className="cursor-pointer transition hover:bg-[#111]"
      >
        <td className="w-10 px-2 py-3 text-center">
          {hasOlder ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="inline-flex items-center justify-center rounded p-1 text-primer-blue hover:bg-[#1a1a1a]"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-white">
            #{latest.prNumber} {latest.prTitle}
          </div>
          <div className="mt-0.5 text-xs text-[#555]">{latest.repoFullName}</div>
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className="inline-flex items-center gap-1 text-[#888]">
            <GitCommit size={12} />
            <code className="text-xs">{sha}</code>
          </span>
        </td>
        <td className="px-4 py-3">
          {latest.prAuthor ? (
            <span className="flex items-center gap-1.5 text-[#888]">
              {latest.prAuthorAvatar && (
                <img src={latest.prAuthorAvatar} alt="" className="h-4 w-4 rounded-full" />
              )}
              <span className="text-xs">{latest.prAuthor}</span>
            </span>
          ) : (
            <span className="text-[#333]">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <MergeScoreCompact score={latest.mergeScore} />
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={latest.status} />
        </td>
        <td className="px-4 py-3">
          {latest.findingCount !== undefined ? (
            <span className="flex items-center gap-1.5 text-[#888]">
              <SeverityDot severity={latest.topSeverity} />
              {latest.findingCount}
            </span>
          ) : (
            <span className="text-[#333]">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-[#555]">
          <RelativeTime date={latest.createdAt} />
        </td>
      </tr>
      {expanded && older.map((r) => {
        const olderSha = r.commitSha || r.id.split("#")[1] || "";
        return (
          <tr
            key={r.id}
            onClick={() => onSelect(r)}
            className="cursor-pointer bg-[#060606] transition hover:bg-[#111]"
          >
            <td className="w-10" />
            <td className="px-4 py-2 pl-8 text-xs text-[#666]">
              #{r.prNumber} {r.prTitle}
            </td>
            <td className="whitespace-nowrap px-4 py-2">
              <span className="inline-flex items-center gap-1 text-[#666]">
                <GitCommit size={11} />
                <code className="text-xs">{olderSha}</code>
              </span>
            </td>
            <td className="px-4 py-2" />
            <td className="px-4 py-2">
              <MergeScoreCompact score={r.mergeScore} />
            </td>
            <td className="px-4 py-2">
              <StatusBadge status={r.status} />
            </td>
            <td className="px-4 py-2">
              {r.findingCount !== undefined ? (
                <span className="flex items-center gap-1.5 text-[#666]">
                  <SeverityDot severity={r.topSeverity} />
                  {r.findingCount}
                </span>
              ) : (
                <span className="text-[#333]">—</span>
              )}
            </td>
            <td className="whitespace-nowrap px-4 py-2 text-[#555]">
              <RelativeTime date={r.createdAt} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

// -- Main component ---------------------------------------------------------

export default function ReviewsClient({ repos, installationId }: ReviewsClientProps) {
  const [reviews, setReviews] = useState<ReviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [repoFilter, setRepoFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const PAGE_SIZE = 25;

  const fetchReviews = useCallback(async (cursor?: string | null) => {
    const isLoadMore = !!cursor;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    const params = new URLSearchParams();
    params.set("installation_id", installationId);
    if (statusFilter) params.set("status", statusFilter);
    if (repoFilter) params.set("repo", repoFilter);
    params.set("limit", String(PAGE_SIZE));
    if (cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/reviews?${params}`);
      const data = await res.json();
      const newReviews = data.reviews ?? [];
      setReviews((prev) => isLoadMore ? [...prev, ...newReviews] : newReviews);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      if (!isLoadMore) setReviews([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [installationId, statusFilter, repoFilter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Client-side search filter
  const filtered = searchQuery
    ? reviews.filter(
        (r) =>
          r.prTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.repoFullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          String(r.prNumber).includes(searchQuery) ||
          (r.prAuthor ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : reviews;

  // Stats
  const totalReviews = reviews.length;
  const completedReviews = reviews.filter((r) => r.status === "completed").length;
  const totalFindings = reviews.reduce((sum, r) => sum + (r.findingCount ?? 0), 0);
  const avgDuration =
    reviews.filter((r) => r.durationMs).length > 0
      ? Math.round(
          reviews.filter((r) => r.durationMs).reduce((sum, r) => sum + (r.durationMs ?? 0), 0) /
            reviews.filter((r) => r.durationMs).length,
        )
      : 0;

  function openDrawer(review: ReviewListItem) {
    setSelectedReviewId(`${review.repoFullName}:${review.id}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-5 border-b border-[#1e1e1e] sm:px-8 sm:pt-8 sm:pb-6">
        <h1 className="text-white text-xl font-semibold">Reviews</h1>
        <p className="text-[#555] text-sm mt-1">
          All PR reviews across your monitored repositories.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 px-4 py-4 border-b border-[#1e1e1e] sm:px-8">
        {[
          { label: "Total Reviews", value: totalReviews },
          { label: "Completed", value: completedReviews },
          { label: "Issues Found", value: totalFindings },
          { label: "Avg Duration", value: avgDuration ? formatDuration(avgDuration) : "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] px-4 py-3"
          >
            <div className="text-xs text-[#555]">{stat.label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 py-4 border-b border-[#1e1e1e] sm:px-8">
        <FilterBar
          repos={repos}
          statusFilter={statusFilter}
          repoFilter={repoFilter}
          searchQuery={searchQuery}
          onStatusChange={setStatusFilter}
          onRepoChange={setRepoFilter}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2 p-4 sm:p-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[#111]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center px-4 sm:px-8">
          <p className="text-sm text-[#555]">
            {searchQuery || statusFilter || repoFilter
              ? "No reviews match your filters."
              : "No reviews yet. Open a pull request to get started."}
          </p>
        </div>
      ) : (() => {
        const groups = groupByPR(filtered);
        return (
          <>
            {/* Mobile cards */}
            <div className="flex flex-col gap-2 md:hidden p-4 sm:p-8">
              {groups.map((g) => (
                <PRCardGroup
                  key={g.key}
                  latest={g.latest}
                  older={g.older}
                  onSelect={openDrawer}
                />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border border-[#1e1e1e] md:block mx-4 mt-4 sm:mx-8 sm:mt-6">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#1e1e1e] bg-[#0a0a0a] text-xs uppercase tracking-wider text-[#444]">
                  <tr>
                    <th className="w-10 px-2 py-3" />
                    <th className="px-4 py-3">Pull Request</th>
                    <th className="px-4 py-3">Commit</th>
                    <th className="px-4 py-3">Author</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Findings</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {groups.map((g) => (
                    <PRTableGroup
                      key={g.key}
                      latest={g.latest}
                      older={g.older}
                      onSelect={openDrawer}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* Load More */}
      {nextCursor && !loading && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => fetchReviews(nextCursor)}
            disabled={loadingMore}
            className="rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] px-6 py-2.5 text-sm text-[#888] transition hover:border-[#333] hover:text-white disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}

      {/* Drawer */}
      {selectedReviewId && (
        <ReviewDrawer
          reviewId={selectedReviewId}
          onClose={() => setSelectedReviewId(null)}
        />
      )}
    </div>
  );
}
