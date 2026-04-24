# AI Code Review Tools — Comparison

**As of 2026-04-24.** Pricing, model availability, and features in this space change on a near-weekly basis — verify current details against each vendor's own pricing and docs pages before making a purchase decision.

## How to read this document

- **Primary sources only.** Every factual claim in this file was sourced from the vendor's own docs, pricing, changelog, or product pages. Third-party summaries, Reddit threads, and AI tool directories were not used. Source URLs are included next to each section.
- **"Not publicly documented" is a real answer.** Some vendors don't disclose their agent architecture, the exact model powering their product, or their data-retention policy. Where that's the case, this document says so rather than guessing.
- **MergeWatch is the publisher.** This doc lives in the MergeWatch repository. Factual bias was minimized by sticking to competitors' own marketing claims and documented behavior; cells where MergeWatch has a differentiator are marked by what MergeWatch *does*, not by negatives inferred about competitors.
- **Pricing is in USD and per-seat/month unless noted.** Promotional discounts and annual/monthly splits are collapsed for readability; see each vendor's pricing page for the current exact structure.

## Tools covered

1. [MergeWatch](#mergewatch)
2. [CodeRabbit](#coderabbit)
3. [Greptile](#greptile)
4. [GitHub Copilot code review](#github-copilot-code-review)
5. [OpenAI Codex](#openai-codex)
6. [Claude Code](#claude-code)
7. [Cursor BugBot](#cursor-bugbot)
8. [Qodo (formerly Codium)](#qodo-formerly-codium)
9. [Other tools worth knowing](#other-tools-worth-knowing)

## Quick matrix

| | MergeWatch | CodeRabbit | Greptile | GitHub Copilot review | OpenAI Codex | Claude Code | Cursor BugBot | Qodo Merge |
|---|---|---|---|---|---|---|---|---|
| **License** | AGPL-3.0 | Closed | Closed | Closed | Mixed (CLI open, hosted closed) | Closed (action open) | Closed | AGPL-3.0 core + commercial |
| **Self-host** | Yes (Docker + Postgres) | Enterprise only (500+ seats) | Yes (Enterprise, in AWS) | No | No (CLI runs locally but calls OpenAI API) | GitHub Actions runner | No | Yes (SaaS, on-prem, air-gapped) |
| **BYO LLM** | Bedrock, Anthropic, LiteLLM (100+), Ollama | Self-host: OpenAI, Azure, Bedrock, Anthropic | Enterprise self-host only | No (uses Copilot's selection) | No (OpenAI only) | Anthropic only (direct, Bedrock, Vertex) | No (Cursor-managed) | Open-source core: OpenAI, Claude, DeepSeek, more |
| **Primary trigger** | PR webhook + `@mergewatch` comments + Checks UI Re-run | PR webhook + IDE + CLI + chat | PR comments + IDE + MCP + `/greploop` | Manual or auto PR, in web + many IDEs | CLI + IDE + web + desktop | CLI + `@claude` mentions + GitHub Action | Auto on PR update + manual comment | PR + IDE + CLI |
| **Free tier for private repos** | Yes (see pricing) | 14-day trial | No (OSS discount available) | Inside paid Copilot only | Inside paid ChatGPT only | Inside paid Claude only | 14-day trial | Yes (Developer $0, limited credits) |
| **Multi-agent architecture** | Yes (6 review + 2 utility, parallel, capped at 3 concurrent) | "Agentic reviews" + 40+ linters; agent count not disclosed | "Swarm of agents" + TREX for tests | Not publicly documented | Agentic, multi-tool, skills + automations | Single agent loop with tool use | Not publicly documented as multi-agent | "Specialized agents" (count not disclosed) |
| **MCP server (outbound)** | Yes (core landed; Lambda transport landed) | Not publicly documented | MCP connection documented | No | No | No | No |
| **Merge-readiness score** | Yes (1–5) | Not publicly documented | Not publicly documented | No | No | No | No | Not publicly documented |
| **Conventions injection** | Yes (AGENTS.md / CONVENTIONS.md auto-discovered) | YAML customization | Plain-English custom rules; learns from past PR comments | CLAUDE-like model guidance not documented | Skills | `CLAUDE.md` project standards | Bugbot Rules | PR-Agent rules |
| **Data retention claim** | No persistent code storage (diff in-memory only); 90-day review metadata TTL | "Zero retention post-review"; SOC 2 Type II | DPA on Enterprise | Business/Enterprise: 28-day prompt retention | Governed by OpenAI policy | Direct to API, no backend index | "Privacy-mode compliant" | Zero data retention, SOC 2 |
| **Starting paid tier (per seat / month)** | Usage-based via Stripe balance | $24 Pro, $48 Pro Plus | $30 + $1/review over 50 | Bundled in Copilot | Bundled in ChatGPT Plus/Pro | Bundled in Claude Pro | $40 | $30 Teams |

The cells above are compressed for skim-ability. Per-tool details, source URLs, and nuance follow below.

---

## MergeWatch

*Source: this repository (code + docs); some architectural claims are pulled from [configuration/conventions](https://docs.mergewatch.ai/configuration/conventions) and [overview/how-it-works](https://docs.mergewatch.ai/overview/how-it-works).*

- **What it is.** A GitHub App that reviews every pull request with a multi-agent AI pipeline. Ships as both a SaaS product (`mergewatch.ai`) and a fully self-hostable Docker image.
- **Trigger model.** Subscribes to `pull_request` (opened, synchronize, reopened, ready_for_review), `issue_comment` (for `@mergewatch review` / `@mergewatch summary`), `pull_request_review_comment` (for inline thread replies), and `check_run.rerequested` (re-run from the GitHub Checks UI).
- **Where it runs.** SaaS deploys on AWS Lambda + DynamoDB + Bedrock. Self-hosted deploys as a single Docker image + Postgres. No dashboard-hosted code index.
- **LLM flexibility.** Pluggable `ILLMProvider` interface with four first-party implementations: Amazon Bedrock (SaaS default), Anthropic direct API, LiteLLM proxy (100+ providers), and Ollama (local/air-gapped).
- **Open source.** AGPL-3.0. The entire review pipeline — agent prompts, orchestrator, comment templates — is public.
- **Agent architecture.** Six review agents (security, bug, style, error handling, test coverage, comment accuracy) + two utility agents (summary, diagram). Run in parallel with a concurrency cap (currently 3) to stay within Bedrock TPM quotas. An orchestrator agent deduplicates overlapping findings across agents, ranks by severity + confidence, and produces a merge-readiness score from 1 to 5.
- **Agent-authored PR detection.** Classifies each PR as `source='agent'` or `source='human'` using commit trailers, branch prefixes, and PR labels configured in `.mergewatch.yml`. When flagged as agent-authored, the pipeline injects a stricter prompt suffix that flags hallucinated imports, tests-without-assertions, over-abstraction, and stale APIs.
- **Conventions.** Auto-discovers `AGENTS.md` / `CONVENTIONS.md` / `.mergewatch/conventions.md` from the repo root and injects the content (16 KB cap) into every agent's prompt.
- **MCP server.** Exposes `review_diff` + `get_review_status` tools to external coding agents (Claude Code, Cursor, etc.) via a public Lambda Function URL with API-key auth. Sessions carry 30-minute billing dedup.
- **Pricing.** Free tier for public repos and usage-based billing for private repos (via Stripe balance transactions; charges based on actual LLM inference cost). See `mergewatch.ai/pricing` for current pricing.
- **Data handling.** PR diff is held in-memory during review and never persisted. Review metadata (per-agent latency, merge score, findings, settings snapshot) is stored in DynamoDB with a 90-day TTL. GitHub credentials are stored encrypted in SSM Parameter Store. See `docs.mergewatch.ai/saas/data-residency`.

---

## CodeRabbit

*Sources: [coderabbit.ai](https://www.coderabbit.ai/), [pricing](https://www.coderabbit.ai/pricing), [self-hosted docs](https://docs.coderabbit.ai/self-hosted/github), [OSS program](https://www.coderabbit.ai/oss).*

- **What it is.** A commercial AI code review platform that positions itself as the most-installed AI app on GitHub. ([coderabbit.ai](https://www.coderabbit.ai/))
- **Trigger model.** PR webhook is primary. Also supports IDE integration, CLI, and an "Agentic Chat" bot interface. ([coderabbit.ai](https://www.coderabbit.ai/))
- **Where it runs.** SaaS by default. Self-hosted is available only to Enterprise customers with 500+ seats. ([docs.coderabbit.ai](https://docs.coderabbit.ai/self-hosted/github))
- **LLM flexibility.** On default SaaS, the model is not publicly documented. The self-hosted build lets customers plug in OpenAI, Azure OpenAI, AWS Bedrock (Claude 3/3.5/4 family), or Anthropic directly. ([docs.coderabbit.ai](https://docs.coderabbit.ai/self-hosted/github))
- **Open source.** Closed-source commercial product. Runs a "free for OSS projects" program and has distributed $600K+ to maintainers. ([coderabbit.ai/oss](https://www.coderabbit.ai/oss))
- **Agent architecture.** Described as "agentic reviews" with codegraph/AST context, 40+ integrated linters and security scanners, and a "Fix with AI" remediation step. Agent count or single-vs-multi-pass composition not publicly documented. ([coderabbit.ai](https://www.coderabbit.ai/))
- **Key claims.** "75M defects found across 3M repositories," most-installed AI app on GitHub, YAML customization, 40+ linters/SAST tools. ([coderabbit.ai](https://www.coderabbit.ai/))
- **Pricing.** Free $0 (14-day Pro trial, PR summarization, IDE reviews). Pro $24/user/month annual (linters/SAST, Jira/Linear, 5 MCP connections, 5 reviews/hour). Pro Plus $48/user/month annual (custom pre-merge checks, 15 MCP connections, 10 reviews/hour). Enterprise custom (RBAC, SSO, self-hosting, SLA). ([pricing](https://www.coderabbit.ai/pricing))
- **Data handling.** "SSL encrypted data," "zero data retention post-review," SOC 2 Type II certified. ([coderabbit.ai](https://www.coderabbit.ai/))

---

## Greptile

*Sources: [greptile.com](https://www.greptile.com/), [pricing](https://www.greptile.com/pricing).*

- **What it is.** "AI agents that review and test pull requests with full context of the codebase." ([greptile.com](https://www.greptile.com/))
- **Trigger model.** PR comments on GitHub/GitLab; IDE integrations with Claude Code, Cursor, Codex, Devin; MCP connection; a `/greploop` command for iterative workflows. ([greptile.com](https://www.greptile.com/))
- **Where it runs.** Both SaaS and self-hosted (self-hosting in AWS is available on the Enterprise plan). ([pricing](https://www.greptile.com/pricing))
- **LLM flexibility.** Cloud plan uses Greptile's managed stack. Enterprise self-host can deploy with their own LLM providers. ([greptile.com](https://www.greptile.com/))
- **Open source.** Proprietary / closed source. ([greptile.com](https://www.greptile.com/))
- **Agent architecture.** "A swarm of agents" operating in parallel; codebase indexed as a graph; dedicated TREX agent for autonomous test generation. ([greptile.com](https://www.greptile.com/))
- **Key claims.** Graph-based codebase indexing, learning from team PR comments, plain-English custom rules, multi-file logical bug detection, MCP integration with coding agents. ([greptile.com](https://www.greptile.com/))
- **Pricing.** Cloud $30/seat/month with 50 reviews included + $1 per additional review; unlimited repos and users. Enterprise custom pricing adds self-hosting, SSO/SAML, custom DPA, and a forward-deployed engineer. No free tier; OSS and startup discounts available. ([pricing](https://www.greptile.com/pricing))
- **Data handling.** Retention/training posture not publicly documented on pages fetched. Custom DPA offered on Enterprise. ([pricing](https://www.greptile.com/pricing))

---

## GitHub Copilot code review

*Sources: [GitHub Copilot](https://github.com/features/copilot), [code-review docs](https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review).*

- **What it is.** A pull-request review feature built into GitHub Copilot that "provides contextual explanations and code suggestions to help developers fix vulnerabilities in code." ([docs.github.com](https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review))
- **Trigger model.** Manual by default — open the Reviewers menu on a PR and select Copilot; reviews typically complete "in less than 30 seconds." Can be configured to auto-review all PRs. Works across GitHub web, VS Code, Visual Studio 17.14+, GitHub Mobile, Xcode, JetBrains IDEs, and `gh` CLI. ([docs.github.com](https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review))
- **Where it runs.** SaaS only (github.com infrastructure). ([github.com/features/copilot](https://github.com/features/copilot))
- **LLM flexibility.** The exact model powering Copilot code review is not specified on the public pages. Copilot-as-platform uses models from OpenAI, Anthropic, Google, and Microsoft, but the specific one for review is not publicly documented. ([github.com/features/copilot](https://github.com/features/copilot))
- **Open source.** Closed-source product. ([github.com/features/copilot](https://github.com/features/copilot))
- **Agent architecture.** Not publicly documented.
- **Key claims.** Native PR-flow integration, available to unlicensed org members when enabled (billed as "premium requests"), broad IDE coverage. ([docs.github.com](https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review))
- **Pricing.** Included in Copilot Pro, Business, and Enterprise. For non-licensed users accessing it through an org, usage bills as "premium requests." Check the Copilot pricing page for current per-seat rates. ([github.com/features/copilot](https://github.com/features/copilot))
- **Data handling.** For Business/Enterprise tiers on github.com, prompts and suggestions are retained for 28 days; user engagement data for two years. ([github.com/features/copilot](https://github.com/features/copilot))

---

## OpenAI Codex

*Sources: [developers.openai.com/codex](https://developers.openai.com/codex/), model announcements at openai.com/index for GPT-5-Codex, GPT-5.2-Codex, and GPT-5.3-Codex. Note: main `openai.com/codex/` landing pages returned 403 to automated fetching, so facts below are drawn from the developers docs.*

- **What it is.** "OpenAI's coding agent for software development" — an agentic coding product that writes, reviews, debugs, and automates code tasks; re-launched in 2025 as an agentic successor to the original Codex. ([developers.openai.com](https://developers.openai.com/codex/))
- **Trigger model.** Multiple surfaces — desktop app, CLI (open source), IDE extension, and a web/cloud interface. The Codex app includes "built-in worktrees and cloud environments" where agents work in parallel. ([developers.openai.com](https://developers.openai.com/codex/))
- **Where it runs.** Both local (via CLI) and in OpenAI cloud environments. Not self-hostable in the full sense — the CLI runs locally but still calls OpenAI APIs.
- **LLM flexibility.** Locked to OpenAI models. Codex-specific releases: GPT-5-Codex (Sept 2025), GPT-5.2-Codex, GPT-5.3-Codex.
- **Open source.** The Codex CLI is open source; the hosted Codex product is not.
- **Agent architecture.** Agentic, long-horizon reasoning; supports "Skills" (code understanding, prototyping, documentation) and "Automations" (issue triage, alert monitoring, CI/CD). ([developers.openai.com/codex/skills](https://developers.openai.com/codex/skills))
- **Key claims.** Long-horizon task execution, parallel cloud agents, deep integration with ChatGPT product surface.
- **Pricing.** Included with ChatGPT Plus, Pro, Business, Edu, and Enterprise plans. API access is billed separately at standard OpenAI rates. A "Codex for Open Source" program offers free API credits and ChatGPT Pro access by application.
- **Data handling.** Referenced via OpenAI's standard "Your data" policy. Specific retention numbers not surfaced on the docs page checked.

---

## Claude Code

*Sources: [claude.com/product/claude-code](https://claude.com/product/claude-code), [code.claude.com/docs/en/github-actions](https://code.claude.com/docs/en/github-actions).*

- **What it is.** Anthropic's official CLI coding assistant. Ships a GitHub Action that enables Claude to respond to `@claude` mentions in PR/issue comments, implement features, fix bugs, and run automated PR reviews.
- **Trigger model.** Terminal CLI; IDE extensions for VS Code, Cursor, Windsurf, JetBrains; desktop app for macOS/Linux/Windows; web and iOS; Slack; and the GitHub Action triggered by `@claude` mentions or any GitHub event (e.g. `pull_request: opened, synchronize`) with a custom `prompt`. Separate "GitHub Code Review" docs cover automatic per-PR reviews without a trigger.
- **Where it runs.** The GitHub Action runs on GitHub-hosted runners. The Claude Code CLI "runs locally in your terminal and talks directly to model APIs without requiring a backend server or remote code index." ([claude.com/product/claude-code](https://claude.com/product/claude-code))
- **LLM flexibility.** Locked to Anthropic's Claude models — defaults to Sonnet; Opus configurable via `--model`. Can call Claude via direct API, AWS Bedrock, or Google Vertex AI.
- **Open source.** The `anthropics/claude-code-action` GitHub Action is open source. The Claude Code CLI/platform itself is a commercial Anthropic product.
- **Agent architecture.** Built on the Claude Agent SDK; a single-agent loop with tool use (file edits, test running, etc.) and a configurable `--max-turns`. Not a pre-built multi-agent review pipeline — the user composes the review flow via prompt and skills.
- **Key claims.** "Instant PR creation," adherence to `CLAUDE.md` project standards, "secure by default — your code stays on GitHub's runners," BYO-cloud via Bedrock/Vertex.
- **Pricing.** Claude Pro $17/month annual (or $20/month), Max 5x $100/month, Max 20x $200/month, Team $20/seat/month (5–150 seats), Enterprise custom, API pay-as-you-go. Action runs cost GitHub Actions minutes + Anthropic API tokens. ([claude.com/product/claude-code](https://claude.com/product/claude-code))
- **Data handling.** "Talks directly to model APIs without requiring a backend server or remote code index." Detailed retention/training terms governed by Anthropic's commercial terms.

---

## Cursor BugBot

*Sources: [cursor.com/bugbot](https://cursor.com/bugbot), [cursor.com/docs/bugbot](https://cursor.com/docs/bugbot), [cursor.com/pricing](https://cursor.com/pricing).*

- **What it is.** "An AI-powered code review tool that detects logic bugs with low false positive rates," operating as a mandatory pre-merge check on GitHub. ([cursor.com/bugbot](https://cursor.com/bugbot))
- **Trigger model.** Automatic on every PR update by default. Also manual via comment (`cursor review` or `bugbot run`). Configurable to run only when mentioned or only once per PR. ([cursor.com/docs/bugbot](https://cursor.com/docs/bugbot))
- **Where it runs.** SaaS, integrated directly into GitHub (including GitHub Enterprise Server) and GitLab (including GitLab Self-Hosted) PR workflows. Fixes can be pushed through the Cursor editor or Background Agent.
- **LLM flexibility.** Uses "a combination of frontier and in-house models" — specific models not disclosed. Bugbot Autofix uses "your Default agent model from Settings → Models."
- **Open source.** Closed source.
- **Agent architecture.** Not publicly documented as multi-agent; described as a bug-detection reviewer that analyzes PR diffs and uses existing PR comments as context.
- **Key claims.** "Over 50% of flagged issues get fixed before merge," customizable Bugbot Rules, analyzes interactions with existing components beyond the diff.
- **Pricing.** Bugbot Pro $40/user/month (200 PRs/month); Bugbot Teams $40/user/month (code reviews on all PRs, analytics, advanced rules); Enterprise custom. 14-day free trial. ([cursor.com/pricing](https://cursor.com/pricing))
- **Data handling.** "Follows the same privacy compliance as Cursor and processes data identically to other Cursor requests"; "privacy-mode compliant."

---

## Qodo (formerly Codium)

*Sources: [qodo.ai/products/qodo-merge](https://www.qodo.ai/products/qodo-merge/), [pricing](https://www.qodo.ai/pricing/), [PR-Agent on GitHub](https://github.com/qodo-ai/pr-agent).*

- **What it is.** "AI code review platform that brings automated, context-aware review into your IDE, pull requests, CLI, and Git workflows." ([qodo-merge](https://www.qodo.ai/products/qodo-merge/))
- **Trigger model.** PRs on GitHub, GitLab, Bitbucket, Azure DevOps. Also IDE plugin, CLI tool, and Git workflows.
- **Where it runs.** SaaS (single- and multi-tenant), on-premises, and air-gapped deployments.
- **LLM flexibility.** The open-source PR-Agent project supports OpenAI GPT, Claude, DeepSeek, "and more." LLM flexibility on the commercial Qodo Merge tier is not publicly detailed.
- **Open source.** The PR-Agent core is AGPL-3.0. The hosted Qodo Merge product is a commercial layer on top.
- **Agent architecture.** "Specialized agents" deployed during reviews to find specific issues, backed by a "context engine" with multi-repo intelligence and PR history awareness.
- **Key claims.** Open-source foundation, multi-platform Git support, multi-repo context engine, "zero data retention, SOC 2, RBAC."
- **Pricing.** Developer $0/month (30 free PRs/month promo, IDE plugin, 75 credits). Teams $30/user/month annual ($38 monthly) with 2,500 credits/user/month and an unlimited-PR promo. Enterprise custom with SSO, dashboard, on-prem/air-gapped deployment, 2-business-day SLA.
- **Data handling.** "Zero data retention, SOC 2 certified, RBAC."

---

## Other tools worth knowing

These weren't deep-dived in the matrix above but are widely enough used to mention:

- **[Ellipsis](https://docs.ellipsis.dev/features/code-review)** — GitHub/GitLab app that posts AI code reviews within ~2–3 minutes of a PR; assigns confidence scores to each comment; free for public GitHub repos.
- **[Sourcery](https://sourcery.ai/code-review/)** — AI reviewer covering 30+ languages, triggered automatically or by `@sourcery-ai review`; also works in the IDE; SOC 2 certified, claims zero retention via Anthropic.
- **[Graphite Diamond](https://graphite.com/features/diamond)** — AI reviewer from the Graphite stacked-PR platform; tight integration with the Graphite PR workflow.
- **Sweep (sweep.dev)** — AI junior-dev agent that turns GitHub issues into PRs and can review PRs. *Treat as a lead to verify — not fetched in this session.*
- **Bito AI Code Review Agent (bito.ai)** — PR review agent with CLI and CI integration; markets multi-model support. *Treat as a lead to verify — not fetched in this session.*

---

## Known gaps in this comparison

A handful of facts we could not fully verify in primary sources; worth checking vendor pages directly if these matter to your decision:

- **CodeRabbit** — specific model used on the default SaaS tier.
- **Greptile** — public data retention and training posture (DPA exists on Enterprise).
- **GitHub Copilot code review** — the specific model powering the review feature.
- **OpenAI Codex** — Codex-specific retention numbers beyond OpenAI's general policy.
- **Cursor BugBot** — the exact models used for detection (vs. autofix).
- **Qodo Merge commercial tier** — LLM flexibility beyond the open-source PR-Agent core.

## Dimensions deliberately left out

- **Review quality / false-positive rate.** Every vendor has a marketing number (CodeRabbit's "75M defects," BugBot's "50% of issues get fixed"). None of these are independently verifiable and all use different counting methods. Benchmarking is outside the scope of a feature-and-pricing comparison.
- **Supported languages / frameworks.** Too stack-specific to matrix; check the individual vendor docs for your language.
- **SSO / RBAC granularity.** All vendors at the Enterprise tier offer SSO; the differences between SAML providers and RBAC granularity need a vendor-specific RFP, not a table row.

## Contributing to this document

If a fact in this file is wrong or out of date, please open a PR with the correction **and the vendor URL that backs it up**. Unsourced changes will be asked for a source before merge. The aim is for this doc to stay factual — a snapshot readers can trust, not a marketing artifact.
