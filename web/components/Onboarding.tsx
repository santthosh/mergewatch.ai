"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RepoPicker, { type AvailableRepo } from "./RepoPicker";

/**
 * Onboarding — a friendly guided flow for new users.
 *
 * Step 1: Install the GitHub App, then click "Continue"
 * Step 2: Search and select repos to monitor
 * Step 3: Done — redirect to dashboard
 */
export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
      const data = await res.json();
      if (!res.ok) {
        setError(`Failed to fetch repositories: ${data.error ?? res.status}. Please try again.`);
        return;
      }
      if ((data.repos ?? []).length > 0) {
        setStep(2);
      } else {
        const debugInfo = data.debug ? ` (${JSON.stringify(data.debug)})` : "";
        setError(
          `No repositories found${debugInfo}. Please install the GitHub App first, then try again.`,
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
      setTimeout(() => router.push("/dashboard"), 1500);
    }
  }

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
        <div className="text-center">
          <h2 className="text-2xl font-bold">Let&apos;s get started</h2>
          <p className="mt-3 text-sm text-primer-muted">
            First, install the MergeWatch GitHub App so we can access your
            repositories and review pull requests.
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
