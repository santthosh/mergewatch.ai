# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MergeWatch is an open-source GitHub App that reviews pull requests using a multi-agent AI pipeline running on Amazon Bedrock. It has two main parts: a serverless backend (Lambda + SQS) and a Next.js dashboard hosted on AWS Amplify.

## Repository Structure

- **`src/`** — Backend Lambda handlers and AI agents (TypeScript, deployed via SAM)
- **`web/`** — Next.js 14 dashboard (App Router, deployed on AWS Amplify)
- **`infra/`** — AWS SAM CloudFormation template
- **`scripts/`** — Deployment and SSM setup scripts

## Common Commands

### Backend (from repo root)
```bash
npm install                    # Install backend dependencies
npm run build                  # SAM build (esbuild compilation)
npm run typecheck              # TypeScript type checking (tsc --noEmit)
npm run deploy                 # Deploy to AWS (prod)
npm run deploy:dev             # Deploy to dev stage
npm run logs:webhook           # Tail webhook Lambda logs
npm run logs:agent             # Tail review agent Lambda logs
```

### Web Dashboard (from web/)
```bash
cd web && npm install          # Install web dependencies
npm run dev                    # Local dev server (http://localhost:3000)
npm run build                  # Production build
npm run lint                   # Next.js linting
```

### Type checking across both
```bash
npm run typecheck              # Backend (from root)
cd web && npx tsc --noEmit     # Web app
```

## Architecture

### Multi-Agent Pipeline
The review pipeline runs parallel specialized agents (security, bug, style, summary, diagram) via `Promise.all()`, then an orchestrator deduplicates findings and produces a merge readiness score (1-5). Key files:

- `src/agents/reviewer.ts` — Pipeline orchestration, runs all agents
- `src/agents/prompts.ts` — System prompts for each agent (JSON response format required)
- `src/bedrock/client.ts` — Model-agnostic Bedrock client (detects model family by ID prefix)

### Lambda Handlers
- `src/handlers/webhook.ts` — Validates GitHub webhook signatures, parses events, enqueues to SQS
- `src/handlers/review-agent.ts` — Main review logic: fetch diff → smart-skip check → run agents → post comment → record to DynamoDB

### GitHub Integration
- `src/github/client.ts` — GitHub API: PR diffs, comments (upsert via `<!-- mergewatch-review -->` marker), Check Runs, reactions
- Credentials (App ID, private key, webhook secret) stored in AWS SSM Parameter Store, not env vars

### Data Layer
Two DynamoDB tables (defined in `infra/template.yaml`):
- **mergewatch-installations** — PK: `installationId`, SK: `repoFullName` (or `#SETTINGS` for installation-level settings). Tracks monitored repos and per-installation config.
- **mergewatch-reviews** — PK: `repoFullName`, SK: `prNumberCommitSha` (format: `42#abc123`). Review history with 90-day TTL.

Types in `src/types/db.ts`, GitHub payload types in `src/types/github.ts`.

### Web Dashboard
- **Auth**: NextAuth with GitHub OAuth provider (`web/lib/auth.ts`). Session exposes `accessToken` and `githubUserId`.
- **DynamoDB access**: Singleton client in `web/lib/dynamo.ts`, uses AWS credential chain (works locally with `aws configure`, on Amplify via IAM role).
- **GitHub API helpers**: `web/lib/github-repos.ts` — installation listing, repo fetching, admin checks.
- **Theming**: CSS custom properties in `web/app/globals.css` with semantic Tailwind tokens in `web/tailwind.config.ts`. Light/dark via `next-themes` with `class` strategy.
- **Amplify SSR caveat**: Server-side DynamoDB queries in page components can be unreliable. The dashboard uses client-side fetches to `/api/reviews` for review data. Env vars must be listed in `web/next.config.js` `env` block to be available at runtime.

### Key Patterns
- All server component pages use `export const dynamic = "force-dynamic"` to prevent caching
- Comment upsert: finds existing bot comment via HTML marker, DynamoDB lookup, or GitHub API scan
- Smart skip: `shouldSkipPR()` in review-agent detects docs-only/lock-file PRs to avoid unnecessary Bedrock costs
- Installation settings stored as sentinel row with SK `#SETTINGS` in the installations table
- Zero API keys: Lambda uses IAM instance profiles for Bedrock; GitHub credentials in SSM

## Configuration

Per-repo config via `.mergewatch.yml` in repo root. See the self-referential `.mergewatch.yml` in this repo for the format. Settings can also be managed via the dashboard Settings page (stored in DynamoDB).

## Deployment

Backend deploys via SAM (`scripts/deploy.sh`). Web dashboard deploys via AWS Amplify (connected to the `main` branch, auto-deploys on push).
