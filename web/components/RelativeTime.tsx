"use client";

import { useState, useEffect } from "react";

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;
const YEAR = 31536000;

function relativeString(date: Date): string {
  const now = Date.now();
  const seconds = Math.round((now - date.getTime()) / 1000);

  if (seconds < 5) return "just now";
  if (seconds < MINUTE) return `${seconds}s ago`;
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  if (seconds < WEEK) return `${Math.floor(seconds / DAY)}d ago`;
  if (seconds < MONTH) return `${Math.floor(seconds / WEEK)}w ago`;
  if (seconds < YEAR) return `${Math.floor(seconds / MONTH)}mo ago`;
  return `${Math.floor(seconds / YEAR)}y ago`;
}

function fullUTC(date: Date): string {
  return date.toUTCString();
}

interface RelativeTimeProps {
  date: string;
  className?: string;
}

export default function RelativeTime({ date, className }: RelativeTimeProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const d = new Date(date);

  return (
    <time dateTime={d.toISOString()} title={fullUTC(d)} className={className}>
      {relativeString(d)}
    </time>
  );
}
