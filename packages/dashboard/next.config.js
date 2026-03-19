const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' output bundles the server into a self-contained directory.
  // Required for AWS Amplify SSR hosting — Amplify deploys the .next/standalone
  // output as Lambda@Edge functions.
  output: 'standalone',

  // Expose env vars to the server runtime (Amplify SSR only gets build-time
  // env vars by default — this ensures they're bundled into the runtime).
  env: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    DYNAMODB_TABLE_INSTALLATIONS: process.env.DYNAMODB_TABLE_INSTALLATIONS,
    DYNAMODB_TABLE_REVIEWS: process.env.DYNAMODB_TABLE_REVIEWS,
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
    DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
    DATABASE_URL: process.env.DATABASE_URL,
  },

  // Prevent Next.js from bundling native modules used by storage packages.
  // These are loaded at runtime via dynamic import() in lib/store.ts.
  experimental: {
    // Trace files from the monorepo root so pnpm-hoisted node_modules are
    // correctly resolved in the standalone output.
    outputFileTracingRoot: path.join(__dirname, '../../'),
    serverComponentsExternalPackages: [
      '@aws-sdk/client-dynamodb',
      '@aws-sdk/lib-dynamodb',
      'postgres',
    ],
    // Cache visited dynamic pages on the client for 60s so fast tab-switching
    // serves stale content instantly (revalidates in background on next nav).
    staleTimes: {
      dynamic: 60,
    },
  },
};

module.exports = nextConfig;
