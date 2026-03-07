"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Sidenav from "./Sidenav";

export interface InstallationInfo {
  id: number;
  login: string;
  avatarUrl: string;
  type: "User" | "Organization";
}

interface DashboardShellProps {
  userName: string;
  userImage?: string | null;
  installations: InstallationInfo[];
  children: React.ReactNode;
}

export default function DashboardShell({
  userName,
  userImage,
  installations,
  children,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const orgParam = searchParams.get("org");
  const activeInstallationId = orgParam
    ? Number(orgParam)
    : installations[0]?.id ?? 0;

  const activeInstallation =
    installations.find((i) => i.id === activeInstallationId) ??
    installations[0];

  const handleSwitch = useCallback(
    (installationId: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("org", String(installationId));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex min-h-screen">
      <Sidenav
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onMobileOpen={() => setMobileNavOpen(true)}
        installations={installations}
        activeInstallation={activeInstallation}
        onSwitchInstallation={handleSwitch}
        userName={userName}
        userImage={userImage}
        orgParam={orgParam}
      />

      <div className="flex-1 md:ml-16 lg:ml-[240px]">
        <main>{children}</main>
      </div>
    </div>
  );
}
