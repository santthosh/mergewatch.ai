# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MergeWatch is an open-source GitHub App that reviews pull requests using a multi-agent AI pipeline running on Amazon Bedrock. It uses a pnpm monorepo with Turborepo for builds.

## Repository Structure (Monorepo)

```
packages/
  core/           — @mergewatch/core: Interfaces (ILLMProvider, IInstallationStore, IReviewStore,
                    IGitHubAuthProvider), review pipeline, agents, prompts, GitHub client (portable
                    Octokit ops), comment formatter, skip logic, types, config. No AWS deps.
  storage-dynamo/ — @mergewatch/storage-dynamo: DynamoDB implementations of IInstallationStore
                    and IReviewStore.
  llm-bedrock/    — @mergewatch/llm-bedrock: BedrockLLMProvider (ILLMProvider implementation).
  lambda/         — @mergewatch/lambda: Lambda handlers (webhook + review-agent), SSM-based
                    GitHub auth provider. Wires core + storage-dynamo + llm-bedrock.
  dashboard/      — @mergewatch/dashboard: Next.js 14 dashboard (App Router, AWS Amplify).
infra/            — AWS SAM CloudFormation template
scripts/          — Deployment and SSM setup scripts
```

### Dependency Graph
```
core  ←  storage-dynamo  ←  lambda
core  ←  llm-bedrock     ←  lambda
core  ←  dashboard
```

## Common Commands

### Monorepo (from repo root)
```bash
pnpm install                   # Install all workspace dependencies
pnpm run build                 # Build all packages (Turborepo, respects dep order)
pnpm run typecheck             # TypeScript type checking across all packages
pnpm run deploy                # Deploy to AWS (prod)
pnpm run deploy:dev            # Deploy to dev stage
pnpm run logs:webhook          # Tail webhook Lambda logs
pnpm run logs:agent            # Tail review agent Lambda logs
```

### Dashboard (from packages/dashboard/)
```bash
cd packages/dashboard && pnpm run dev    # Local dev server (http://localhost:3000)
pnpm run build                           # Production build
pnpm run lint                            # Next.js linting
```

## Architecture

### Multi-Agent Pipeline
The review pipeline runs parallel specialized agents (security, bug, style, summary, diagram) via `Promise.all()`, then an orchestrator deduplicates findings and produces a merge readiness score (1-5). Key files:

- `packages/core/src/agents/reviewer.ts` — Pipeline orchestration via `runReviewPipeline(options, { llm })` with dependency-injected `ILLMProvider`
- `packages/core/src/agents/prompts.ts` — System prompts for each agent (JSON response format required)
- `packages/llm-bedrock/src/bedrock-provider.ts` — `BedrockLLMProvider` implementing `ILLMProvider`

### Interfaces (in @mergewatch/core)
- `ILLMProvider` — `invoke(modelId, prompt, maxTokens?)` — implemented by `BedrockLLMProvider`
- `IInstallationStore` — `get()`, `getSettings()`, `upsert()` — implemented by `DynamoInstallationStore`
- `IReviewStore` — `upsert()`, `updateStatus()`, `queryByPR()` — implemented by `DynamoReviewStore`
- `IGitHubAuthProvider` — `getInstallationOctokit()` — implemented by `SSMGitHubAuthProvider`

### Lambda Handlers
- `packages/lambda/src/handlers/webhook.ts` — Validates GitHub webhook signatures, parses events, invokes review agent Lambda
- `packages/lambda/src/handlers/review-agent.ts` — Main review logic: wires all providers, runs pipeline, posts comments
- `packages/lambda/src/github-auth-ssm.ts` — SSM-backed GitHub App auth + webhook secret

### GitHub Integration
- `packages/core/src/github/client.ts` — Portable GitHub API ops: PR diffs, comments (upsert via `<!-- mergewatch-review -->` marker), Check Runs, reactions
- Credentials (App ID, private key, webhook secret) stored in AWS SSM Parameter Store, not env vars

### Data Layer
Two DynamoDB tables (defined in `infra/template.yaml`):
- **mergewatch-installations** — PK: `installationId`, SK: `repoFullName` (or `#SETTINGS` for installation-level settings). Tracks monitored repos and per-installation config.
- **mergewatch-reviews** — PK: `repoFullName`, SK: `prNumberCommitSha` (format: `42#abc123`). Review history with 90-day TTL.

Types in `packages/core/src/types/db.ts`, GitHub payload types in `packages/core/src/types/github.ts`.

### Web Dashboard
- **Auth**: NextAuth with GitHub OAuth provider (`packages/dashboard/lib/auth.ts`). Session exposes `accessToken` and `githubUserId`.
- **DynamoDB access**: Singleton client in `packages/dashboard/lib/dynamo.ts`, uses AWS credential chain (works locally with `aws configure`, on Amplify via IAM role).
- **GitHub API helpers**: `packages/dashboard/lib/github-repos.ts` — installation listing, repo fetching, admin checks.
- **Theming**: CSS custom properties in `packages/dashboard/app/globals.css` with semantic Tailwind tokens in `packages/dashboard/tailwind.config.ts`. Light/dark via `next-themes` with `class` strategy.
- **Amplify SSR caveat**: Server-side DynamoDB queries in page components can be unreliable. The dashboard uses client-side fetches to `/api/reviews` for review data. Env vars must be listed in `packages/dashboard/next.config.js` `env` block to be available at runtime.

### Key Patterns
- All server component pages use `export const dynamic = "force-dynamic"` to prevent caching
- Comment upsert: finds existing bot comment via HTML marker, DynamoDB lookup, or GitHub API scan
- Smart skip: `shouldSkipPR()` in `packages/core/src/skip-logic.ts` detects docs-only/lock-file PRs to avoid unnecessary Bedrock costs
- Installation settings stored as sentinel row with SK `#SETTINGS` in the installations table
- Zero API keys: Lambda uses IAM instance profiles for Bedrock; GitHub credentials in SSM

## Configuration

Per-repo config via `.mergewatch.yml` in repo root. See the self-referential `.mergewatch.yml` in this repo for the format. Settings can also be managed via the dashboard Settings page (stored in DynamoDB).

## Deployment

Backend deploys via SAM (`scripts/deploy.sh`). Web dashboard deploys via AWS Amplify (connected to the `main` branch, app root set to `packages/dashboard`, auto-deploys on push).
