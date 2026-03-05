# Architecture

This document describes how MergeWatch works end-to-end.

## System Diagram

```
 GitHub                              Your AWS Account
 ──────                              ────────────────

                    HTTPS (webhook)
  PR event  ───────────────────────►  API Gateway (REST)
  (open /                                 │
   synchronize /                          │ Lambda proxy integration
   comment)                               ▼
                                    ┌──────────────┐
                                    │   Webhook     │
                                    │   Lambda      │
                                    │              │
                                    │ - Verify sig │
                                    │ - Parse event│
                                    │ - Enqueue    │
                                    └──────┬───────┘
                                           │
                                           │  SQS SendMessage
                                           ▼
                                    ┌──────────────┐
                                    │  Review Queue │  (SQS FIFO)
                                    │              │
                                    │  DLQ after 3 │
                                    │  retries     │
                                    └──────┬───────┘
                                           │
                                           │  Lambda event source mapping
                                           ▼
                                    ┌──────────────┐
                                    │  Review Agent │
                                    │  Lambda       │
                                    │              │         ┌──────────────┐
                                    │ - Fetch diff │────────►│   DynamoDB   │
                                    │ - Load config│◄────────│  (reviews,   │
                                    │ - Run agents │         │   configs)   │
                                    │ - Post review│         └──────────────┘
                                    └──────┬───────┘
                                           │
                                    ┌──────┴──────┐
                                    │             │
                                    ▼             ▼
                              ┌──────────┐  ┌───────────┐
                              │ Bedrock  │  │ GitHub    │
                              │ Invoke   │  │ REST API  │
                              │ Model    │  │ (comments)│
                              └──────────┘  └───────────┘
```

## Components

### 1. API Gateway

- REST API with a single `POST /webhook` route
- Passes the raw body + headers to the Webhook Lambda

### 2. Webhook Lambda

**Trigger**: API Gateway proxy event

**Responsibilities**:
- Validate the `X-Hub-Signature-256` header using the webhook secret
- Parse the GitHub event (`pull_request`, `issue_comment`)
- Determine the action: new PR (`opened`), push to PR (`synchronize`), or mention (`@mergewatch` in a comment)
- Enqueue a review job to SQS with the repo, PR number, and trigger type
- Return `200` immediately so GitHub doesn't time out

**Runtime**: Node.js 22.x | Memory: 256 MB | Timeout: 10 s

### 3. SQS Review Queue

- FIFO queue with content-based deduplication
- Message group ID = `{owner}/{repo}#{pr_number}` — serializes reviews per PR
- Dead-letter queue after 3 failed attempts
- Visibility timeout matches the Review Agent Lambda timeout

### 4. Review Agent Lambda

**Trigger**: SQS event source mapping (batch size 1)

**Responsibilities**:
1. **Fetch context** — call the GitHub API to get the PR diff, file list, and `.mergewatch.yml` from the PR's base branch
2. **Filter files** — apply `ignore_patterns` and `max_files` rules
3. **Run agent pipeline** — for each enabled agent, invoke Bedrock with the agent's system prompt + the diff
4. **Merge results** — deduplicate overlapping comments, attach file/line metadata
5. **Post review** — create a GitHub PR review with inline comments (or a summary comment)
6. **Record** — write the review metadata to DynamoDB

**Runtime**: Node.js 22.x | Memory: 1024 MB | Timeout: 300 s (5 min)

### 5. Amazon Bedrock

- Invoked via the `InvokeModel` API using the IAM role attached to the Review Agent Lambda
- No API keys — the Lambda's execution role has `bedrock:InvokeModel` permission scoped to the configured model(s)
- Model ID is read from `.mergewatch.yml` (falls back to a deploy-time default)

### 6. DynamoDB

Stores review history and cached configuration.

## Data Flows

### Flow 1 — New PR opened

```
Developer opens PR
  → GitHub sends `pull_request` / `opened` webhook
  → Webhook Lambda validates, enqueues job
  → Review Agent fetches diff, runs agents, posts review
```

### Flow 2 — `@mergewatch` mention in a comment

```
Developer comments "@mergewatch please review"
  → GitHub sends `issue_comment` / `created` webhook
  → Webhook Lambda detects mention, enqueues job
  → Review Agent fetches latest diff, runs agents, posts review
```

### Flow 3 — New commits pushed to PR (synchronize)

```
Developer pushes commits
  → GitHub sends `pull_request` / `synchronize` webhook
  → Webhook Lambda enqueues job
  → Review Agent fetches updated diff, runs agents, posts new review
```

## Why IAM Instance Profiles (No API Keys)

Traditional review bots require you to paste API keys into their dashboard. This creates:

- **Secret sprawl** — keys in multiple vaults / env vars / dashboards
- **Rotation burden** — who rotates? when? what breaks?
- **Blast radius** — a leaked key gives access to the vendor and your repos

MergeWatch uses IAM roles attached to Lambda execution environments. The Review Agent Lambda's role includes:

```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:*::foundation-model/*"
}
```

No keys to store, rotate, or leak. Access is governed by your existing IAM policies and SCPs.

## Multi-Agent Pipeline

Instead of one monolithic prompt, MergeWatch splits the review across specialized agents:

```
                    ┌────────────┐
          ┌────────►│  Security  │────────┐
          │         └────────────┘        │
          │         ┌────────────┐        │
  Diff ───┼────────►│   Logic    │────────┼───► Merge & Dedupe ───► PR Review
          │         └────────────┘        │
          │         ┌────────────┐        │
          ├────────►│   Style    │────────┤
          │         └────────────┘        │
          │         ┌────────────┐        │
          └────────►│   Tests    │────────┘
                    └────────────┘
```

**Why multi-agent?**

- **Focus** — each agent has a narrow system prompt, reducing hallucination
- **Parallelism** — agents run concurrently (Promise.all), total latency ~ slowest agent
- **Customizability** — enable/disable agents per repo, tweak prompts independently
- **Model mixing** — use Opus for security, Haiku for style (cost optimization)

## DynamoDB Schema

### Table: `mergewatch-reviews`

| Key | Type | Description |
|---|---|---|
| `PK` | String | `REPO#{owner}/{repo}` |
| `SK` | String | `PR#{number}#REV#{timestamp}` |
| `trigger` | String | `opened` / `synchronize` / `mention` |
| `model` | String | Bedrock model ID used |
| `agents` | List | Agent names that ran |
| `commentCount` | Number | Total comments posted |
| `durationMs` | Number | End-to-end review time |
| `status` | String | `completed` / `failed` |
| `ttl` | Number | Epoch seconds (90-day expiry) |

### Table: `mergewatch-config-cache`

| Key | Type | Description |
|---|---|---|
| `PK` | String | `REPO#{owner}/{repo}` |
| `SK` | String | `CONFIG` |
| `sha` | String | Git SHA of the cached `.mergewatch.yml` |
| `config` | Map | Parsed config object |
| `ttl` | Number | Epoch seconds (1-day expiry) |

## How to Add a New Agent

1. Add an entry to the `agents` array in `.mergewatch.yml`:

```yaml
agents:
  - name: performance
    enabled: true
    prompt: "Identify N+1 queries, unnecessary allocations, and O(n^2) loops."
```

2. That's it. The Review Agent Lambda reads the agent list at runtime and invokes Bedrock once per enabled agent. No code changes needed.

To add custom pre/post-processing logic for an agent, create a handler in `src/agents/`:

```
src/agents/
  security.ts    # optional — custom pre/post logic
  logic.ts
  performance.ts # your new agent
  index.ts       # dynamic loader
```

Each agent module exports `{ preprocess, postprocess }`. If no module exists for an agent name, the default passthrough is used.

## How to Add a New Model

1. Enable the model in your AWS account (Bedrock console → Model access)
2. Update the Lambda role if you scoped `bedrock:InvokeModel` to specific model ARNs
3. Set the model ID in `.mergewatch.yml`:

```yaml
model: amazon.titan-text-premier-v1:0
```

If the model uses a non-standard request/response format, add a codec in `src/models/`:

```
src/models/
  anthropic.ts   # Claude request/response mapping
  meta.ts        # Llama
  mistral.ts     # Mistral
  amazon.ts      # Titan
  index.ts       # routes model ID prefix → codec
```
