# MergeWatch

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![AWS SAM](https://img.shields.io/badge/AWS-SAM-orange.svg)](https://aws.amazon.com/serverless/sam/)

**Model-agnostic, multi-agent PR reviews. Your cloud, your rules.**

MergeWatch is an open-source GitHub App that reviews pull requests using AI. It runs entirely in your AWS account, talks to Amazon Bedrock (or any model you wire up), and never sends your code to a third-party service.

## Why MergeWatch?

| | MergeWatch | Greptile / CodeRabbit |
|---|---|---|
| **Model choice** | BYOM — use any Bedrock model (or add your own) | Vendor-locked |
| **Auth** | AWS IAM instance profiles — no API keys to rotate | API key per org |
| **Agents** | Multi-agent pipeline (security, style, logic, tests) | Single-pass |
| **Rules** | `.mergewatch.yml` per repo — fully customizable | Limited config |
| **Data residency** | Stays in your VPC / region | Vendor cloud |
| **Source** | MIT open source | Proprietary |

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/mergewatch/mergewatch.git && cd mergewatch
npm install

# 2. Create a GitHub App (https://github.com/settings/apps/new)
#    - Permissions: pull_requests (read/write), contents (read)
#    - Subscribe to events: pull_request, issue_comment
#    - Generate a private key (.pem) and note the App ID
#    - Set a webhook secret: openssl rand -hex 32

# 3. Store GitHub credentials in AWS SSM Parameter Store
./scripts/setup-ssm.sh        # prompts for App ID, .pem path, webhook secret

# 4. Deploy to AWS
./scripts/deploy.sh            # builds & deploys via SAM

# 5. Configure the GitHub App webhook
#    Copy the Webhook URL printed by the deploy script.
#    Paste it into your GitHub App's webhook settings (Content type: application/json).

# 6. Add a .mergewatch.yml to your repo (see below) and open a PR.
```

See [docs/aws-setup.md](docs/aws-setup.md) for the full step-by-step guide.

## Architecture (high level)

```
 GitHub                          Your AWS Account
 ──────                          ────────────────
                  webhook
  PR opened  ──────────────►  API Gateway (HTTP API)
                                   │
                                   ▼
                             ┌───────────┐
                             │  Webhook   │  Validates signature,
                             │  Handler   │  writes DynamoDB record
                             │  Lambda    │
                             └─────┬─────┘
                                   │  async invoke
                                   ▼
                             ┌───────────┐      ┌─────────┐
                             │  Review    │─────►│ Bedrock │
                             │  Agent     │◄─────│ (any    │
                             │  Lambda    │      │  model) │
                             └─────┬─────┘      └─────────┘
                                   │
                                   │  POST review comments
                                   ▼
                                GitHub API

  Data stores: DynamoDB (installations + reviews)
  Secrets:     SSM Parameter Store (GitHub App credentials)
  Auth:        IAM roles — no API keys needed
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown.

## Configuration — `.mergewatch.yml`

Drop a `.mergewatch.yml` in your repo root:

```yaml
version: 1

model: anthropic.claude-sonnet-4-20250514

agents:
  - name: security
    enabled: true
    prompt: "Flag OWASP Top 10 issues, hardcoded secrets, and unsafe deserialization."

  - name: logic
    enabled: true
    prompt: "Find logic bugs, off-by-one errors, and race conditions."

  - name: style
    enabled: true
    prompt: "Enforce project conventions. Be concise."

  - name: tests
    enabled: false
    prompt: "Suggest missing unit tests for new public functions."

rules:
  max_files: 50                  # skip reviews for massive PRs
  ignore_patterns:
    - "*.lock"
    - "vendor/**"
    - "dist/**"
  auto_review: true              # review on every PR open / push
  review_on_mention: true        # also review when someone says @mergewatch

comment_style: inline            # "inline" per-line comments or "summary" top-level
```

### Configuration Reference

| Key | Type | Default | Description |
|---|---|---|---|
| `version` | int | `1` | Config schema version |
| `model` | string | `anthropic.claude-sonnet-4-20250514` | Bedrock model ID |
| `agents[].name` | string | — | Agent identifier |
| `agents[].enabled` | bool | `true` | Toggle agent on/off |
| `agents[].prompt` | string | — | System prompt for the agent |
| `rules.max_files` | int | `50` | Skip review if PR exceeds this file count |
| `rules.ignore_patterns` | list | `[]` | Glob patterns to exclude from review |
| `rules.auto_review` | bool | `true` | Auto-review on PR open and push |
| `rules.review_on_mention` | bool | `true` | Review when `@mergewatch` is mentioned |
| `comment_style` | string | `inline` | `inline` or `summary` |

## Supported Bedrock Models

| Model | Bedrock Model ID | Notes |
|---|---|---|
| Claude Opus 4.6 | `anthropic.claude-opus-4-6` | Most capable — best for security & logic agents |
| Claude Sonnet 4.6 | `anthropic.claude-sonnet-4-6` | Balanced cost/quality — recommended default |
| Claude Haiku 4.5 | `anthropic.claude-haiku-4-5-20251001` | Fast & cheap — good for style checks |
| Llama 3.1 70B | `meta.llama3-1-70b-instruct-v1:0` | Open-weight alternative |
| Mistral Large | `mistral.mistral-large-2407-v1:0` | EU-friendly option |

> **BYOM**: Any model available in your Bedrock region works. Just set the model ID.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
