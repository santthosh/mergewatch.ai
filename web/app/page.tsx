import Link from "next/link";

/**
 * Landing page for mergewatch.ai.
 *
 * Structure:
 *  - Navbar with logo + sign-in link
 *  - Hero section with headline, subtitle, CTA
 *  - Three feature callouts (BYOM, AWS IAM, Multi-agent)
 *  - Footer
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <span className="text-lg font-bold tracking-tight">
          MergeWatch<span className="text-primer-green">.ai</span>
        </span>
        <Link
          href="/signin"
          className="text-sm text-primer-muted transition hover:text-white"
        >
          Sign in
        </Link>
      </nav>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
          AI-powered PR reviews.{" "}
          <span className="text-primer-green">Your models,</span>{" "}
          <span className="text-primer-blue">your cloud,</span>{" "}
          <span className="text-primer-purple">your rules.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-primer-muted">
          MergeWatch reviews every pull request using the LLM you choose,
          running entirely inside your AWS account. No vendor lock-in. No
          data leaving your perimeter.
        </p>

        <Link
          href="/signin"
          className="mt-10 inline-flex items-center rounded-lg bg-primer-green px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Get Started
          <ArrowIcon />
        </Link>
      </main>

      {/* ─── Feature callouts ───────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 md:grid-cols-3">
        <FeatureCard
          title="Bring Your Own Model"
          description="Use Claude, GPT-4, Llama, or any model hosted on Bedrock or SageMaker. Swap models per-repo without changing a line of infra."
          accent="text-primer-green"
        />
        <FeatureCard
          title="AWS IAM Native"
          description="Authenticate with IAM roles — no API keys floating in env vars. Works with SCPs, permission boundaries, and your existing governance."
          accent="text-primer-blue"
        />
        <FeatureCard
          title="Multi-Agent Pipeline"
          description="Reviews run as a pipeline of specialised agents: security, style, correctness, and more. Each agent contributes to a unified review."
          accent="text-primer-purple"
        />
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800 px-6 py-6 text-center text-xs text-primer-muted">
        &copy; {new Date().getFullYear()} mergewatch.ai &mdash; open source
        under MIT
      </footer>
    </div>
  );
}

/* ─── Inline sub-components ──────────────────────────────────────────────── */

/** A single feature card rendered in the grid. */
function FeatureCard({
  title,
  description,
  accent,
}: {
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h3 className={`text-base font-semibold ${accent}`}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-primer-muted">
        {description}
      </p>
    </div>
  );
}

/** Small right-arrow SVG used in the CTA button. */
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
