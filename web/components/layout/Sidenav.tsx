"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  GitPullRequest,
  GitBranch,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

type NavEntry =
  | { type: "section"; label: string }
  | { type: "item"; label: string; href: string; icon: LucideIcon };

const navItems: NavEntry[] = [
  { type: "section", label: "MAIN" },
  { type: "item", label: "Home", href: "/dashboard", icon: Home },
  { type: "item", label: "Reviews", href: "/dashboard/reviews", icon: GitPullRequest },
  { type: "section", label: "CONFIGURE" },
  { type: "item", label: "Repositories", href: "/dashboard/repositories", icon: GitBranch },
  { type: "item", label: "Settings", href: "/dashboard/settings", icon: Settings },
  { type: "section", label: "ACCOUNT" },
  { type: "item", label: "Profile", href: "/dashboard/profile", icon: User },
];

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 400 400" fill="none">
      <line
        x1="155" y1="112" x2="155" y2="288"
        stroke="#00ff88" strokeWidth="22" strokeLinecap="round"
      />
      <path
        d="M 245 288 C 245 230, 245 195, 205 168 C 185 155, 165 142, 155 112"
        fill="none" stroke="#00ff88" strokeWidth="22"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M 178 136 L 158 114 L 182 110"
        fill="none" stroke="#00ff88" strokeWidth="22"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="155" cy="112" r="30" fill="#00ff88" />
      <circle cx="155" cy="288" r="22" fill="#00ff88" opacity="0.8" />
      <circle cx="245" cy="288" r="22" fill="#00ff88" opacity="0.8" />
    </svg>
  );
}

interface SidenavProps {
  orgName?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidenav({ orgName, mobileOpen, onMobileClose }: SidenavProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidenav */}
      <nav
        className={[
          "fixed top-0 left-0 h-screen z-40 bg-[#0f0f0f] border-r border-[#1e1e1e]",
          "transition-transform duration-200 ease-in-out",
          // Desktop: full width
          "lg:translate-x-0 lg:w-[240px]",
          // Tablet: icon-only
          "md:translate-x-0 md:w-16",
          // Mobile: slide in/out
          mobileOpen ? "translate-x-0 w-[240px]" : "-translate-x-full w-[240px] md:translate-x-0",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#1e1e1e] px-2 py-5 lg:px-4 justify-center lg:justify-start">
          <LogoMark />
          <div className="hidden lg:block">
            <div className="text-sm font-semibold leading-tight text-white">MergeWatch</div>
            <div className="text-xs leading-tight text-[#444]">{orgName ?? "GitHub"}</div>
          </div>
          {/* Show text in mobile drawer too */}
          {mobileOpen && (
            <div className="block lg:hidden">
              <div className="text-sm font-semibold leading-tight text-white">MergeWatch</div>
              <div className="text-xs leading-tight text-[#444]">{orgName ?? "GitHub"}</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div className="mt-2 flex flex-col">
          {navItems.map((entry, i) => {
            if (entry.type === "section") {
              return (
                <div
                  key={i}
                  className="hidden lg:block px-5 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#333]"
                >
                  {entry.label}
                  {/* Show section labels in mobile drawer */}
                </div>
              );
            }

            const { label, href, icon: Icon } = entry;
            const active = isActive(href);

            return (
              <div key={href} className="relative group">
                <Link
                  href={href}
                  onClick={onMobileClose}
                  className={[
                    "flex items-center gap-3 rounded-md text-sm transition-colors duration-150",
                    "px-3 py-2 mx-1 lg:mx-2",
                    "justify-center lg:justify-start",
                    active
                      ? "bg-[rgba(0,255,136,0.08)] text-white"
                      : "text-[#888] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#bbb]",
                  ].join(" ")}
                >
                  <Icon
                    size={15}
                    className={active ? "text-[#00ff88]" : "text-[#555]"}
                  />
                  {/* Label: visible on desktop always, hidden on tablet, visible in mobile drawer */}
                  <span className="hidden lg:inline">{label}</span>
                  {mobileOpen && <span className="inline lg:hidden">{label}</span>}
                </Link>

                {/* Tooltip for tablet icon-only mode */}
                <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-[#1e1e1e] px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 hidden md:block lg:hidden">
                  {label}
                </div>
              </div>
            );
          })}

          {/* Mobile drawer: show section labels inline */}
          {mobileOpen && (
            <style>{`
              @media (max-width: 1023px) {
                nav .hidden.lg\\:block { display: block !important; }
              }
            `}</style>
          )}
        </div>
      </nav>
    </>
  );
}
