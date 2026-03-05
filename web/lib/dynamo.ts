import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Shared DynamoDB Document Client.
 *
 * Uses the default AWS credential chain (env vars, instance profile, SSO, etc.)
 * so it works locally with `aws configure` and in production with IAM roles.
 */
const raw = new DynamoDBClient({ region: process.env.APP_REGION ?? process.env.AWS_REGION ?? "us-east-1" });

export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
});
