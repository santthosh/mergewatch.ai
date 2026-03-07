import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/lib/auth";
import { ddb } from "@/lib/dynamo";
import ReviewDetail from "@/components/ReviewDetail";

interface ReviewDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Review detail page.
 *
 * The [id] param is a URL-safe encoded string: `owner/repo:prNumber#commitSha`
 * encoded with encodeURIComponent.
 */
export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  const { id } = await params;
  const decoded = decodeURIComponent(id);

  // Parse "owner/repo:prNumber#commitSha"
  const colonIdx = decoded.lastIndexOf(":");
  if (colonIdx === -1) notFound();

  const repoFullName = decoded.slice(0, colonIdx);
  const prNumberCommitSha = decoded.slice(colonIdx + 1);

  if (!repoFullName || !prNumberCommitSha) notFound();

  const reviewsTable = process.env.DYNAMODB_TABLE_REVIEWS;
  if (!reviewsTable) notFound();

  const result = await ddb.send(
    new GetCommand({
      TableName: reviewsTable,
      Key: { repoFullName, prNumberCommitSha },
    }),
  );

  if (!result.Item) notFound();

  const item = result.Item;
  const prNumber = Number(String(prNumberCommitSha).split("#")[0]);
  const commitSha = String(prNumberCommitSha).split("#")[1] ?? "";

  return (
    <ReviewDetail
      review={{
        repoFullName: item.repoFullName as string,
        prNumber,
        prNumberCommitSha: item.prNumberCommitSha as string,
        commitSha,
        prTitle: (item.prTitle as string) ?? "",
        status: (item.status === "complete" ? "completed" : (item.status as string)) as any,
        model: (item.model as string) ?? "",
        createdAt: (item.createdAt as string) ?? "",
        completedAt: (item.completedAt as string) ?? undefined,
        commentId: item.commentId as number | undefined,
        settingsUsed: item.settingsUsed as any,
      }}
    />
  );
}
