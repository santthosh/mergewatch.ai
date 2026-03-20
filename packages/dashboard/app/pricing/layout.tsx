import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MergeWatch Pricing — Pay per PR, not per developer",
  description:
    "No per-seat fees. First 20 PRs/month free. Self-host for free or use the managed SaaS at $0.35/PR.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
