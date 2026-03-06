import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  return (
    <DashboardShell
      userName={session.user?.name ?? session.user?.email ?? ""}
      userImage={session.user?.image}
    >
      {children}
    </DashboardShell>
  );
}
