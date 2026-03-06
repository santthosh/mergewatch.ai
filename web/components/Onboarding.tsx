"use client";

import { useState } from "react";
import RepoPicker, { type AvailableRepo } from "./RepoPicker";

/**
 * Onboarding — a three-step guided flow shown when the user has no monitored repos.
 *
 * Step 1: Install the GitHub App, then click "Continue"
 * Step 2: Select which repos to monitor
 * Step 3: Done — refresh to show normal dashboard
 */
export default function Onboarding() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const appUrl =
    process.env.NEXT_PUBLIC_GITHUB_APP_URL ??
    "https://github.com/apps/mergewatch-ai/installations/new";

  async function handleContinue() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/repos");
      if (!res.ok) {
        setError("Failed to fetch repositories. Please try again.");
        return;
      }
      const data = await res.json();
      const repos: AvailableRepo[] = (data.repos ?? []).map(
        (r: { repoFullName: string; installationId: string }) => ({
          repoFullName: r.repoFullName,
          installationId: r.installationId,
        }),
      );
      if (repos.length > 0) {
        setAvailableRepos(repos);
        setStep(2);
      } else {
        setError(
          "No repositories found. Please install the GitHub App first, then try again.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(selected: AvailableRepo[]) {
    const res = await fetch("/api/repos/monitored", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repos: selected }),
    });

    if (res.ok) {
      setStep(3);
      setTimeout(() => window.location.reload(), 1500);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      {/* Step indicators */}
      <div className="mb-10 flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-8 rounded-full transition ${
              s <= step ? "bg-primer-green" : "bg-zinc-700"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="text-center">
          <h2 className="text-xl font-bold">Install the MergeWatch GitHub App</h2>
          <p className="mt-3 text-sm text-primer-muted">
            MergeWatch needs access to your repositories to review pull requests.
            Install the GitHub App, then come back and click Continue.
          </p>
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center rounded-lg bg-primer-green px-5 py-2.5 text-sm font-medium text-black transition hover:bg-primer-green/90"
          >
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
            Install GitHub App
          </a>
          <div className="mt-6">
            <button
              onClick={handleContinue}
              disabled={loading}
              className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white transition hover:border-primer-green hover:text-primer-green disabled:opacity-50"
            >
              {loading ? "Checking..." : "I've installed the app — Continue"}
            </button>
          </div>
          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-2 text-xl font-bold text-center">
            Select repositories to monitor
          </h2>
          <p className="mb-6 text-center text-sm text-primer-muted">
            Choose which repositories MergeWatch should review PRs for.
          </p>
          <RepoPicker
            availableRepos={availableRepos}
            monitoredNames={new Set()}
            onSave={handleSave}
            saveLabel="Enable MergeWatch"
          />
        </div>
      )}

      {step === 3 && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primer-green/20">
            <svg
              className="h-6 w-6 text-primer-green"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold">You&apos;re all set!</h2>
          <p className="mt-2 text-sm text-primer-muted">
            MergeWatch is now monitoring your selected repositories.
            Loading your dashboard...
          </p>
        </div>
      )}
    </div>
  );
}
