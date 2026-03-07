"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ExternalLink,
  Search,
  GitBranch,
  Clock,
  PauseCircle,
  Settings as SettingsIcon,
  Loader2,
} from "lucide-react";
import ToggleSwitch from "@/components/ToggleSwitch";
import RelativeTime from "@/components/RelativeTime";

export interface RepositoryView {
  fullName: string;
  githubUrl: string;
  language: string | null;
  isPrivate: boolean;
  enabled: boolean;
  reviewCount: number;
  issueCount: number;
  lastReviewedAt: string | null;
  hasConfig: boolean;
  installationId: string;
}

interface RepositoriesClientProps {
  isAdmin: boolean;
  installationId: string;
  githubAppSlug?: string;
}

const PER_PAGE = 30;

export default function RepositoriesClient({
  isAdmin,
  installationId,
  githubAppSlug,
}: RepositoriesClientProps) {
  const [repos, setRepos] = useState<RepositoryView[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch a page of repos
  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          installation_id: installationId,
          page: String(pageNum),
          per_page: String(PER_PAGE),
        });
        const res = await fetch(`/api/repositories?${params}`);
        if (!res.ok) return;

        const data = await res.json();
        const incoming: RepositoryView[] = data.repos ?? [];

        setRepos((prev) => (append ? [...prev, ...incoming] : incoming));
        setTotalCount(data.totalCount ?? 0);
        setHasMore(data.hasMore ?? false);
        setPage(pageNum);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [installationId],
  );

  // Initial load
  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPage(page + 1, true);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchPage]);

  // Debounced search (client-side filtering)
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 200);
  }, []);

  // Unique languages from loaded repos
  const languages = useMemo(() => {
    const langs = new Set<string>();
    repos.forEach((r) => {
      if (r.language) langs.add(r.language);
    });
    return Array.from(langs).sort();
  }, [repos]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = repos;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((r) => r.fullName.toLowerCase().includes(q));
    }

    if (statusFilter === "active") {
      result = result.filter((r) => r.enabled);
    } else if (statusFilter === "paused") {
      result = result.filter((r) => !r.enabled);
    } else if (statusFilter === "no-reviews") {
      result = result.filter((r) => r.enabled && r.reviewCount === 0);
    }

    if (languageFilter !== "all") {
      result = result.filter((r) => r.language === languageFilter);
    }

    return result;
  }, [repos, debouncedSearch, statusFilter, languageFilter]);

  // Stats from all loaded repos
  const activeCount = repos.filter((r) => r.enabled).length;
  const pausedCount = repos.filter((r) => !r.enabled).length;

  // Optimistic toggle
  const handleToggle = useCallback(
    async (fullName: string, enabled: boolean) => {
      setRepos((prev) =>
        prev.map((r) => (r.fullName === fullName ? { ...r, enabled } : r)),
      );

      try {
        const res = await fetch("/api/repositories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installationId, repoFullName: fullName, enabled }),
        });
        if (!res.ok) throw new Error("Failed");
      } catch {
        setRepos((prev) =>
          prev.map((r) =>
            r.fullName === fullName ? { ...r, enabled: !enabled } : r,
          ),
        );
      }
    },
    [installationId],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setLanguageFilter("all");
  }, []);

  const githubConfigUrl = githubAppSlug
    ? `https://github.com/apps/${githubAppSlug}/installations/${installationId}`
    : `https://github.com/settings/installations/${installationId}`;

  const hasFilters = debouncedSearch || statusFilter !== "all" || languageFilter !== "all";

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-5 border-b border-[#1e1e1e] flex items-start justify-between sm:px-8 sm:pt-8 sm:pb-6">
        <div>
          <h1 className="text-white text-xl font-semibold">Repositories</h1>
          <p className="text-[#555] text-sm mt-1">
            Repos connected to this GitHub App installation.
          </p>
        </div>
        {isAdmin && (
          <a
            href={githubConfigUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-md text-sm text-[#888] hover:text-white hover:border-[#333] transition-colors"
          >
            Configure on GitHub
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-6 px-4 py-4 border-b border-[#1e1e1e] sm:px-8">
        {[
          { value: totalCount, label: "connected" },
          { value: activeCount, label: "active" },
          { value: pausedCount, label: "paused" },
        ].map((stat) => (
          <div key={stat.label} className="flex items-baseline gap-1.5">
            <span className="text-white text-lg font-semibold tabular-nums">
              {initialLoad ? "–" : stat.value}
            </span>
            <span className="text-[#444] text-sm">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 px-4 py-4 border-b border-[#1e1e1e] sm:flex-row sm:items-center sm:px-8">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444]"
          />
          <input
            type="text"
            placeholder="Search repos..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-md text-sm text-white placeholder-[#444] w-52 focus:outline-none focus:border-[#00ff88]/40"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-md text-sm text-[#888] focus:outline-none focus:border-[#00ff88]/40"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="no-reviews">No reviews yet</option>
        </select>

        {languages.length > 0 && (
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-md text-sm text-[#888] focus:outline-none focus:border-[#00ff88]/40"
          >
            <option value="all">All languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {initialLoad ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-[#333]" />
        </div>
      ) : repos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <GitBranch size={32} className="text-[#2a2a2a] mb-4" />
          <div className="text-white text-sm font-medium">
            No repositories connected
          </div>
          <div className="text-[#444] text-xs mt-1 max-w-xs leading-relaxed">
            MergeWatch doesn&apos;t have access to any repositories yet.
            Configure the GitHub App installation to select repos.
          </div>
          {isAdmin && (
            <a
              href={githubConfigUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-md text-sm text-[#888] hover:text-white transition-colors"
            >
              Configure on GitHub <ExternalLink size={12} />
            </a>
          )}
        </div>
      ) : filtered.length === 0 && hasFilters ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search size={28} className="text-[#2a2a2a] mb-4" />
          <div className="text-white text-sm font-medium">
            No repos match your filters
          </div>
          <button
            onClick={clearFilters}
            className="mt-3 text-xs text-[#00ff88] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 sm:p-8">
            {filtered.map((repo) => (
              <RepoCard
                key={repo.fullName}
                repo={repo}
                isAdmin={isAdmin}
                onToggle={handleToggle}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {/* Loading indicator */}
          {loading && !initialLoad && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-[#333]" />
              <span className="ml-2 text-xs text-[#444]">Loading more repos...</span>
            </div>
          )}

          {/* End of list */}
          {!hasMore && repos.length > PER_PAGE && (
            <div className="text-center py-6 text-xs text-[#333]">
              All {totalCount} repositories loaded
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepoCard
// ---------------------------------------------------------------------------

function RepoCard({
  repo,
  isAdmin,
  onToggle,
}: {
  repo: RepositoryView;
  isAdmin: boolean;
  onToggle: (fullName: string, enabled: boolean) => void;
}) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-5 hover:border-[#2a2a2a] transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <a
            href={repo.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white text-sm font-medium hover:text-[#00ff88] transition-colors flex items-center gap-1.5 group"
          >
            {repo.fullName}
            <ExternalLink
              size={11}
              className="text-[#333] group-hover:text-[#00ff88] transition-colors"
            />
          </a>
          <div className="flex items-center gap-2 mt-1">
            {repo.language && (
              <span className="text-[#444] text-xs">{repo.language}</span>
            )}
            {repo.language && (
              <span className="text-[#222] text-xs">&middot;</span>
            )}
            <span className="text-[#444] text-xs">
              {repo.isPrivate ? "Private" : "Public"}
            </span>
          </div>
        </div>

        <ToggleSwitch
          checked={repo.enabled}
          disabled={!isAdmin}
          onChange={(enabled) => onToggle(repo.fullName, enabled)}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-[#1a1a1a] mb-3" />

      {/* Status */}
      <RepoStatus repo={repo} />

      {/* Config badge */}
      {repo.hasConfig && (
        <div className="flex items-center gap-1.5 mt-3">
          <SettingsIcon size={11} className="text-[#444]" />
          <span className="text-[#444] text-xs font-mono">.mergewatch.yml</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepoStatus — three variants
// ---------------------------------------------------------------------------

function RepoStatus({ repo }: { repo: RepositoryView }) {
  if (!repo.enabled) {
    return (
      <div className="flex items-center gap-2 py-1">
        <PauseCircle size={13} className="text-[#444]" />
        <span className="text-[#555] text-xs">
          Paused
          {repo.lastReviewedAt && (
            <>
              {" "}
              &middot; last reviewed{" "}
              <RelativeTime date={repo.lastReviewedAt} />
            </>
          )}
        </span>
      </div>
    );
  }

  if (repo.reviewCount === 0) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Clock size={13} className="text-[#333]" />
        <span className="text-[#444] text-xs">
          No reviews yet — open a PR to trigger the first one.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[#555] text-xs">Reviews</span>
        <span className="text-[#888] text-xs tabular-nums">
          {repo.reviewCount}
        </span>
      </div>
      {repo.issueCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[#555] text-xs">Issues caught</span>
          <span className="text-[#888] text-xs tabular-nums">
            {repo.issueCount}
          </span>
        </div>
      )}
      {repo.lastReviewedAt && (
        <div className="flex items-center justify-between">
          <span className="text-[#555] text-xs">Last review</span>
          <span className="text-[#888] text-xs">
            <RelativeTime date={repo.lastReviewedAt} />
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
        <span className="text-[#00ff88] text-xs">Active</span>
      </div>
    </div>
  );
}
