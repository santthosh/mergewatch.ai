"use client";

import { useState, useEffect, useCallback } from "react";
import RelativeTime from "./RelativeTime";
import ReviewDrawer from "./ReviewDrawer";
import {
  GitCommit,
  ChevronDown,
  ChevronRight,
  Search,
  Bot,
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
  source?: "agent" | "human";
  agentKind?: "claude" | "cursor" | "codex" | "other";
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
  skipped: { bg: "bg-[#555]/15", text: "text-fg-secondary", label: "Skipped" },
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

function AgentBadge({
  source,
  agentKind,
}: {
  source?: string;
  agentKind?: string;
}) {
  if (source !== "agent") return null;
  const label = agentKind && agentKind !== "other"
    ? agentKind.charAt(0).toUpperCase() + agentKind.slice(1)
    : "Agent";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primer-purple/15 px-2 py-0.5 text-xs font-medium text-primer-purple"
      title={`Authored by ${label}`}
    >
      <Bot size={11} />
      {label}
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
  const color = mergeScoreColors[score] ?? "text-fg-secondary";
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
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary" />
        <input
          type="text"
          placeholder="Search PRs..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-border-default bg-surface-card py-2 pl-9 pr-3 text-sm text-fg-primary placeholder:text-fg-muted focus:border-fg-faint focus:outline-none"
        />
      </div>

      {/* Status filter */}
      <div className="relative">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="appearance-none rounded-lg border border-border-default bg-surface-card py-2 pl-3 pr-8 text-sm text-fg-secondary focus:border-fg-faint focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In Progress</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-tertiary" />
      </div>

      {/* Repo filter */}
      {repos.length > 1 && (
        <div className="relative">
          <select
            value={repoFilter}
            onChange={(e) => onRepoChange(e.target.value)}
            className="appearance-none rounded-lg border border-border-default bg-surface-card py-2 pl-3 pr-8 text-sm text-fg-secondary focus:border-fg-faint focus:outline-none max-w-[200px]"
          >
            <option value="">All repos</option>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-tertiary" />
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
          className="min-w-0 flex-1 rounded-lg border border-border-default bg-surface-card px-4 py-3 text-left transition hover:border-fg-faint hover:bg-surface-card-hover"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-fg-primary">
                #{latest.prNumber} {latest.prTitle || latest.repoFullName}
              </span>
              <p className="mt-0.5 truncate text-xs text-fg-tertiary">{latest.repoFullName}</p>
            </div>
            <div className="flex items-center gap-2">
              <AgentBadge source={latest.source} agentKind={latest.agentKind} />
              <MergeScoreCompact score={latest.mergeScore} />
              <StatusBadge status={latest.status} />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-fg-tertiary">
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
            className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-border-subtle bg-surface-inset px-4 py-2.5 text-left transition hover:border-fg-faint hover:bg-surface-card-hover"
          >
            <div className="flex items-center gap-3 text-xs text-fg-tertiary">
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
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-fg-primary">
              #{latest.prNumber} {latest.prTitle}
            </span>
            <AgentBadge source={latest.source} agentKind={latest.agentKind} />
          </div>
          <div className="mt-0.5 text-xs text-fg-tertiary">{latest.repoFullName}</div>
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className="inline-flex items-center gap-1 text-fg-secondary">
            <GitCommit size={12} />
            <code className="text-xs">{sha}</code>
          </span>
        </td>
        <td className="px-4 py-3">
          {latest.prAuthor ? (
            <span className="flex items-center gap-1.5 text-fg-secondary">
              {latest.prAuthorAvatar && (
                <img src={latest.prAuthorAvatar} alt="" className="h-4 w-4 rounded-full" />
              )}
              <span className="text-xs">{latest.prAuthor}</span>
            </span>
          ) : (
            <span className="text-fg-faint">—</span>
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
            <span className="flex items-center gap-1.5 text-fg-secondary">
              <SeverityDot severity={latest.topSeverity} />
              {latest.findingCount}
            </span>
          ) : (
            <span className="text-fg-faint">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-fg-tertiary">
          <RelativeTime date={latest.createdAt} />
        </td>
      </tr>
      {expanded && older.map((r) => {
        const olderSha = r.commitSha || r.id.split("#")[1] || "";
        return (
          <tr
            key={r.id}
            onClick={() => onSelect(r)}
            className="cursor-pointer bg-surface-inset transition hover:bg-surface-card-hover"
          >
            <td className="w-10" />
            <td className="px-4 py-2 pl-8 text-xs text-fg-secondary">
              #{r.prNumber} {r.prTitle}
            </td>
            <td className="whitespace-nowrap px-4 py-2">
              <span className="inline-flex items-center gap-1 text-fg-secondary">
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
                <span className="flex items-center gap-1.5 text-fg-secondary">
                  <SeverityDot severity={r.topSeverity} />
                  {r.findingCount}
                </span>
              ) : (
                <span className="text-fg-faint">—</span>
              )}
            </td>
            <td className="whitespace-nowrap px-4 py-2 text-fg-tertiary">
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
  const [stats, setStats] = useState<{ total: number; completed: number; findings: number }>({
    total: 0,
    completed: 0,
    findings: 0,
  });

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
      if (data.stats) setStats(data.stats);
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

  // Stats — use server-provided totals; avg duration from loaded reviews only
  const totalReviews = stats.total;
  const completedReviews = stats.completed;
  const totalFindings = stats.findings;
  const reviewsWithDuration = reviews.filter((r) => r.durationMs);
  const avgDuration =
    reviewsWithDuration.length > 0
      ? Math.round(
          reviewsWithDuration.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) /
            reviewsWithDuration.length,
        )
      : 0;

  function openDrawer(review: ReviewListItem) {
    setSelectedReviewId(`${review.repoFullName}:${review.id}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-5 border-b border-border-default sm:px-8 sm:pt-8 sm:pb-6">
        <h1 className="text-fg-primary text-xl font-semibold">Reviews</h1>
        <p className="text-fg-tertiary text-sm mt-1">
          All PR reviews across your monitored repositories.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 px-4 py-4 border-b border-border-default sm:px-8">
        {[
          { label: "Total Reviews", value: totalReviews },
          { label: "Completed", value: completedReviews },
          { label: "Issues Found", value: totalFindings },
          { label: "Avg Duration", value: avgDuration ? formatDuration(avgDuration) : "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border-default bg-surface-card px-4 py-3"
          >
            <div className="text-xs text-fg-tertiary">{stat.label}</div>
            {loading ? (
              <div className="mt-1 h-7 w-12 animate-pulse rounded bg-surface-card-hover" />
            ) : (
              <div className="mt-1 text-lg font-semibold text-fg-primary">{stat.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 py-4 border-b border-border-default sm:px-8">
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
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-card-hover" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-6 sm:px-8">
          <div className="rounded-lg border border-border-default bg-surface-card p-12 text-center">
            <p className="text-base font-medium text-fg-primary">
              {searchQuery || statusFilter || repoFilter
                ? "No matching reviews"
                : "No reviews yet"}
            </p>
            <p className="mt-2 text-sm text-fg-secondary">
              {searchQuery || statusFilter || repoFilter
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Reviews will appear here once MergeWatch has reviewed some pull requests."}
            </p>
          </div>
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
            <div className="hidden overflow-x-auto rounded-lg border border-border-default md:block mx-4 mt-4 sm:mx-8 sm:mt-6">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border-default bg-surface-card text-xs uppercase tracking-wider text-fg-muted">
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
                <tbody className="divide-y divide-border-subtle">
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
            className="rounded-lg border border-border-default bg-surface-card px-6 py-2.5 text-sm text-fg-secondary transition hover:border-fg-faint hover:text-fg-primary disabled:opacity-50"
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
