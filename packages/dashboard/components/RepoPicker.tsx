"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "./Spinner";

export interface AvailableRepo {
  repoFullName: string;
  installationId: string;
}

interface RepoPickerProps {
  /** Pre-loaded repos to show initially (optional — will fetch if empty) */
  initialRepos?: AvailableRepo[];
  monitoredNames: Set<string>;
  onSave: (selected: AvailableRepo[]) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
  /** Filter repos to a specific installation */
  installationId?: string;
}

/**
 * RepoPicker — search-first repo selector.
 *
 * Fetches repos from /api/repos with optional search query.
 * Selected repos appear as chips at the top for easy review.
 */
export default function RepoPicker({
  initialRepos,
  monitoredNames,
  onSave,
  onCancel,
  saveLabel = "Save",
  installationId,
}: RepoPickerProps) {
  const [allRepos, setAllRepos] = useState<AvailableRepo[]>(initialRepos ?? []);
  const [selected, setSelected] = useState<Map<string, AvailableRepo>>(
    () => {
      const map = new Map<string, AvailableRepo>();
      if (initialRepos) {
        for (const r of initialRepos) {
          if (monitoredNames.has(r.repoFullName)) {
            map.set(r.repoFullName, r);
          }
        }
      }
      return map;
    },
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Track whether we've done the initial seed of monitored repos
  const seededRef = useRef(false);

  // Fetch repos (paginated)
  const fetchRepos = useCallback(async (page: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("page", String(page));
      if (installationId) searchParams.set("installation_id", installationId);
      const res = await fetch(`/api/repos?${searchParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const repos: AvailableRepo[] = data.repos ?? [];
        if (append) {
          setAllRepos((prev) => {
            const existing = new Set(prev.map((r) => r.repoFullName));
            const newRepos = repos.filter((r) => !existing.has(r.repoFullName));
            return [...prev, ...newRepos];
          });
        } else {
          setAllRepos(repos);
        }
        setTotalCount(data.totalCount ?? 0);
        setHasMore(data.hasMore ?? false);
        setCurrentPage(page);

        // On first load, pre-select repos that are already monitored
        if (!seededRef.current && monitoredNames.size > 0) {
          seededRef.current = true;
          setSelected((prev) => {
            const next = new Map(prev);
            for (const r of repos) {
              if (monitoredNames.has(r.repoFullName)) {
                next.set(r.repoFullName, r);
              }
            }
            return next;
          });
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [monitoredNames, installationId]);

  // Fetch initial repos if none provided
  useEffect(() => {
    if (!initialRepos || initialRepos.length === 0) {
      fetchRepos();
    }
  }, [initialRepos, fetchRepos]);

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Client-side search filter (instant, no debounce needed since we paginate)
  function handleSearch(value: string) {
    setQuery(value);
  }

  // Filter loaded repos client-side for instant feedback
  const displayed = useMemo(() => {
    if (!query) return allRepos;
    const q = query.toLowerCase();
    return allRepos.filter((r) => r.repoFullName.toLowerCase().includes(q));
  }, [allRepos, query]);

  // Group by owner
  const grouped = useMemo(() => {
    const map = new Map<string, AvailableRepo[]>();
    for (const repo of displayed) {
      const owner = repo.repoFullName.split("/")[0];
      if (!map.has(owner)) map.set(owner, []);
      map.get(owner)!.push(repo);
    }
    return map;
  }, [displayed]);

  function toggle(repo: AvailableRepo) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(repo.repoFullName)) {
        next.delete(repo.repoFullName);
      } else {
        next.set(repo.repoFullName, repo);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const repo of displayed) {
        next.set(repo.repoFullName, repo);
      }
      return next;
    });
  }

  function deselectAll() {
    setSelected(new Map());
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(Array.from(selected.values()));
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selected.size;
  const allDisplayedSelected = displayed.length > 0 &&
    displayed.every((r) => selected.has(r.repoFullName));

  return (
    <div className="w-full">
      {/* Selected repos chips */}
      {selectedCount > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {Array.from(selected.values()).map((repo) => (
              <span
                key={repo.repoFullName}
                className="inline-flex items-center gap-1 rounded-full bg-primer-green/15 px-3 py-1 text-xs font-medium text-primer-green"
              >
                {repo.repoFullName}
                <button
                  onClick={() => toggle(repo)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-primer-green/20"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative mb-3">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search repositories..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full rounded-lg border border-border-default bg-surface-card py-2.5 pl-10 pr-4 text-sm text-fg-primary placeholder-zinc-500 focus:border-primer-green focus:outline-none"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      {/* Select all / deselect controls */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs text-primer-muted">
          {displayed.length} repo{displayed.length !== 1 ? "s" : ""}
          {totalCount > displayed.length && ` of ${totalCount}`}
        </span>
        <button
          onClick={allDisplayedSelected ? deselectAll : selectAll}
          className="text-xs text-primer-blue hover:underline"
        >
          {allDisplayedSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* Repo list */}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border-default">
        {displayed.length === 0 && !loading ? (
          <p className="px-4 py-8 text-center text-sm text-primer-muted">
            {query
              ? "No repositories match your search."
              : "No repositories found."}
          </p>
        ) : (
          <>
            {Array.from(grouped.entries()).map(([owner, repos]) => (
              <div key={owner}>
                <div className="sticky top-0 border-b border-border-default/50 bg-surface-card px-4 py-1.5 text-xs font-semibold text-primer-muted">
                  {owner}
                </div>
                {repos.map((repo: AvailableRepo) => {
                  const isSelected = selected.has(repo.repoFullName);
                  return (
                    <label
                      key={repo.repoFullName}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-2 transition ${
                        isSelected
                          ? "bg-primer-green/5"
                          : "hover:bg-surface-card/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(repo)}
                        className="h-4 w-4 rounded border-zinc-600 bg-surface-card text-primer-green focus:ring-primer-green"
                      />
                      <span className="text-sm text-fg-primary">
                        {repo.repoFullName.split("/")[1]}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
            {hasMore && !query && (
              <button
                onClick={() => fetchRepos(currentPage + 1, true)}
                disabled={loadingMore}
                className="w-full border-t border-border-default/50 px-4 py-2.5 text-center text-xs font-medium text-primer-blue hover:bg-surface-card/50 disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more repositories"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Missing repos hint */}
      <p className="mt-3 text-xs text-primer-muted">
        Don&apos;t see a repository?{" "}
        <a
          href={
            process.env.NEXT_PUBLIC_GITHUB_APP_URL ??
            "https://github.com/apps/mergewatch-ai/installations/new"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-primer-blue hover:underline"
        >
          Install the GitHub App
        </a>{" "}
        on that organization.
      </p>

      {/* Actions */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-primer-muted">
          {selectedCount} repo{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-border-default px-4 py-2 text-sm text-fg-primary hover:bg-surface-card"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="rounded-lg bg-primer-green px-4 py-2 text-sm font-medium text-black transition hover:bg-primer-green/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
