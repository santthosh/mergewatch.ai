export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MergeWatch Pricing — Pay for what you review",
  description:
    "No per-seat fees. First 5 reviews free. Self-host for free or use the managed SaaS with prepaid credits based on actual LLM cost.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.DEPLOYMENT_MODE !== "saas") {
    redirect("/signin");
  }

  return <>{children}</>;
}
