import Link from "next/link";
import { Wordmark } from "@/components/MergeWatchLogo";
import { Github, Terminal, Bot, Shield } from "lucide-react";

/**
 * Landing page for mergewatch.ai.
 *
 * Structure:
 *  - Navbar with logo + sign-in link
 *  - Hero section with headline, subtitle, dual CTAs
 *  - Three feature callouts (Any Cloud, Multi-Agent, Open Source)
 *  - Pricing section (self-hosted vs SaaS)
 *  - Footer
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <Wordmark iconSize={20} />
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/santthosh/mergewatch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primer-muted transition hover:text-fg-primary"
            aria-label="GitHub repository"
          >
            <Github size={20} />
          </a>
          <a
            href="https://docs.mergewatch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primer-muted transition hover:text-fg-primary"
          >
            Docs
          </a>
          <Link
            href="/signin"
            className="text-sm text-primer-muted transition hover:text-fg-primary"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
          AI-powered PR reviews.{" "}
          <span className="text-primer-green">Any cloud,</span>{" "}
          <span className="text-primer-blue">any model,</span>{" "}
          <span className="text-primer-purple">your rules.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-primer-muted">
          MergeWatch reviews every pull request using the LLM you choose.
          Self-host with{" "}
          <code className="rounded bg-surface-card px-1.5 py-0.5 text-sm text-fg-primary">
            docker-compose up
          </code>{" "}
          on any cloud — GCP, AWS, Azure, or bare metal.
          Or use our managed SaaS. No per-seat pricing. Ever.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/signin"
            className="inline-flex items-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Get Started
            <ArrowIcon />
          </Link>
          <a
            href="https://github.com/santthosh/mergewatch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg border border-border-default px-6 py-3 text-sm font-semibold text-fg-primary transition hover:bg-surface-card"
          >
            Self-Host Free
            <Github className="ml-2 h-4 w-4" />
          </a>
        </div>
      </main>

      {/* ─── Feature callouts ───────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pt-8 pb-16 md:grid-cols-3">
        <FeatureCard
          icon={<Terminal className="h-5 w-5" />}
          title="Any Cloud. Any LLM."
          description="Self-host on GCP, AWS, Azure, Fly.io, Railway, or bare metal with a single docker-compose up. Use Anthropic, Bedrock, OpenAI via LiteLLM proxy, or Ollama for air-gapped environments. No AWS account required."
          accent="text-primer-green"
        />
        <FeatureCard
          icon={<Bot className="h-5 w-5" />}
          title="Multi-Agent Pipeline"
          description="Five specialized agents — security, bugs, style, summary, and diagram — run in parallel on every PR diff. An orchestrator deduplicates and ranks findings before posting a unified review to GitHub."
          accent="text-primer-blue"
        />
        <FeatureCard
          icon={<Shield className="h-5 w-5" />}
          title="Genuinely Open Source"
          description='AGPL v3. Not "open core." Not "source available." Read every line of the review logic, audit exactly what runs on your code, fork it, contribute back.'
          accent="text-primer-purple"
        />
      </section>

      {/* ─── Pricing ────────────────────────────────────────────────────── */}
      <section className="border-t border-border-default px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold md:text-3xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-primer-muted">
            No per-seat fees. A 20-person team reviewing 50 PRs/month pays
            $10.50 on the managed plan. Self-host for free.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <PricingCard
              plan="Self-Hosted"
              price="Free forever"
              accent="text-primer-green"
              features={[
                ["Setup", "docker-compose up"],
                ["LLM", "Anthropic, LiteLLM, Ollama, Bedrock"],
                ["Data residency", "Your infra, your rules"],
                ["After free tier", "You pay your cloud/LLM provider directly"],
              ]}
              cta={
                <a
                  href="https://github.com/santthosh/mergewatch.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-border-default px-6 py-3 text-sm font-semibold text-fg-primary transition hover:bg-surface-card"
                >
                  View on GitHub
                  <Github className="ml-2 h-4 w-4" />
                </a>
              }
            />
            <PricingCard
              plan="Managed SaaS"
              price="First 20 PRs/month free"
              accent="text-primer-blue"
              features={[
                ["Setup", "2-minute GitHub App install"],
                ["LLM", "Bedrock (Claude Haiku)"],
                ["Data residency", "AWS us-east-1"],
                ["After free tier", "$0.35/PR \u00b7 no seats, no contracts"],
              ]}
              cta={
                <Link
                  href="/signin"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Get Started
                  <ArrowIcon />
                </Link>
              }
            />
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border-default px-6 py-6 text-center text-xs text-primer-muted">
        Open source under AGPL-3.0. Not &ldquo;open core.&rdquo; Not
        &ldquo;source available.&rdquo; The whole thing &mdash; read it, fork
        it, self-host it. &copy; {new Date().getFullYear()} mergewatch.ai
      </footer>
    </div>
  );
}

/* ─── Inline sub-components ──────────────────────────────────────────────── */

/** A single feature card rendered in the grid. */
function FeatureCard({
  icon,
  title,
  description,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-card/60 p-6">
      <div className={`mb-3 ${accent}`}>{icon}</div>
      <h3 className={`text-base font-semibold ${accent}`}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-primer-muted">
        {description}
      </p>
    </div>
  );
}

/** Pricing plan card. */
function PricingCard({
  plan,
  price,
  accent,
  features,
  cta,
}: {
  plan: string;
  price: string;
  accent: string;
  features: [string, string][];
  cta: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border-default bg-surface-card/60 p-6">
      <h3 className={`text-lg font-semibold ${accent}`}>{plan}</h3>
      <p className="mt-1 text-sm font-medium text-fg-primary">{price}</p>
      <dl className="mt-4 flex-1 space-y-3">
        {features.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-primer-muted">
              {label}
            </dt>
            <dd className="mt-0.5 text-sm text-fg-primary">{value}</dd>
          </div>
        ))}
      </dl>
      {cta}
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
