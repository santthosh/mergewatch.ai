"use client";

import { useState, useEffect } from "react";
import Markdown from "react-markdown";
import RelativeTime from "./RelativeTime";
import {
  X,
  ExternalLink,
  Clock,
  FileText,
  GitBranch,
  BarChart3,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

// -- Types ------------------------------------------------------------------

interface ReviewDetail {
  id: string;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  status: string;
  model: string;
  createdAt: string;
  completedAt?: string;
  prAuthor?: string;
  prAuthorAvatar?: string;
  headBranch?: string;
  baseBranch?: string;
  findingCount?: number;
  topSeverity?: string;
  durationMs?: number;
  summaryText?: string;
  diagramText?: string;
  findings?: Finding[];
  settingsUsed?: SettingsUsed;
  feedback?: "up" | "down";
  commentId?: number;
}

interface Finding {
  file: string;
  line: number;
  severity: "critical" | "warning" | "info";
  confidence?: number;
  category: "security" | "bug" | "style";
  title: string;
  description: string;
  suggestion: string;
}

interface SettingsUsed {
  severityThreshold: string;
  commentTypes: { syntax: boolean; logic: boolean; style: boolean };
  maxComments: number;
  summaryEnabled: boolean;
  customInstructions: boolean;
}

// -- Helpers ----------------------------------------------------------------

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-primer-orange/15", text: "text-primer-orange", label: "Pending" },
  in_progress: { bg: "bg-primer-blue/15", text: "text-primer-blue", label: "In Progress" },
  completed: { bg: "bg-primer-green/15", text: "text-primer-green", label: "Completed" },
  failed: { bg: "bg-primer-red/15", text: "text-primer-red", label: "Failed" },
};

const severityStyles: Record<string, { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "Critical" },
  warning: { dot: "bg-yellow-500", label: "Warning" },
  info: { dot: "bg-blue-500", label: "Info" },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] ?? statusStyles.pending;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function SeverityDot({ severity }: { severity?: string }) {
  if (!severity) return null;
  const s = severityStyles[severity];
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1" title={s.label}>
      <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
    </span>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function DrawerSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Clock;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#1a1a1a]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-[#111] transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-[#555]" /> : <ChevronRight size={14} className="text-[#555]" />}
        <Icon size={14} className="text-[#555]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-[#444]">{title}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// -- ReviewDrawer -----------------------------------------------------------

export default function ReviewDrawer({
  reviewId,
  onClose,
}: {
  reviewId: string;
  onClose: () => void;
}) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackState, setFeedbackState] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reviews/${encodeURIComponent(reviewId)}`)
      .then((r) => r.json())
      .then((data) => {
        setReview(data.review);
        setFeedbackState(data.review?.feedback ?? null);
      })
      .finally(() => setLoading(false));
  }, [reviewId]);

  async function handleFeedback(fb: "up" | "down") {
    const newFb = feedbackState === fb ? null : fb;
    setFeedbackState(newFb);
    await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: newFb }),
    });
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const prUrl = review ? `https://github.com/${review.repoFullName}/pull/${review.prNumber}` : "";
  const commentUrl = review?.commentId ? `${prUrl}#issuecomment-${review.commentId}` : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[#1e1e1e] bg-[#0a0a0a] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#1e1e1e] px-5 py-4">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-5 w-48 animate-pulse rounded bg-[#1a1a1a]" />
            ) : review ? (
              <>
                <h2 className="text-base font-semibold text-white truncate">
                  #{review.prNumber} {review.prTitle || "Untitled PR"}
                </h2>
                <p className="mt-0.5 text-xs text-[#555]">{review.repoFullName}</p>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {review && <StatusBadge status={review.status} />}
            <button
              onClick={onClose}
              className="rounded p-1 text-[#555] hover:bg-[#1a1a1a] hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-4 p-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-[#1a1a1a]" />
              ))}
            </div>
          ) : review ? (
            <>
              <DrawerSection title="Overview" icon={FileText} defaultOpen>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#555]">Author</span>
                    {review.prAuthor ? (
                      <span className="flex items-center gap-1.5 text-white">
                        {review.prAuthorAvatar && (
                          <img src={review.prAuthorAvatar} alt="" className="h-4 w-4 rounded-full" />
                        )}
                        {review.prAuthor}
                      </span>
                    ) : (
                      <span className="text-[#333]">&mdash;</span>
                    )}
                  </div>
                  {review.headBranch && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#555]">Branch</span>
                      <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-xs text-[#888]">
                        {review.headBranch} &rarr; {review.baseBranch ?? "main"}
                      </code>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#555]">Commit</span>
                    <a
                      href={`https://github.com/${review.repoFullName}/commit/${review.commitSha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primer-blue hover:underline"
                    >
                      <code className="text-xs">{review.commitSha}</code>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#555]">Model</span>
                    <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-xs text-[#888]">
                      {review.model || "&mdash;"}
                    </code>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#555]">Duration</span>
                    <span className="text-white">
                      {review.durationMs ? formatDuration(review.durationMs) : "&mdash;"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#555]">Started</span>
                    <span className="text-white">
                      {review.createdAt ? <RelativeTime date={review.createdAt} /> : "&mdash;"}
                    </span>
                  </div>
                  {commentUrl && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#555]">Comment</span>
                      <a
                        href={commentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primer-blue hover:underline text-xs"
                      >
                        View on GitHub <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>
              </DrawerSection>

              {review.summaryText && (
                <DrawerSection title="Summary" icon={FileText} defaultOpen>
                  <div className="prose prose-invert prose-sm max-w-none text-sm text-[#999] leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-[#1a1a1a] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[#ccc] [&_pre]:rounded-lg [&_pre]:bg-[#111] [&_pre]:p-3 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_strong]:text-white [&_a]:text-primer-blue [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#333] [&_blockquote]:pl-3 [&_blockquote]:text-[#777]">
                    <Markdown>{review.summaryText}</Markdown>
                  </div>
                </DrawerSection>
              )}

              {review.diagramText && (
                <DrawerSection title="Diagram" icon={GitBranch}>
                  <div className="overflow-x-auto rounded-lg bg-[#111] border border-[#1a1a1a] p-3">
                    <pre className="text-xs text-[#999] whitespace-pre-wrap">{review.diagramText}</pre>
                  </div>
                </DrawerSection>
              )}

              <DrawerSection
                title={`Findings (${review.findings?.length ?? review.findingCount ?? 0})`}
                icon={AlertCircle}
                defaultOpen
              >
                {(!review.findings || review.findings.length === 0) ? (
                  <p className="text-sm text-[#555]">No issues found.</p>
                ) : (
                  <div className="space-y-3">
                    {review.findings.map((f, i) => (
                      <div key={i} className="rounded-lg border border-[#1a1a1a] p-3">
                        <div className="flex items-start gap-2">
                          <SeverityDot severity={f.severity} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{f.title}</span>
                              <span className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-[#666] uppercase">
                                {f.category}
                              </span>
                              {f.confidence != null && (
                                <span className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-[#888]">
                                  {f.confidence}%
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-[#888]">
                              <code className="text-[#666]">{f.file}:{f.line}</code>
                            </p>
                            {f.description && (
                              <p className="mt-1.5 text-xs text-[#777] leading-relaxed">{f.description}</p>
                            )}
                            {f.suggestion && (
                              <div className="mt-2 rounded bg-[#0d1a0d] border border-[#1a2e1a] px-2.5 py-1.5 text-xs text-[#6fcc6f]">
                                {f.suggestion}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DrawerSection>

              {review.settingsUsed && (
                <DrawerSection title="Settings Used" icon={BarChart3}>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#555]">Severity threshold</span>
                      <span className="text-white">{review.settingsUsed.severityThreshold}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#555]">Agents</span>
                      <div className="flex gap-1">
                        {(["syntax", "logic", "style"] as const).map((k) => (
                          <span
                            key={k}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              review.settingsUsed!.commentTypes[k]
                                ? "bg-[#00ff88]/10 text-[#00ff88]"
                                : "bg-[#1a1a1a] text-[#333] line-through"
                            }`}
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#555]">Max comments</span>
                      <span className="text-white">{review.settingsUsed.maxComments}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#555]">Summary</span>
                      <span className={review.settingsUsed.summaryEnabled ? "text-[#00ff88]" : "text-[#555]"}>
                        {review.settingsUsed.summaryEnabled ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                </DrawerSection>
              )}

              <div className="border-b border-[#1a1a1a] px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[#444]">
                    Was this review helpful?
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFeedback("up")}
                      className={`rounded-lg p-2 transition-colors ${
                        feedbackState === "up"
                          ? "bg-primer-green/15 text-primer-green"
                          : "text-[#555] hover:bg-[#1a1a1a] hover:text-white"
                      }`}
                    >
                      <ThumbsUp size={16} />
                    </button>
                    <button
                      onClick={() => handleFeedback("down")}
                      className={`rounded-lg p-2 transition-colors ${
                        feedbackState === "down"
                          ? "bg-primer-red/15 text-primer-red"
                          : "text-[#555] hover:bg-[#1a1a1a] hover:text-white"
                      }`}
                    >
                      <ThumbsDown size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-lg border border-[#1e1e1e] px-4 py-2.5 text-sm text-[#888] hover:border-[#333] hover:text-white transition-colors"
                >
                  View PR on GitHub <ExternalLink size={14} />
                </a>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-[#555]">
              Review not found.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
