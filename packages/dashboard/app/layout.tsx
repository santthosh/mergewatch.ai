import type { Metadata } from "next";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MergeWatch.ai — AI-Powered PR Reviews",
  description:
    "Bring your own model. Run in your cloud. AI code reviews that respect your infrastructure.",
  icons: {
    icon: "/icon.svg",
  },
};

/**
 * Root layout — wraps every page with a consistent shell.
 * Uses the system sans-serif stack for a clean, fast-loading UI.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
