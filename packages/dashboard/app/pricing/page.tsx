"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/MergeWatchLogo";
import { Github, Server, Cloud, ChevronDown } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── Nav ───────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <Link href="/">
          <Wordmark iconSize={20} />
        </Link>
        <div className="flex items-center gap-4">
          <a
            href="https://docs.mergewatch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primer-muted transition hover:text-fg-primary"
          >
            Docs
          </a>
          <Link
            href="/pricing"
            className="text-sm font-medium text-fg-primary"
          >
            Pricing
          </Link>
          <a
            href="https://github.com/santthosh/mergewatch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primer-muted transition hover:text-fg-primary"
            aria-label="GitHub repository"
          >
            <Github size={20} />
          </a>
          <Link
            href="/signin"
            className="inline-flex items-center rounded-lg bg-primer-green px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Get started
            <ArrowIcon />
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        {/* ─── Hero ──────────────────────────────────────────────────── */}
        <section className="px-6 pt-16 pb-12 text-center md:pt-24">
          <h1 className="mx-auto max-w-2xl text-3xl font-bold md:text-5xl">
            Pay for what you review.{" "}
            <span className="text-primer-green">
              Not for who reviews it.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-primer-muted">
            Every engineer you hire shouldn&rsquo;t make your tools more
            expensive. MergeWatch has no seats, no per-user fees, no contracts.
            You pay per PR reviewed&nbsp;&mdash; and your first 20 every month
            are free.
          </p>
        </section>

        {/* ─── Self-Hosted Block ─────────────────────────────────────── */}
        <section className="px-6 pb-12">
          <div className="mx-auto max-w-3xl rounded-xl border border-border-default bg-surface-card/60 p-6">
            <div className="flex items-start gap-3">
              <Server className="mt-0.5 h-5 w-5 text-primer-green" />
              <div>
                <h2 className="text-lg font-semibold text-primer-green">
                  Self-Hosted &mdash; Always Free
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-primer-muted">
                  Deploy to your own infrastructure. You pay only your cloud
                  provider and LLM costs&nbsp;&mdash; MergeWatch never charges
                  you anything.
                </p>
                <p className="mt-3 text-sm text-fg-primary">
                  <strong>What you get:</strong> Full review pipeline, all
                  agents, dashboard, GitHub App, AGPL v3 source code.
                </p>
                <a
                  href="https://github.com/santthosh/mergewatch.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center text-sm font-medium text-primer-green transition hover:brightness-110"
                >
                  View on GitHub &rarr;
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SaaS Pricing ──────────────────────────────────────────── */}
        <section className="px-6 pb-16">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primer-blue" />
              <h2 className="text-lg font-semibold text-primer-blue">
                Managed SaaS
              </h2>
            </div>
            <p className="mt-1 text-sm text-primer-muted">
              Hosted by MergeWatch. No infrastructure required.
            </p>

            {/* Volume tiers table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-default">
                    <th className="pb-2 pr-4 font-medium text-primer-muted">
                      Monthly PRs
                    </th>
                    <th className="pb-2 pr-4 font-medium text-primer-muted">
                      Per PR
                    </th>
                    <th className="pb-2 font-medium text-primer-muted">
                      Monthly estimate
                    </th>
                  </tr>
                </thead>
                <tbody className="text-fg-primary">
                  <tr className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4">First 20</td>
                    <td className="py-2.5 pr-4 font-semibold text-primer-green">
                      Free
                    </td>
                    <td className="py-2.5">$0</td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4">21&ndash;500</td>
                    <td className="py-2.5 pr-4">$0.35</td>
                    <td className="py-2.5">Up to $168</td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4">501&ndash;2,000</td>
                    <td className="py-2.5 pr-4">$0.25</td>
                    <td className="py-2.5">Up to $543</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4">2,001+</td>
                    <td className="py-2.5 pr-4">$0.18</td>
                    <td className="py-2.5">Custom</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-primer-muted">
              Tiers are cumulative. If you review 600 PRs, the first 20 are
              free, PRs 21&ndash;500 are $0.35 each, and PRs 501&ndash;600 are
              $0.25 each.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-primer-muted">
              <strong className="text-fg-primary">
                What counts as a PR:
              </strong>{" "}
              Each{" "}
              <code className="rounded bg-surface-inset px-1 py-0.5 text-[10px]">
                pull_request.opened
              </code>{" "}
              or{" "}
              <code className="rounded bg-surface-inset px-1 py-0.5 text-[10px]">
                pull_request.synchronize
              </code>{" "}
              event that completes a review. Skipped PRs (drafts, excluded
              paths, over file limits) don&rsquo;t count.
            </p>
          </div>
        </section>

        {/* ─── Calculator ────────────────────────────────────────────── */}
        <section className="border-t border-border-default px-6 py-16">
          <div className="mx-auto max-w-md text-center">
            <h2 className="text-xl font-bold md:text-2xl">
              What will I actually pay?
            </h2>
            <PrCalculator />
          </div>
        </section>

        {/* ─── Competitor Comparison ──────────────────────────────────── */}
        <section className="border-t border-border-default px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-xl font-bold md:text-2xl">
              How does this compare?
            </h2>

            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-default">
                    <th className="pb-2 pr-4 font-medium text-primer-muted">
                      Team size
                    </th>
                    <th className="pb-2 pr-4 font-medium text-primer-muted">
                      50 PRs/mo
                    </th>
                    <th className="pb-2 pr-4 font-medium text-primer-muted">
                      200 PRs/mo
                    </th>
                    <th className="pb-2 font-medium text-primer-muted">
                      500 PRs/mo
                    </th>
                  </tr>
                </thead>
                <tbody className="text-fg-primary">
                  <tr className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4 text-primer-muted">
                      Per-seat tool (5 devs)
                    </td>
                    <td className="py-2.5 pr-4">$120/mo</td>
                    <td className="py-2.5 pr-4">$120/mo</td>
                    <td className="py-2.5">$120/mo</td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4 text-primer-muted">
                      Per-seat tool (20 devs)
                    </td>
                    <td className="py-2.5 pr-4">$480/mo</td>
                    <td className="py-2.5 pr-4">$480/mo</td>
                    <td className="py-2.5">$480/mo</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-primer-green">
                      MergeWatch
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-primer-green">
                      $10.50
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-primer-green">
                      $63
                    </td>
                    <td className="py-2.5 font-semibold text-primer-green">
                      $168
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-center text-xs italic text-primer-muted">
              Per-seat pricing based on typical $24/dev/month plans. MergeWatch
              at standard volume rates.
            </p>
          </div>
        </section>

        {/* ─── FAQ ───────────────────────────────────────────────────── */}
        <section className="border-t border-border-default px-6 py-16">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-center text-xl font-bold md:text-2xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-2">
              <FaqItem question="What happens when I hit my free 20 PRs?">
                Reviews continue automatically at $0.35/PR. There&rsquo;s no
                hard cutoff. Set a monthly spend cap in the dashboard if you
                want a ceiling.
              </FaqItem>
              <FaqItem question="Is there a contract or minimum commitment?">
                No. Monthly billing. Cancel anytime. No cancellation fees.
              </FaqItem>
              <FaqItem question="Can I switch from SaaS to self-hosted?">
                Yes, at any time. Your review history stays in the dashboard
                for 90 days. Self-hosting is always free&nbsp;&mdash;{" "}
                <a
                  href="https://github.com/santthosh/mergewatch.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primer-green underline"
                >
                  see the repo
                </a>
                .
              </FaqItem>
              <FaqItem question="Do you charge for skipped PRs?">
                No. Drafts, PRs that exceed your file limit, and PRs matching
                your ignore patterns are skipped and don&rsquo;t count.
              </FaqItem>
              <FaqItem question="What LLM does the SaaS version use?">
                Claude via Amazon Bedrock. The model is updated as better
                versions become available. Self-hosters can use any supported
                LLM.
              </FaqItem>
              <FaqItem question="Is the SaaS version AGPL-compliant?">
                Yes. MergeWatch SaaS runs the open source codebase. Any
                modifications we make are published back to the repo.
              </FaqItem>
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────────────── */}
        <section className="border-t border-border-default px-6 py-16 text-center md:py-24">
          <h2 className="mx-auto max-w-xl text-2xl font-bold md:text-3xl">
            Start with your first 20 PRs&nbsp;&mdash;{" "}
            <span className="text-primer-green">free.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-primer-muted">
            No credit card. GitHub App install. Under 2 minutes.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signin"
              className="inline-flex items-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Install the GitHub App
              <ArrowIcon />
            </Link>
            <a
              href="https://github.com/santthosh/mergewatch.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-border-default px-6 py-3 text-sm font-semibold text-fg-primary transition hover:bg-surface-card"
            >
              Self-host free
              <Github className="ml-2 h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-border-default px-6 py-12">
        <div className="mx-auto grid max-w-4xl gap-8 text-sm sm:grid-cols-3">
          <div>
            <h4 className="font-semibold text-fg-primary">Product</h4>
            <ul className="mt-3 space-y-2 text-primer-muted">
              <li>
                <a
                  href="https://docs.mergewatch.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-fg-primary"
                >
                  Docs
                </a>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="transition hover:text-fg-primary"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <a
                  href="https://docs.mergewatch.ai/self-hosting/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-fg-primary"
                >
                  Self-Hosting
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-fg-primary">Company</h4>
            <ul className="mt-3 space-y-2 text-primer-muted">
              <li>
                <a
                  href="https://github.com/santthosh/mergewatch.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-fg-primary"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/santthosh/mergewatch.ai/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-fg-primary"
                >
                  Changelog
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-fg-primary">Legal</h4>
            <ul className="mt-3 space-y-2 text-primer-muted">
              <li>
                <a
                  href="https://github.com/santthosh/mergewatch.ai/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-fg-primary"
                >
                  AGPL v3 License
                </a>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-primer-muted">
          Open source under AGPL-3.0 &copy; {new Date().getFullYear()}{" "}
          mergewatch.ai
        </p>
      </footer>
    </div>
  );
}

/* ─── Inline sub-components ──────────────────────────────────────────────── */

function PrCalculator() {
  const [prs, setPrs] = useState("");

  function estimate(count: number): number {
    if (count <= 20) return 0;
    let cost = 0;
    const remaining = count - 20;
    if (remaining <= 480) return remaining * 0.35;
    cost += 480 * 0.35; // 21-500
    const r2 = remaining - 480;
    if (r2 <= 1500) return cost + r2 * 0.25;
    cost += 1500 * 0.25; // 501-2000
    const r3 = r2 - 1500;
    return cost + r3 * 0.18;
  }

  const count = parseInt(prs, 10);
  const cost = isNaN(count) || count < 0 ? null : estimate(count);

  return (
    <div className="mt-6">
      <label
        htmlFor="pr-count"
        className="block text-sm text-primer-muted"
      >
        How many PRs does your team merge per month?
      </label>
      <input
        id="pr-count"
        type="number"
        min={0}
        placeholder="e.g. 120"
        value={prs}
        onChange={(e) => setPrs(e.target.value)}
        className="mx-auto mt-3 block w-48 rounded-lg border border-border-default bg-surface-card px-4 py-2.5 text-center text-sm text-fg-primary placeholder:text-primer-muted focus:border-primer-green focus:outline-none focus:ring-1 focus:ring-primer-green"
      />
      {cost !== null && (
        <p className="mt-4 text-lg font-bold text-fg-primary">
          Estimated monthly cost:{" "}
          <span className="text-primer-green">
            ${cost.toFixed(2)}
          </span>
        </p>
      )}
      <p className="mt-1 text-xs text-primer-muted">
        First 20 PRs always free
      </p>
    </div>
  );
}

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border-default">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-fg-primary transition hover:bg-surface-card"
      >
        {question}
        <ChevronDown
          className={`ml-2 h-4 w-4 shrink-0 text-primer-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 py-3 text-sm leading-relaxed text-primer-muted">
          {children}
        </div>
      )}
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="ml-2 h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  );
}
