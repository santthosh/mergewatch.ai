'use client';

import { usePathname } from 'next/navigation';
import { GoogleAnalytics } from '@next/third-parties/google';

/**
 * Renders Google Analytics only on public marketing pages of the SaaS
 * deployment. Returns null when:
 *   - Running in self-hosted mode (DEPLOYMENT_MODE !== 'saas') — operators
 *     in their own infra shouldn't be phoning home to Google by default.
 *   - NEXT_PUBLIC_GA_MEASUREMENT_ID is not set — opt-in via env var.
 *   - The current path is under /dashboard — authenticated views are
 *     private and short-lived; we already see that traffic in our own
 *     storage layer and don't want to ship session data to GA.
 *
 * Both env vars must be present in next.config.js's `env` block so they
 * survive Amplify's SSR build.
 */
export default function MaybeAnalytics() {
  const pathname = usePathname();
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const isSaas = process.env.DEPLOYMENT_MODE === 'saas';
  const isAuthedRoute = pathname?.startsWith('/dashboard') ?? false;

  if (!isSaas) return null;
  if (!measurementId) return null;
  if (isAuthedRoute) return null;

  return <GoogleAnalytics gaId={measurementId} />;
}
