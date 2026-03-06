import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";
import SignInButton from "./SignInButton";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <Link href="/" className="text-lg font-bold tracking-tight">
          MergeWatch<span className="text-primer-green">.ai</span>
        </Link>
      </nav>

      {/* Sign-in card */}
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <Image
              src="/logo.png"
              alt="MergeWatch.ai"
              width={80}
              height={80}
              className="rounded-2xl"
            />
          </div>

          <h1 className="text-center text-2xl font-bold tracking-tight">
            Sign in to MergeWatch<span className="text-primer-green">.ai</span>
          </h1>
          <p className="mt-2 text-center text-sm text-primer-muted">
            AI-powered PR reviews — your models, your cloud.
          </p>

          {/* Card */}
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <SignInButton />

            <p className="mt-6 text-center text-xs leading-relaxed text-primer-muted">
              We&apos;ll use your GitHub account to access repositories
              you&apos;ve installed the MergeWatch app on. No code is stored.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-primer-muted">
            <Link href="/" className="transition hover:text-white">
              &larr; Back to home
            </Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-6 text-center text-xs text-primer-muted">
        &copy; {new Date().getFullYear()} mergewatch.ai &mdash; open source
        under MIT
      </footer>
    </div>
  );
}
