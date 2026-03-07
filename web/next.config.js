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
  },
};

module.exports = nextConfig;
