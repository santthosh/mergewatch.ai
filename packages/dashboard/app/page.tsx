import { redirect } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "@/components/MergeWatchLogo";
import {
  Github,
  Shield,
  Bug,
  Paintbrush,
  FileText,
  GitBranch,
  Server,
  Cloud,
  CheckCircle2,
} from "lucide-react";

/**
 * Landing page for mergewatch.ai — psychological copy rewrite.
 *
 * 9 sections: Nav, Hero, Social Proof, How It Works, Output Preview,
 * Three Pillars, Deployment Choice, Final CTA, Footer.
 *
 * Self-hosted deployments skip straight to /signin.
 */
export default function LandingPage() {
  if (process.env.DEPLOYMENT_MODE !== "saas") {
    redirect("/signin");
  }
  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── 1. Nav ────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <Wordmark iconSize={20} />
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
            className="text-sm text-primer-muted transition hover:text-fg-primary"
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

      {/* ─── 2. Hero — Pain hook + identity ────────────────────────────── */}
      <section className="flex flex-col items-center px-6 pt-20 pb-16 text-center md:pt-28 md:pb-24">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
          The <span className="text-primer-purple">diff</span>{" "}
          <span className="text-primer-green">is too long.</span>{" "}
          <span className="text-primer-blue">It always is.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-primer-muted">
          MergeWatch runs specialized AI agents on every pull
          request&nbsp;&mdash; before your reviewer opens the diff. Security
          issues, logic bugs, style violations, and architectural risks surface
          as inline comments. Add your own custom agents for anything else.{" "}
          <strong className="text-fg-primary">
            Your reviewer makes the final call.
          </strong>
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col items-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <Link
            href="/signin"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 sm:w-auto"
          >
            Start reviewing in 2 minutes
            <ArrowIcon />
          </Link>
          <a
            href="https://github.com/santthosh/mergewatch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg border border-border-default px-6 py-3 text-sm font-semibold text-fg-primary transition hover:bg-surface-card sm:w-auto"
          >
            Read the source code
            <Github className="ml-2 h-4 w-4" />
          </a>
        </div>

        <p className="mt-6 max-w-lg text-xs text-primer-muted">
          AGPL v3&nbsp;&mdash; the whole codebase, not just the parts
          we&rsquo;re comfortable showing you.
        </p>
      </section>

      {/* ─── 3. Social Proof Bar ───────────────────────────────────────── */}
      <section className="border-y border-border-default px-6 py-12">
        <p className="text-center text-xs font-medium uppercase tracking-widest text-primer-muted">
          Runs on AWS &middot; GCP &middot; Azure &middot; Bare metal &middot;
          Fly.io &middot; Railway
        </p>

        <div className="mx-auto mt-10 grid max-w-4xl gap-8 md:grid-cols-2">
          <Testimonial
            quote="We switched from our previous review tool after they went closed-source. MergeWatch catches the same issues, costs a fraction of the price, and our infra team can actually audit what's running on our code."
            author="Engineering lead, Series B startup"
          />
          <Testimonial
            quote="The security agent flagged a path traversal vulnerability on our first PR. Our human reviewer had been looking at that file for 10 minutes."
            author="Senior engineer"
          />
        </div>
      </section>

      {/* ─── 4. How It Works — Pipeline ────────────────────────────────── */}
      <section className="px-6 py-16 md:py-24">
        <h2 className="text-center text-2xl font-bold md:text-4xl">
          Built-in specialists. Custom agents. One review.{" "}
          <span className="text-primer-green">Seconds, not minutes.</span>
        </h2>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <AgentCard
            icon={<Shield className="h-5 w-5" />}
            name="Security"
            catches="SQL injection, XSS, secrets, OWASP Top 10"
            example="User input passed to exec() without sanitization"
            accent="text-primer-red"
          />
          <AgentCard
            icon={<Bug className="h-5 w-5" />}
            name="Bugs"
            catches="Null dereferences, off-by-ones, race conditions"
            example="Array index i+1 can exceed arr.length"
            accent="text-primer-orange"
          />
          <AgentCard
            icon={<Paintbrush className="h-5 w-5" />}
            name="Style"
            catches="Naming, dead code, missing types"
            example="Exported function has no return type annotation"
            accent="text-primer-purple"
          />
          <AgentCard
            icon={<FileText className="h-5 w-5" />}
            name="Summary"
            catches="PR intent, risk rating, scope"
            example="Adds rate limiting to /api/upload — medium risk"
            accent="text-primer-blue"
          />
          <AgentCard
            icon={<GitBranch className="h-5 w-5" />}
            name="Diagram"
            catches="Architecture impact, Mermaid flowchart"
            example="Control flow diagram of changed paths"
            accent="text-primer-green"
          />
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-primer-muted">
          All agents run in parallel&nbsp;&mdash; including your custom ones.
          Total latency is bounded by the slowest agent, not the sum. Most
          reviews complete in under 60 seconds. Define custom agents in{" "}
          <code className="rounded bg-surface-card px-1.5 py-0.5 text-xs text-fg-primary">
            .mergewatch.yml
          </code>{" "}
          with a name and a prompt.
        </p>
      </section>

      {/* ─── 5. What Reviewers See — Output Preview ────────────────────── */}
      <section className="border-t border-border-default px-6 py-16 md:py-24">
        <h2 className="text-center text-2xl font-bold md:text-4xl">
          Your reviewer opens the PR.{" "}
          <span className="text-primer-green">This is already there.</span>
        </h2>

        <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-xl border border-border-default bg-surface-card">
          <div className="border-b border-border-default px-4 py-2 text-xs text-primer-muted">
            mergewatch[bot] &middot; reviewed just now
          </div>
          <div className="space-y-4 p-5 font-mono text-xs leading-relaxed text-fg-primary">
            {/* Pre-flight header */}
            <div>
              <span className="font-bold text-primer-green">
                Pre-flight check by MergeWatch &mdash; ready for your eyes
              </span>
            </div>

            {/* Already checked */}
            <div className="space-y-1 text-primer-muted">
              <p className="text-[10px] font-medium uppercase tracking-wide">
                Already checked for you:
              </p>
              <p>
                <CheckCircle2 className="mr-1 inline h-3 w-3 text-primer-green" />
                No secrets or tokens detected
              </p>
              <p>
                <CheckCircle2 className="mr-1 inline h-3 w-3 text-primer-green" />
                Lock files look clean
              </p>
              <p>
                <CheckCircle2 className="mr-1 inline h-3 w-3 text-primer-green" />
                847 lines scanned across 12 files, 40 known vulnerability
                patterns checked
              </p>
            </div>

            {/* Focus area */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-primer-muted">
                Focus your energy on:
              </p>
              <p className="mt-1 text-primer-orange">
                High risk &mdash; your attention here will matter most
              </p>
              <p className="mt-1 text-primer-muted">
                Adds authentication middleware to admin routes. One bypass path
                detected in routes/admin.ts &mdash; may be intentional.
              </p>
            </div>

            {/* Findings table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-default text-primer-muted">
                    <th className="pb-1 pr-4 font-medium">Severity</th>
                    <th className="pb-1 pr-4 font-medium">Confidence</th>
                    <th className="pb-1 pr-4 font-medium">Location</th>
                    <th className="pb-1 font-medium">Finding</th>
                  </tr>
                </thead>
                <tbody className="text-fg-primary">
                  <tr className="border-b border-border-subtle">
                    <td className="py-1.5 pr-4 text-primer-red">critical</td>
                    <td className="py-1.5 pr-4 text-primer-orange">Likely</td>
                    <td className="py-1.5 pr-4 text-primer-muted">
                      src/api/handler.ts:42
                    </td>
                    <td className="py-1.5">
                      Unsanitized input passed to exec()
                    </td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <td className="py-1.5 pr-4 text-primer-orange">high</td>
                    <td className="py-1.5 pr-4 text-primer-orange">Likely</td>
                    <td className="py-1.5 pr-4 text-primer-muted">
                      routes/admin.ts:18
                    </td>
                    <td className="py-1.5">
                      Auth middleware bypassed on /health
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-primer-orange">warning</td>
                    <td className="py-1.5 pr-4 text-primer-muted">
                      Worth checking
                    </td>
                    <td className="py-1.5 pr-4 text-primer-muted">
                      lib/db.ts:91
                    </td>
                    <td className="py-1.5">
                      Missing null check on optional user
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Checklist */}
            <div className="space-y-1 text-primer-muted">
              <p className="text-[10px] font-medium uppercase tracking-wide">
                Before you approve, consider:
              </p>
              <p>
                &#9744; Is the auth bypass in routes/admin.ts:18 intentional?
              </p>
              <p>
                &#9744; Does the new retry logic handle network timeouts?
              </p>
            </div>

            {/* Deference footer */}
            <p className="border-t border-border-default pt-3 text-[10px] italic text-primer-muted">
              These are flags, not verdicts. You know this codebase.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-sm text-primer-muted">
          Posted as inline review comments + a top-level summary. Re-triggers
          automatically when new commits are pushed.
        </p>
      </section>

      {/* ─── 6. Three Pillars — Values ─────────────────────────────────── */}
      <section className="border-t border-border-default px-6 py-16 md:py-24">
        <h2 className="text-center text-2xl font-bold md:text-4xl">
          Built for teams that take code quality{" "}
          <span className="text-primer-green">seriously.</span>
        </h2>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
          <PillarCard
            title="Your team shouldn't cost more to review."
            accent="text-primer-green"
          >
            Most review tools charge per developer per month. Every
            engineer you hire makes your bill bigger&nbsp;&mdash; the tool
            that&rsquo;s supposed to help you scale penalizes growth. MergeWatch
            prices by PR volume, not headcount. A 5-person team and a
            100-person team merging the same number of PRs pay the same.
          </PillarCard>
          <PillarCard
            title="Read every line of code running on your PRs."
            accent="text-primer-purple"
          >
            AGPL v3. Not &ldquo;source available.&rdquo; Not a limited
            open-core wrapper around a closed engine. The full review
            pipeline&nbsp;&mdash; every agent prompt, every orchestrator, every
            comment template&nbsp;&mdash; is in the repo. Your security team can
            audit it. Your engineers can fork it.
          </PillarCard>
          <PillarCard
            title="Your code never has to leave your infrastructure."
            accent="text-primer-blue"
          >
            Self-host with a single{" "}
            <code className="rounded bg-surface-inset px-1 py-0.5 text-xs text-fg-primary">
              docker-compose up
            </code>
            . Use Anthropic, OpenAI via LiteLLM, Ollama for air-gapped
            environments, or Amazon Bedrock with IAM-native auth&nbsp;&mdash; no
            API keys to manage. GCP, AWS, Azure, bare metal. If you can run
            Docker, you can run MergeWatch.
          </PillarCard>
        </div>
      </section>

      {/* ─── 7. Deployment Choice — Two Paths ──────────────────────────── */}
      <section className="border-t border-border-default px-6 py-16 md:py-24">
        <h2 className="text-center text-2xl font-bold md:text-4xl">
          Choose your setup.{" "}
          <span className="text-primer-green">Change it anytime.</span>
        </h2>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* Self-Hosted */}
          <div className="flex flex-col rounded-xl border border-border-default bg-surface-card/60 p-6">
            <div className="mb-3 text-primer-green">
              <Server className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-primer-green">
              Self-Hosted &mdash; Free forever
            </h3>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-primer-muted">
              <li>Deploy to any cloud in under 5 minutes</li>
              <li>Your LLM provider, your API keys, your bill</li>
              <li>Full code visibility &mdash; audit every line</li>
              <li>AGPL v3 &mdash; fork, customize, contribute back</li>
            </ul>
            <a
              href="https://github.com/santthosh/mergewatch.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-border-default px-6 py-3 text-sm font-semibold text-fg-primary transition hover:bg-surface-card"
            >
              View on GitHub
              <Github className="ml-2 h-4 w-4" />
            </a>
          </div>

          {/* Managed SaaS */}
          <div className="flex flex-col rounded-xl border border-border-default bg-surface-card/60 p-6">
            <div className="mb-3 text-primer-blue">
              <Cloud className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-primer-blue">
              Managed SaaS
            </h3>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-primer-muted">
              <li>GitHub App install &mdash; no infrastructure needed</li>
              <li>Runs on Claude via Amazon Bedrock</li>
              <li>Dashboard, review history, spend controls</li>
              <li>Upgrade, downgrade, or cancel anytime</li>
            </ul>
            <Link
              href="/signin"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Get started
              <ArrowIcon />
            </Link>
            <Link
              href="/pricing"
              className="mt-2 text-center text-xs text-primer-muted transition hover:text-fg-primary"
            >
              See pricing &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 8. Final CTA — Loss Aversion Close ───────────────────────── */}
      <section className="border-t border-border-default px-6 py-16 text-center md:py-24">
        <h2 className="mx-auto max-w-3xl text-2xl font-bold md:text-4xl">
          The next bug that ships without this&nbsp;&mdash;{" "}
          <span className="text-primer-green">
            that&rsquo;s on the diff it passed through.
          </span>
        </h2>

        <p className="mx-auto mt-4 max-w-md text-sm text-primer-muted">
          Set up in 2 minutes. No credit card required.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signin"
            className="inline-flex items-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Get started
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

      {/* ─── 9. Footer ─────────────────────────────────────────────────── */}
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

function Testimonial({
  quote,
  author,
}: {
  quote: string;
  author: string;
}) {
  return (
    <blockquote className="rounded-xl border border-border-default bg-surface-card/60 p-5">
      <p className="text-sm leading-relaxed text-fg-primary">
        &ldquo;{quote}&rdquo;
      </p>
      <cite className="mt-3 block text-xs not-italic text-primer-muted">
        &mdash; {author}
      </cite>
    </blockquote>
  );
}

function AgentCard({
  icon,
  name,
  catches,
  example,
  accent,
}: {
  icon: React.ReactNode;
  name: string;
  catches: string;
  example: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-card/60 p-4">
      <div className={`mb-2 ${accent}`}>{icon}</div>
      <h3 className={`text-sm font-semibold ${accent}`}>{name}</h3>
      <p className="mt-1 text-xs leading-relaxed text-primer-muted">
        {catches}
      </p>
      <p className="mt-2 rounded bg-surface-inset px-2 py-1 font-mono text-[10px] text-fg-primary">
        {example}
      </p>
    </div>
  );
}

function PillarCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-card/60 p-6">
      <h3 className={`text-base font-semibold ${accent}`}>{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-primer-muted">
        {children}
      </p>
    </div>
  );
}

/** Small right-arrow SVG used in CTA buttons. */
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
