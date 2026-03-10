import { eq, and, like, desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { IReviewStore, ReviewItem, ReviewStatus } from '@mergewatch/core';
import { reviews } from './schema.js';

export class PostgresReviewStore implements IReviewStore {
  constructor(private db: PostgresJsDatabase) {}

  async upsert(review: ReviewItem): Promise<void> {
    await this.db
      .insert(reviews)
      .values({
        repoFullName: review.repoFullName,
        prNumberCommitSha: review.prNumberCommitSha,
        status: review.status,
        createdAt: review.createdAt,
        completedAt: review.completedAt ?? null,
        prTitle: review.prTitle ?? null,
        prAuthor: review.prAuthor ?? null,
        prAuthorAvatar: review.prAuthorAvatar ?? null,
        headBranch: review.headBranch ?? null,
        baseBranch: review.baseBranch ?? null,
        commentId: review.commentId ?? null,
        model: review.model ?? null,
        durationMs: review.durationMs ?? null,
        findingCount: review.findingCount ?? null,
        topSeverity: review.topSeverity ?? null,
        summaryText: review.summaryText ?? null,
        diagramText: review.diagramText ?? null,
        skipReason: review.skipReason ?? null,
        mergeScore: review.mergeScore ?? null,
        mergeScoreReason: review.mergeScoreReason ?? null,
        findings: (review.findings as any) ?? [],
        feedback: review.feedback ?? null,
        reactions: (review.reactions as any) ?? {},
        installationId: review.installationId ?? null,
        settingsUsed: (review.settingsUsed as any) ?? null,
      })
      .onConflictDoUpdate({
        target: [reviews.repoFullName, reviews.prNumberCommitSha],
        set: {
          status: review.status,
          completedAt: review.completedAt ?? null,
          prTitle: review.prTitle ?? null,
          prAuthor: review.prAuthor ?? null,
          prAuthorAvatar: review.prAuthorAvatar ?? null,
          headBranch: review.headBranch ?? null,
          baseBranch: review.baseBranch ?? null,
          commentId: review.commentId ?? null,
          model: review.model ?? null,
          durationMs: review.durationMs ?? null,
          findingCount: review.findingCount ?? null,
          topSeverity: review.topSeverity ?? null,
          summaryText: review.summaryText ?? null,
          diagramText: review.diagramText ?? null,
          skipReason: review.skipReason ?? null,
          mergeScore: review.mergeScore ?? null,
          mergeScoreReason: review.mergeScoreReason ?? null,
          findings: (review.findings as any) ?? [],
          feedback: review.feedback ?? null,
          reactions: (review.reactions as any) ?? {},
          installationId: review.installationId ?? null,
          settingsUsed: (review.settingsUsed as any) ?? null,
        },
      });
  }

  async updateStatus(
    repoFullName: string,
    prNumberCommitSha: string,
    status: ReviewStatus,
    extra?: Partial<ReviewItem>,
  ): Promise<void> {
    const set: Record<string, any> = { status };
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (k !== 'repoFullName' && k !== 'prNumberCommitSha' && v !== undefined) {
          set[k] = v;
        }
      }
    }
    await this.db
      .update(reviews)
      .set(set)
      .where(and(
        eq(reviews.repoFullName, repoFullName),
        eq(reviews.prNumberCommitSha, prNumberCommitSha),
      ));
  }

  async queryByPR(repoFullName: string, prPrefix: string, limit = 5): Promise<ReviewItem[]> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(and(
        eq(reviews.repoFullName, repoFullName),
        like(reviews.prNumberCommitSha, `${prPrefix}%`),
      ))
      .orderBy(desc(reviews.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      repoFullName: row.repoFullName,
      prNumberCommitSha: row.prNumberCommitSha,
      status: row.status as ReviewStatus,
      createdAt: row.createdAt,
      ...(row.completedAt ? { completedAt: row.completedAt } : {}),
      ...(row.prTitle ? { prTitle: row.prTitle } : {}),
      ...(row.prAuthor ? { prAuthor: row.prAuthor } : {}),
      ...(row.prAuthorAvatar ? { prAuthorAvatar: row.prAuthorAvatar } : {}),
      ...(row.headBranch ? { headBranch: row.headBranch } : {}),
      ...(row.baseBranch ? { baseBranch: row.baseBranch } : {}),
      ...(row.commentId ? { commentId: row.commentId } : {}),
      ...(row.model ? { model: row.model } : {}),
      ...(row.durationMs ? { durationMs: row.durationMs } : {}),
      ...(row.findingCount != null ? { findingCount: row.findingCount } : {}),
      ...(row.topSeverity ? { topSeverity: row.topSeverity as any } : {}),
      ...(row.summaryText ? { summaryText: row.summaryText } : {}),
      ...(row.diagramText ? { diagramText: row.diagramText } : {}),
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
      ...(row.mergeScore != null ? { mergeScore: row.mergeScore } : {}),
      ...(row.mergeScoreReason ? { mergeScoreReason: row.mergeScoreReason } : {}),
      ...(row.findings ? { findings: row.findings as any } : {}),
      ...(row.feedback ? { feedback: row.feedback as any } : {}),
      ...(row.reactions ? { reactions: row.reactions as any } : {}),
      ...(row.installationId ? { installationId: row.installationId } : {}),
      ...(row.settingsUsed ? { settingsUsed: row.settingsUsed as any } : {}),
    }));
  }
}
