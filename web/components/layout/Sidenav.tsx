"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  GitPullRequest,
  GitBranch,
  Settings,
  ChevronDown,
  LogOut,
  Menu,
  type LucideIcon,
} from "lucide-react";
import type { InstallationInfo } from "./DashboardShell";

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
];

interface SidenavProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  onMobileOpen: () => void;
  installations?: InstallationInfo[];
  activeInstallation?: InstallationInfo;
  onSwitchInstallation?: (installationId: number) => void;
  userName: string;
  userImage?: string | null;
}

export default function Sidenav({
  mobileOpen,
  onMobileClose,
  onMobileOpen,
  installations,
  activeInstallation,
  onSwitchInstallation,
  userName,
  userImage,
}: SidenavProps) {
  const pathname = usePathname();
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOrgDropdownOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const showOrgSwitcher =
    installations && installations.length > 0 && activeInstallation;

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Mobile top bar — hamburger only */}
      <div className="fixed top-0 left-0 right-0 z-20 flex h-14 items-center border-b border-[#1e1e1e] bg-[#0f0f0f] px-4 md:hidden">
        <button
          onClick={onMobileOpen}
          className="p-2 text-[#555] transition-colors hover:text-white"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <Link href="/dashboard" className="ml-2 text-lg font-bold tracking-tight">
          MergeWatch<span className="text-primer-green">.ai</span>
        </Link>
      </div>
      {/* Spacer for mobile top bar */}
      <div className="h-14 md:hidden" />

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
          "flex flex-col",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0 lg:w-[240px]",
          "md:translate-x-0 md:w-16",
          mobileOpen ? "translate-x-0 w-[240px]" : "-translate-x-full w-[240px] md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-[#1e1e1e] px-4 justify-center lg:justify-start">
          <Link href="/dashboard" className="hidden lg:block text-lg font-bold tracking-tight">
            MergeWatch<span className="text-primer-green">.ai</span>
          </Link>
          <Link href="/dashboard" className="hidden md:block lg:hidden text-lg font-bold tracking-tight text-primer-green">
            M
          </Link>
          {mobileOpen && (
            <Link href="/dashboard" className="block md:hidden text-lg font-bold tracking-tight" onClick={onMobileClose}>
              MergeWatch<span className="text-primer-green">.ai</span>
            </Link>
          )}
        </div>

        {/* Org switcher */}
        {showOrgSwitcher && (
          <div className="border-b border-[#1e1e1e] px-2 py-2" ref={dropdownRef}>
            {/* Desktop / mobile drawer: full switcher */}
            <div className={mobileOpen ? "block" : "hidden lg:block"}>
              <button
                onClick={() => setOrgDropdownOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white transition hover:bg-[rgba(255,255,255,0.04)]"
              >
                <img
                  src={activeInstallation.avatarUrl}
                  alt={activeInstallation.login}
                  className="h-5 w-5 rounded-full"
                />
                <span className="flex-1 truncate text-left text-xs font-medium">
                  {activeInstallation.login}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-[#555] transition ${orgDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {orgDropdownOpen && (
                <div className="mt-1 rounded-md border border-[#1e1e1e] bg-[#161616] py-1">
                  {installations.map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => {
                        onSwitchInstallation?.(inst.id);
                        setOrgDropdownOpen(false);
                        onMobileClose();
                      }}
                      className={[
                        "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition",
                        inst.id === activeInstallation.id
                          ? "bg-[rgba(0,255,136,0.08)] text-white"
                          : "text-[#888] hover:bg-[rgba(255,255,255,0.04)] hover:text-white",
                      ].join(" ")}
                    >
                      <img
                        src={inst.avatarUrl}
                        alt={inst.login}
                        className="h-4 w-4 rounded-full"
                      />
                      <span className="truncate">{inst.login}</span>
                      <span className="ml-auto text-[10px] text-[#555]">
                        {inst.type === "Organization" ? "Org" : "Personal"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tablet: avatar only with tooltip */}
            <div className={`hidden md:flex lg:hidden justify-center ${mobileOpen ? "!hidden" : ""}`}>
              <div className="group relative">
                <button
                  onClick={() => setOrgDropdownOpen((v) => !v)}
                  className="rounded-md p-1 transition hover:bg-[rgba(255,255,255,0.04)]"
                >
                  <img
                    src={activeInstallation.avatarUrl}
                    alt={activeInstallation.login}
                    className="h-6 w-6 rounded-full"
                  />
                </button>
                <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-[#1e1e1e] px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {activeInstallation.login}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav items */}
        <div className="mt-2 flex flex-1 flex-col">
          {navItems.map((entry, i) => {
            if (entry.type === "section") {
              return (
                <div
                  key={i}
                  className="hidden lg:block px-5 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#333]"
                >
                  {entry.label}
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
                  <span className="hidden lg:inline">{label}</span>
                  {mobileOpen && <span className="inline lg:hidden">{label}</span>}
                </Link>

                <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-[#1e1e1e] px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 hidden md:block lg:hidden">
                  {label}
                </div>
              </div>
            );
          })}

          {mobileOpen && (
            <style>{`
              @media (max-width: 1023px) {
                nav .hidden.lg\\:block { display: block !important; }
              }
            `}</style>
          )}
        </div>

        {/* User menu — bottom of sidenav */}
        <div className="border-t border-[#1e1e1e] px-2 py-2 relative" ref={userMenuRef}>
          {/* Desktop / mobile drawer: full user button */}
          <div className={mobileOpen ? "block" : "hidden lg:block"}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white transition hover:bg-[rgba(255,255,255,0.04)]"
            >
              {userImage ? (
                <img src={userImage} alt={userName} className="h-6 w-6 rounded-full" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primer-blue text-[10px] font-bold text-black">
                  {initials}
                </span>
              )}
              <span className="flex-1 truncate text-left text-xs font-medium">{userName}</span>
              <ChevronDown
                size={14}
                className={`text-[#555] transition ${userMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-2 right-2 mb-1 rounded-md border border-[#1e1e1e] bg-[#161616] py-1 shadow-2xl">
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#888] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-red-400"
                >
                  <LogOut size={13} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>

          {/* Tablet: avatar only with tooltip */}
          <div className={`hidden md:flex lg:hidden justify-center ${mobileOpen ? "!hidden" : ""}`}>
            <div className="group relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="rounded-md p-1 transition hover:bg-[rgba(255,255,255,0.04)]"
              >
                {userImage ? (
                  <img src={userImage} alt={userName} className="h-6 w-6 rounded-full" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primer-blue text-[10px] font-bold text-black">
                    {initials}
                  </span>
                )}
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-full ml-2 mb-1 rounded-md border border-[#1e1e1e] bg-[#161616] py-1 shadow-2xl whitespace-nowrap">
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#888] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-red-400"
                  >
                    <LogOut size={13} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
              <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-[#1e1e1e] px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                {userName}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
