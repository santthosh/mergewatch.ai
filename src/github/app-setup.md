# GitHub App Setup Guide for MergeWatch

This guide walks you through registering, configuring, and installing the
MergeWatch GitHub App so it can receive webhooks and post review comments on
pull requests.

---

## 1. Register a new GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
   (or visit `https://github.com/settings/apps/new`).
2. Fill in the basics:
   - **App name:** `MergeWatch` (or a name of your choice)
   - **Homepage URL:** Your project URL (e.g. `https://mergewatch.ai`)
   - **Webhook URL:** The HTTPS endpoint of your deployed webhook Lambda
     (e.g. `https://api.mergewatch.ai/webhook`)
   - **Webhook secret:** A strong random string. Store this in AWS SSM at
     `/mergewatch/github/webhook-secret`.

---

## 2. Permissions

Under **Permissions & events**, request the following:

### Repository permissions

| Permission        | Access       | Why                                           |
| ----------------- | ------------ | --------------------------------------------- |
| **Pull requests** | Read & Write | Read PR diffs/metadata, post review comments  |
| **Issues**        | Read & Write | Read issue comments, post replies             |
| **Contents**      | Read-only    | (Optional) Read file contents for deeper review |
| **Metadata**      | Read-only    | Required by GitHub for all Apps                |

### Organization permissions

None required for basic operation.

### Account permissions

None required.

---

## 3. Subscribe to webhook events

Check the following events:

- **Pull request** — fires on `opened`, `synchronize`, `closed`, etc.
- **Issue comment** — fires when a comment is created on an issue or PR.
- **Installation** — fires when the App is installed or uninstalled.

---

## 4. Create the App

1. Set **Where can this GitHub App be installed?** to:
   - **Any account** for a public App, or
   - **Only on this account** for private/internal use.
2. Click **Create GitHub App**.

---

## 5. Generate a private key

1. After creation, scroll to the bottom of the App settings page.
2. Click **Generate a private key**. A `.pem` file will download.
3. Store the contents of this file in AWS SSM at
   `/mergewatch/github/private-key` (SecureString).

---

## 6. Note the App ID

The **App ID** is shown at the top of the App's settings page (a numeric ID
like `12345`). Store it in AWS SSM at `/mergewatch/github/app-id`.

---

## 7. Install the App on a repository

1. Go to the App's public page:
   `https://github.com/apps/<your-app-name>`
2. Click **Install** and select the organization or user account.
3. Choose **All repositories** or select specific repositories.
4. Click **Install**.

After installation, GitHub will send an `installation` event to your webhook
URL. MergeWatch stores this in DynamoDB for future lookups.

---

## 8. SSM Parameter summary

| SSM Parameter Path                    | Type         | Value                      |
| ------------------------------------- | ------------ | -------------------------- |
| `/mergewatch/github/app-id`           | String       | Numeric App ID             |
| `/mergewatch/github/private-key`      | SecureString | Contents of the `.pem` file |
| `/mergewatch/github/webhook-secret`   | SecureString | Webhook secret string      |

---

## 9. Environment variables (Lambda)

The webhook handler Lambda expects these environment variables:

| Variable                       | Default                              | Description                        |
| ------------------------------ | ------------------------------------ | ---------------------------------- |
| `SSM_WEBHOOK_SECRET`           | `/mergewatch/github/webhook-secret`  | SSM path for webhook secret        |
| `SSM_APP_ID`                   | `/mergewatch/github/app-id`          | SSM path for App ID                |
| `SSM_PRIVATE_KEY`              | `/mergewatch/github/private-key`     | SSM path for private key           |
| `REVIEW_AGENT_FUNCTION_NAME`   | `mergewatch-review-agent`            | Name of the ReviewAgent Lambda     |
| `INSTALLATIONS_TABLE`          | `mergewatch-installations`           | DynamoDB table for installations   |

---

## 10. Testing locally

You can use [smee.io](https://smee.io) to forward GitHub webhooks to your
local machine during development:

```bash
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:3000/webhook
```
