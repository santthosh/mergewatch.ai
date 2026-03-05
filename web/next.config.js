/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' output bundles the server into a self-contained directory.
  // Required for AWS Amplify SSR hosting — Amplify deploys the .next/standalone
  // output as Lambda@Edge functions.
  output: 'standalone',
};

module.exports = nextConfig;
