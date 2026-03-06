"use client";

import { useState, useMemo } from "react";

export interface AvailableRepo {
  repoFullName: string;
  installationId: string;
}

interface RepoPickerProps {
  availableRepos: AvailableRepo[];
  monitoredNames: Set<string>;
  onSave: (selected: AvailableRepo[]) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
}

/**
 * RepoPicker — a searchable checklist of repos, grouped by owner.
 * Used by both the Onboarding flow and the "Manage Repositories" panel.
 */
export default function RepoPicker({
  availableRepos,
  monitoredNames,
  onSave,
  onCancel,
  saveLabel = "Save",
}: RepoPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(monitoredNames),
  );
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return availableRepos.filter((r) =>
      r.repoFullName.toLowerCase().includes(q),
    );
  }, [availableRepos, filter]);

  // Group by owner
  const grouped = useMemo(() => {
    const map = new Map<string, AvailableRepo[]>();
    for (const repo of filtered) {
      const owner = repo.repoFullName.split("/")[0];
      if (!map.has(owner)) map.set(owner, []);
      map.get(owner)!.push(repo);
    }
    return map;
  }, [filtered]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const repos = availableRepos.filter((r) => selected.has(r.repoFullName));
      await onSave(repos);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full">
      {/* Search */}
      <input
        type="text"
        placeholder="Filter repositories..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-primer-green focus:outline-none"
      />

      {/* Repo list */}
      <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-800">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-primer-muted">
            No repositories found.
          </p>
        ) : (
          Array.from(grouped.entries()).map(([owner, repos]) => (
            <div key={owner}>
              <div className="sticky top-0 bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primer-muted">
                {owner}
              </div>
              {repos.map((repo: AvailableRepo) => (
                <label
                  key={repo.repoFullName}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(repo.repoFullName)}
                    onChange={() => toggle(repo.repoFullName)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-primer-green focus:ring-primer-green"
                  />
                  <span className="text-sm text-white">
                    {repo.repoFullName.split("/")[1]}
                  </span>
                </label>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-primer-muted">
          {selected.size} repo{selected.size !== 1 ? "s" : ""} selected
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0}
            className="rounded-lg bg-primer-green px-4 py-2 text-sm font-medium text-black transition hover:bg-primer-green/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
