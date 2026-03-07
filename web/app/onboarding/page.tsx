import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchUserInstallations, TokenExpiredError } from "@/lib/github-repos";
import Header from "@/components/Header";
import Onboarding from "@/components/Onboarding";

/**
 * Onboarding page — guided setup for new users.
 *
 * If the user already has installations, redirects to /dashboard.
 */
export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const accessToken = (session as any).accessToken as string | undefined;

  if (accessToken) {
    try {
      const installations = await fetchUserInstallations(accessToken);
      if (installations.length > 0) {
        redirect("/dashboard");
      }
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        redirect("/api/auth/signout");
      }
      throw err;
    }
  }

  return (
    <div>
      <Header
        userName={session.user?.name ?? session.user?.email ?? ""}
        userImage={session.user?.image}
      />
      <Onboarding />
    </div>
  );
}
