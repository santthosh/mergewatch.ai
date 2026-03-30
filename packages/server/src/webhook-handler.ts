import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import type { IInstallationStore, IReviewStore, IGitHubAuthProvider, ILLMProvider } from '@mergewatch/core';
import type { ReviewJobPayload, ReviewMode, PullRequestEvent, IssueCommentEvent, InstallationEvent } from '@mergewatch/core';
import { processReviewJob } from './review-processor.js';

export interface WebhookDeps {
  webhookSecret: string;
  installationStore: IInstallationStore;
  reviewStore: IReviewStore;
  authProvider: IGitHubAuthProvider;
  llm: ILLMProvider;
  dashboardBaseUrl: string;
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function parseReviewMode(body: string): { mode: ReviewMode; userComment?: string } {
  const lower = body.toLowerCase().trim();
  if (lower.includes('@mergewatch review')) return { mode: 'review' };
  if (lower.includes('@mergewatch summary')) return { mode: 'summary' };
  if (lower.includes('@mergewatch')) return { mode: 'respond', userComment: body };
  return { mode: 'review' };
}

export function createWebhookHandler(deps: WebhookDeps) {
  return async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const rawBody = (req as any).rawBody as string;

    if (!signature || !rawBody || !verifySignature(rawBody, signature, deps.webhookSecret)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body;

    // Acknowledge immediately
    res.status(200).json({ ok: true });

    try {
      if (event === 'pull_request') {
        await handlePullRequest(payload as PullRequestEvent, deps);
      } else if (event === 'issue_comment') {
        await handleIssueComment(payload as IssueCommentEvent, deps);
      } else if (event === 'installation') {
        await handleInstallation(payload as InstallationEvent, deps);
      }
    } catch (err) {
      console.error(`Error processing ${event} webhook:`, err);
    }
  };
}

async function handlePullRequest(payload: PullRequestEvent, deps: WebhookDeps) {
  const { action, pull_request, repository, installation } = payload;
  if (!installation || (action !== 'opened' && action !== 'synchronize' && action !== 'ready_for_review')) return;

  const job: ReviewJobPayload = {
    installationId: installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    prNumber: pull_request.number,
    mode: 'review',
    isDraft: pull_request.draft ?? false,
    prLabels: pull_request.labels?.map((l) => l.name) ?? [],
    changedFileCount: pull_request.changed_files,
  };

  // Process in background
  processReviewJob(job, deps).catch((err) => {
    console.error(`Review job failed for ${repository.full_name}#${pull_request.number}:`, err);
  });
}

async function handleIssueComment(payload: IssueCommentEvent, deps: WebhookDeps) {
  const { action, comment, issue, repository, installation } = payload;
  if (action !== 'created' || !installation || !issue.pull_request) return;

  const { mode, userComment } = parseReviewMode(comment.body);

  const job: ReviewJobPayload = {
    installationId: installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    prNumber: issue.number,
    mode,
    ...(userComment ? { userComment, userCommentAuthor: comment.user.login } : {}),
  };

  processReviewJob(job, deps).catch((err) => {
    console.error(`Review job failed for ${repository.full_name}#${issue.number}:`, err);
  });
}

async function handleInstallation(payload: InstallationEvent, deps: WebhookDeps) {
  const { action, installation, repositories } = payload;
  if (action !== 'created' || !repositories) return;

  for (const repo of repositories) {
    await deps.installationStore.upsert({
      installationId: String(installation.id),
      repoFullName: repo.full_name as string,
      installedAt: new Date().toISOString(),
      config: {},
    });
  }
}
