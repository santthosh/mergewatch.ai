import express from 'express';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresInstallationStore, PostgresReviewStore } from '@mergewatch/storage-postgres';
import { EnvGitHubAuthProvider } from './github-auth-env.js';
import { createLLMProvider } from './llm-factory.js';
import { createWebhookHandler } from './webhook-handler.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  // Required env vars
  const databaseUrl = requireEnv('DATABASE_URL');
  const githubAppId = requireEnv('GITHUB_APP_ID');
  const githubPrivateKey = requireEnv('GITHUB_PRIVATE_KEY');
  const webhookSecret = requireEnv('GITHUB_WEBHOOK_SECRET');
  const port = parseInt(process.env.PORT || '3000', 10);
  const dashboardBaseUrl = process.env.DASHBOARD_BASE_URL || '';

  // Initialize database
  const sql = postgres(databaseUrl);
  const db = drizzle(sql);

  // Initialize providers
  const installationStore = new PostgresInstallationStore(db);
  const reviewStore = new PostgresReviewStore(db);
  const authProvider = new EnvGitHubAuthProvider(githubAppId, githubPrivateKey);
  const llm = createLLMProvider();

  // Express app
  const app = express();

  // Parse JSON but keep raw body for signature verification
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // Webhook endpoint
  app.post('/webhook', createWebhookHandler({
    webhookSecret,
    installationStore,
    reviewStore,
    authProvider,
    llm,
    dashboardBaseUrl,
  }));

  app.listen(port, () => {
    console.log(`MergeWatch server listening on port ${port}`);
    console.log(`LLM provider: ${process.env.LLM_PROVIDER || 'anthropic'}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
