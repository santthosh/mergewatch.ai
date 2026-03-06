"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import RepoPicker, { type AvailableRepo } from "./RepoPicker";

interface AccountInfo {
  login: string;
  type: "User" | "Organization";
  avatarUrl: string;
  installed: boolean;
}

/**
 * Onboarding — a friendly guided flow for new users.
 *
 * Step 1: Install the GitHub App on accounts/orgs — shows install status
 * Step 2: Search and select repos to monitor
 * Step 3: Done — redirect to dashboard
 */
export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollingRef = useRef(true);

  const appUrl =
    process.env.NEXT_PUBLIC_GITHUB_APP_URL ??
    "https://github.com/apps/mergewatch-ai/installations/new";

  // Derive app slug from install URL for per-org install links
  const appSlug = appUrl.replace(/\/installations\/new$/, "").split("/apps/")[1] ?? "";

  /** Fetch accounts and their install status */
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/installations");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);

        // Auto-advance if any account has the app installed
        const hasInstall = (data.accounts ?? []).some((a: AccountInfo) => a.installed);
        if (hasInstall) {
          // Also check if repos exist
          const reposRes = await fetch("/api/repos");
          if (reposRes.ok) {
            const reposData = await reposRes.json();
            if ((reposData.repos ?? []).length > 0) {
              pollingRef.current = false;
              setStep(2);
              return;
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Fetch accounts on mount and poll
  useEffect(() => {
    if (step !== 1) return;

    fetchAccounts();

    const interval = setInterval(() => {
      if (pollingRef.current) fetchAccounts();
    }, 5000);

    return () => clearInterval(interval);
  }, [step, fetchAccounts]);

  async function handleContinue() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!res.ok) {
        setError(`Failed to fetch repositories: ${data.error ?? res.status}. Please try again.`);
        return;
      }
      if ((data.repos ?? []).length > 0) {
        pollingRef.current = false;
        setStep(2);
      } else {
        setError("No repositories found yet. Install the app on at least one account above, then try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(_selected: AvailableRepo[]) {
    setStep(3);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  const installedCount = accounts.filter((a) => a.installed).length;

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
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
        <div>
          <div className="text-center">
            <h2 className="text-2xl font-bold">Let&apos;s get started</h2>
            <p className="mt-3 text-sm text-primer-muted">
              Install the MergeWatch GitHub App on the accounts and organizations
              you want to monitor. You can always add more later.
            </p>
          </div>

          {/* Accounts list */}
          <div className="mt-8 rounded-lg border border-zinc-800">
            {loadingAccounts ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-primer-green" />
                <span className="ml-3 text-sm text-primer-muted">Loading your accounts...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <a
                  href={appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg bg-primer-green px-5 py-2.5 text-sm font-medium text-black transition hover:bg-primer-green/90"
                >
                  Install GitHub App
                </a>
              </div>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.login}
                  className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-3 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={account.avatarUrl}
                      alt={account.login}
                      className="h-8 w-8 rounded-full"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">{account.login}</span>
                      <span className="ml-2 text-xs text-primer-muted">
                        {account.type === "Organization" ? "Org" : "Personal"}
                      </span>
                    </div>
                  </div>

                  {account.installed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primer-green/15 px-3 py-1 text-xs font-medium text-primer-green">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Installed
                    </span>
                  ) : (
                    <a
                      href={appUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition hover:border-primer-green hover:text-primer-green"
                    >
                      Install
                    </a>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Continue button */}
          <div className="mt-6 text-center">
            {installedCount > 0 ? (
              <button
                onClick={handleContinue}
                disabled={loading}
                className="inline-flex items-center rounded-lg bg-primer-green px-5 py-2.5 text-sm font-medium text-black transition hover:bg-primer-green/90 disabled:opacity-50"
              >
                {loading ? "Checking..." : "Continue"}
              </button>
            ) : (
              <button
                onClick={handleContinue}
                disabled={loading}
                className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white transition hover:border-primer-green hover:text-primer-green disabled:opacity-50"
              >
                {loading ? "Checking..." : "I've installed the app — Continue"}
              </button>
            )}
          </div>
          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-2 text-2xl font-bold text-center">
            Pick your repositories
          </h2>
          <p className="mb-6 text-center text-sm text-primer-muted">
            Search and select the repositories you want MergeWatch to review.
            You can always change this later from your dashboard.
          </p>
          <RepoPicker
            monitoredNames={new Set()}
            onSave={handleSave}
            saveLabel="Enable MergeWatch"
          />
          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
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
          <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
          <p className="mt-2 text-sm text-primer-muted">
            MergeWatch is now monitoring your selected repositories.
            Taking you to your dashboard...
          </p>
        </div>
      )}
    </div>
  );
}
