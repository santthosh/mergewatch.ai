const path = require('path');

/**
 * Security headers applied to every response. HSTS and the nosniff/frame/
 * referrer policies are safe universal defaults; CSP is intentionally left
 * out for now because the app uses inline JSON-LD and NextAuth redirects
 * that would require report-only rollout first.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

// Public marketing pages — safe to cache aggressively at the CDN edge.
const publicCacheControl = {
  key: 'Cache-Control',
  value: 'public, s-maxage=300, stale-while-revalidate=86400',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' output bundles the server into a self-contained directory.
  // Required for AWS Amplify SSR hosting — Amplify deploys the .next/standalone
  // output as Lambda@Edge functions.
  output: 'standalone',

  // Strip the X-Powered-By: Next.js fingerprint header.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Apply the security headers to every route.
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/',
        headers: [publicCacheControl],
      },
      {
        source: '/pricing',
        headers: [publicCacheControl],
      },
      {
        source: '/about',
        headers: [publicCacheControl],
      },
      {
        source: '/privacy',
        headers: [publicCacheControl],
      },
      {
        source: '/terms',
        headers: [publicCacheControl],
      },
    ];
  },

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
    BILLING_API_URL: process.env.BILLING_API_URL,
    BILLING_API_SECRET: process.env.BILLING_API_SECRET,
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
