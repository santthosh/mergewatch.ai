"use client";

import { useState } from "react";
import Sidenav from "./Sidenav";
import Header from "../Header";

interface DashboardShellProps {
  userName: string;
  userImage?: string | null;
  children: React.ReactNode;
}

export default function DashboardShell({
  userName,
  userImage,
  children,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidenav
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 md:ml-16 lg:ml-[240px]">
        <Header
          userName={userName}
          userImage={userImage}
          onMenuToggle={() => setMobileNavOpen(true)}
        />
        <main>{children}</main>
      </div>
    </div>
  );
}
