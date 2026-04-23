/**
 * Shared dependency shape for the MCP server.
 *
 * Transport entry points (Lambda, Express) build one of these and pass it to
 * createMcpServer + to each tool handler. Kept in its own module so tool
 * handlers can import it without creating an import cycle through server.ts.
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type Stripe from 'stripe';
import type {
  IApiKeyStore,
  IGitHubAuthProvider,
  IInstallationStore,
  ILLMProvider,
  IMcpSessionStore,
  IReviewStore,
} from '@mergewatch/core';
import type { BillingCheckFn, RecordReviewFn } from './middleware/billing.js';

export interface McpServerDeps {
  llm: ILLMProvider;
  authProvider: IGitHubAuthProvider;
  installationStore: IInstallationStore;
  reviewStore: IReviewStore;
  apiKeyStore: IApiKeyStore;
  sessionStore: IMcpSessionStore;
  billing: {
    check: BillingCheckFn;
    record: RecordReviewFn;
  };
  ddbClient: DynamoDBDocumentClient;
  installationsTable: string;
  stripe?: Stripe;
}
