"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { Menu } from "lucide-react";

interface HeaderProps {
  userName: string;
  userImage?: string | null;
  onMenuToggle?: () => void;
}

export default function Header({ userName, userImage, onMenuToggle }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Hamburger — mobile only */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="p-2 text-[#555] transition-colors hover:text-white md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}

        <div className="flex-1" />

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 py-1 pl-1 pr-3 text-sm font-medium text-white transition hover:border-zinc-500"
          >
            {userImage ? (
              <img
                src={userImage}
                alt={userName}
                className="h-7 w-7 rounded-full"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primer-blue text-xs font-bold text-black">
                {initials}
              </span>
            )}
            <span className="hidden sm:inline">{userName}</span>
            <svg
              className={`h-4 w-4 text-primer-muted transition ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
              <div className="border-b border-zinc-700 px-4 py-3">
                <p className="text-sm font-medium text-white">{userName}</p>
                <p className="text-xs text-primer-muted">GitHub</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-primer-muted transition hover:bg-zinc-800 hover:text-red-400"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1"
                  />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
