import { readFileSync } from 'fs';
import express from 'express';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as drizzleSql } from 'drizzle-orm';
import { PostgresInstallationStore, PostgresReviewStore } from '@mergewatch/storage-postgres';
import { EnvGitHubAuthProvider } from './github-auth-env.js';
import { createLLMProvider } from './llm-factory.js';
import { createWebhookHandler } from './webhook-handler.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Resolve the GitHub App private key from either:
 *   - GITHUB_PRIVATE_KEY (inline PEM, newlines escaped as \n)
 *   - GITHUB_PRIVATE_KEY_FILE (path to .pem file)
 */
function resolvePrivateKey(): string {
  const inline = process.env.GITHUB_PRIVATE_KEY;
  const filePath = process.env.GITHUB_PRIVATE_KEY_FILE;

  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }
  if (filePath) {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err: any) {
      throw new Error(`Failed to read GITHUB_PRIVATE_KEY_FILE at "${filePath}": ${err.message}`);
    }
  }
  throw new Error('Either GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_FILE must be set');
}

async function main() {
  // Required env vars
  const databaseUrl = requireEnv('DATABASE_URL');
  const githubAppId = requireEnv('GITHUB_APP_ID');
  const githubPrivateKey = resolvePrivateKey();
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

  // Health check with DB connectivity
  app.get('/health', async (_req, res) => {
    let dbStatus = 'disconnected';
    try {
      await db.execute(drizzleSql`SELECT 1`);
      dbStatus = 'connected';
    } catch {
      // DB unreachable
    }

    const status = dbStatus === 'connected' ? 'ok' : 'degraded';
    const statusCode = dbStatus === 'connected' ? 200 : 503;

    res.status(statusCode).json({
      status,
      version: '0.2.0',
      db: dbStatus,
      llmProvider: process.env.LLM_PROVIDER || 'anthropic',
    });
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
