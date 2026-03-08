<p align="center">
  <img src="assets/wordmark-fit.png" alt="mergewatch" height="48" />
</p>

<p align="center">
  <strong>AI-powered PR reviews. Your cloud, your models, your rules.</strong>
</p>

<p align="center">
  <a href="https://github.com/santthosh/mergewatch.ai/actions"><img src="https://img.shields.io/github/actions/workflow/status/santthosh/mergewatch.ai/deploy.yml?style=flat-square&label=deploy" alt="Deploy"></a>
  <a href="https://github.com/santthosh/mergewatch.ai"><img src="https://img.shields.io/github/stars/santthosh/mergewatch.ai?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/santthosh/mergewatch.ai/issues"><img src="https://img.shields.io/github/issues/santthosh/mergewatch.ai?style=flat-square" alt="Issues"></a>
  <img src="https://img.shields.io/badge/AWS-SAM-orange?style=flat-square&logo=amazonaws" alt="AWS SAM">
  <img src="https://img.shields.io/badge/runtime-Node.js_20-339933?style=flat-square&logo=nodedotjs&logoColor=fff" alt="Node.js 20">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome">
</p>

---

MergeWatch is an open-source GitHub App that reviews pull requests using a multi-agent AI pipeline. It runs entirely in **your** AWS account via Amazon Bedrock — your code never leaves your infrastructure.

## Highlights

- **Multi-agent pipeline** — parallel security, bug, and style agents with an orchestrator that deduplicates and ranks findings
- **Merge readiness score** — every PR gets a clear 1–5 rating so you know at a glance if it's safe to merge
- **Bring your own model** — Claude, Llama, Mistral — any model available in your Bedrock region
- **Smart skip** — auto-skips trivial PRs (lock files, docs, config) to save cost
- **GitHub Checks** — pass/fail status in the PR merge box with a link to the dashboard
- **Mermaid diagrams** — auto-generated architecture diagrams of changes
- **Confidence scores** — per-finding confidence so you can triage effectively
- **Dashboard** — full-featured Next.js dashboard with light/dark themes
- **Zero API keys** — authenticates via AWS IAM instance profiles
- **Per-repo config** — `.mergewatch.yml` for fine-grained control

## How it works

```
 GitHub                          Your AWS Account
 ──────                          ────────────────
                  webhook
  PR opened  ──────────────►  API Gateway
                                   │
                                   ▼
                             ┌───────────┐
                             │  Webhook   │  Validates signature,
                             │  Handler   │  checks smart-skip rules
                             └─────┬─────┘
                                   │ async invoke
                                   ▼
                             ┌───────────┐     ┌──────────────┐
                             │  Review    │────►│ Amazon       │
                             │  Agent     │◄────│ Bedrock      │
                             └─────┬─────┘     └──────────────┘
                                   │
                          ┌────────┼────────┐
                          ▼        ▼        ▼
                      Security   Bug    Style     ← parallel agents
                          └────────┼────────┘
                                   ▼
                             Orchestrator  → deduplicate, rank, score
                                   │
                                   ▼
                             GitHub API  → PR comment + check run
```

**Data stores:** DynamoDB &nbsp;·&nbsp; **Secrets:** SSM Parameter Store &nbsp;·&nbsp; **Auth:** IAM roles

## Quick start

```bash
# 1. Clone & install
git clone https://github.com/santthosh/mergewatch.ai.git && cd mergewatch.ai
npm install

# 2. Create a GitHub App (https://github.com/settings/apps/new)
#    Permissions: pull_requests (rw), contents (r), checks (rw)
#    Events: pull_request, issue_comment
#    Generate a private key and note the App ID

# 3. Store credentials in AWS SSM
./scripts/setup-ssm.sh

# 4. Deploy
./scripts/deploy.sh

# 5. Set the webhook URL printed by deploy in your GitHub App settings
```

See [docs/aws-setup.md](docs/aws-setup.md) for the full guide.

## Configuration

Drop a `.mergewatch.yml` in your repo root:

```yaml
version: 1
model: anthropic.claude-sonnet-4-20250514

agents:
  - name: security
    enabled: true
  - name: logic
    enabled: true
  - name: style
    enabled: true

rules:
  max_files: 50
  ignore_patterns:
    - "*.lock"
    - "vendor/**"
    - "dist/**"
  auto_review: true
```

| Key | Default | Description |
|-----|---------|-------------|
| `model` | Claude Sonnet | Bedrock model ID |
| `agents[].enabled` | `true` | Toggle individual agents |
| `rules.max_files` | `50` | Skip review above this file count |
| `rules.ignore_patterns` | `[]` | Glob patterns to exclude |
| `rules.auto_review` | `true` | Review on every PR open/push |

## Supported models

| Model | Bedrock ID | Best for |
|-------|-----------|----------|
| Claude Opus 4.6 | `anthropic.claude-opus-4-6` | Deep security & logic analysis |
| Claude Sonnet 4.6 | `anthropic.claude-sonnet-4-6` | Balanced cost/quality (recommended) |
| Claude Haiku 4.5 | `anthropic.claude-haiku-4-5-20251001` | Fast style checks, summaries |
| Llama 3.1 70B | `meta.llama3-1-70b-instruct-v1:0` | Open-weight alternative |
| Mistral Large | `mistral.mistral-large-2407-v1:0` | EU data residency |

> Any model in your Bedrock region works — just set the ID.

## Why MergeWatch?

| | MergeWatch | SaaS alternatives |
|---|---|---|
| **Model choice** | Any Bedrock model | Vendor-locked |
| **Data residency** | Your VPC / region | Vendor cloud |
| **Auth** | IAM — no API keys | API key per org |
| **Review pipeline** | Multi-agent + orchestrator | Single-pass |
| **Config** | `.mergewatch.yml` per repo | Limited |
| **Source** | AGPL-3.0 open source | Proprietary |

## Project structure

```
├── src/
│   ├── agents/          # Review agents + orchestrator
│   ├── bedrock/         # Bedrock client
│   ├── github/          # GitHub API client
│   ├── handlers/        # Lambda handlers
│   └── types/           # TypeScript types
├── web/                 # Next.js dashboard
│   ├── app/             # App router pages
│   └── components/      # UI components
├── infra/               # SAM template
└── scripts/             # Setup & deploy scripts
```

## Contributing

Contributions are welcome! Fork the repo, create a feature branch, and open a PR.

```bash
git checkout -b feat/my-feature
git commit -m 'Add my feature'
git push origin feat/my-feature
```

## License

AGPL-3.0
