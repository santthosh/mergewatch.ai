"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// -- Types ------------------------------------------------------------------

interface ScoreTrendPoint {
  date: string;
  avgScore: number;
  count: number;
}

interface RepoBreakdownItem {
  repo: string;
  count: number;
}

interface AnalyticsData {
  totalReviews: number;
  totalFindings: number;
  avgMergeScore: number;
  scoreTrend: ScoreTrendPoint[];
  severityBreakdown: Record<string, number>;
  durationStats: { avgMs: number; p95Ms: number; count: number };
  repoBreakdown: RepoBreakdownItem[];
  categoryBreakdown: Record<string, number>;
}

interface AnalyticsClientProps {
  installationId: string;
}

// -- Constants ---------------------------------------------------------------

const CHART_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: CHART_COLORS.red,
  warning: CHART_COLORS.yellow,
  info: CHART_COLORS.blue,
};

const CATEGORY_COLORS: Record<string, string> = {
  security: CHART_COLORS.red,
  bug: CHART_COLORS.orange,
  style: CHART_COLORS.purple,
};

// -- Helpers -----------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// -- Sub-components ----------------------------------------------------------

function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div
      className="rounded-lg border p-4 sm:p-5"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-fg-tertiary)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-fg-primary)" }}>
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-fg-secondary)" }}>
          {subtext}
        </p>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4 sm:p-5"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <h3 className="mb-4 text-sm font-semibold" style={{ color: "var(--color-fg-primary)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="animate-pulse rounded-lg border p-4 sm:p-5"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="h-3 w-20 rounded" style={{ backgroundColor: "var(--color-border-default)" }} />
      <div className="mt-3 h-7 w-16 rounded" style={{ backgroundColor: "var(--color-border-default)" }} />
    </div>
  );
}

function SkeletonChartCard() {
  return (
    <div
      className="animate-pulse rounded-lg border p-4 sm:p-5"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="h-4 w-32 rounded" style={{ backgroundColor: "var(--color-border-default)" }} />
      <div className="mt-6 h-48 w-full rounded" style={{ backgroundColor: "var(--color-border-default)", opacity: 0.5 }} />
    </div>
  );
}

// -- Custom Tooltip ----------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        borderColor: "var(--color-border-default)",
        color: "var(--color-fg-primary)",
      }}
    >
      <p className="font-medium">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// -- Main Component ----------------------------------------------------------

export default function AnalyticsClient({ installationId }: AnalyticsClientProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/analytics?installation_id=${installationId}`);
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/signout";
            return;
          }
          throw new Error("Failed to fetch analytics");
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.analytics);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Failed to load analytics");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAnalytics();
    return () => { cancelled = true; };
  }, [installationId]);

  // Loading state
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <div className="h-7 w-32 animate-pulse rounded" style={{ backgroundColor: "var(--color-border-default)" }} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkeletonChartCard />
          <SkeletonChartCard />
          <SkeletonChartCard />
          <SkeletonChartCard />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-xl font-bold" style={{ color: "var(--color-fg-primary)" }}>Analytics</h1>
        <div
          className="rounded-lg border p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--color-fg-secondary)" }}>{error}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || data.totalReviews === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-xl font-bold" style={{ color: "var(--color-fg-primary)" }}>Analytics</h1>
        <div
          className="rounded-lg border p-12 text-center"
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <p className="text-base font-medium" style={{ color: "var(--color-fg-primary)" }}>No review data yet</p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-fg-secondary)" }}>
            Analytics will appear here once MergeWatch has reviewed some pull requests.
          </p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const scoreTrendData = data.scoreTrend.map((p) => ({
    ...p,
    dateLabel: formatDateLabel(p.date),
  }));

  const severityData = Object.entries(data.severityBreakdown)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => ({
      name: severity.charAt(0).toUpperCase() + severity.slice(1),
      value: count,
      color: SEVERITY_COLORS[severity] ?? CHART_COLORS.blue,
    }));

  const categoryData = Object.entries(data.categoryBreakdown)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({
      name: category.charAt(0).toUpperCase() + category.slice(1),
      value: count,
      color: CATEGORY_COLORS[category] ?? CHART_COLORS.blue,
    }));

  const repoData = data.repoBreakdown.slice(0, 10).map((r) => ({
    name: r.repo.includes("/") ? r.repo.split("/")[1] : r.repo,
    fullName: r.repo,
    reviews: r.count,
  }));

  const durationData = [
    { name: "Average", value: Math.round(data.durationStats.avgMs / 1000), fill: CHART_COLORS.blue },
    { name: "P95", value: Math.round(data.durationStats.p95Ms / 1000), fill: CHART_COLORS.purple },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-xl font-bold" style={{ color: "var(--color-fg-primary)" }}>Analytics</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Total Reviews" value={data.totalReviews} />
        <StatCard label="Total Findings" value={data.totalFindings} />
        <StatCard
          label="Avg Merge Score"
          value={data.avgMergeScore > 0 ? `${data.avgMergeScore} / 5` : "N/A"}
          subtext={data.avgMergeScore > 0 ? "Higher is better" : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Score Trend */}
        {scoreTrendData.length > 0 && (
          <ChartCard title="Merge Score Trend">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scoreTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                />
                <YAxis
                  domain={[0, 5]}
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  name="Avg Score"
                  stroke={CHART_COLORS.green}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART_COLORS.green }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Severity Breakdown */}
        {severityData.length > 0 && (
          <ChartCard title="Findings by Severity">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`severity-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Review Duration */}
        {data.durationStats.count > 0 && (
          <ChartCard title="Review Duration">
            <div className="mb-3 flex gap-4">
              <div>
                <p className="text-xs" style={{ color: "var(--color-fg-tertiary)" }}>Average</p>
                <p className="text-lg font-semibold" style={{ color: "var(--color-fg-primary)" }}>
                  {formatDuration(data.durationStats.avgMs)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--color-fg-tertiary)" }}>P95</p>
                <p className="text-lg font-semibold" style={{ color: "var(--color-fg-primary)" }}>
                  {formatDuration(data.durationStats.p95Ms)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--color-fg-tertiary)" }}>Completed</p>
                <p className="text-lg font-semibold" style={{ color: "var(--color-fg-primary)" }}>
                  {data.durationStats.count}
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={durationData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                  unit="s"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                  width={60}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  formatter={(value: number) => [`${value}s`, "Duration"]}
                />
                <Bar dataKey="value" name="Duration" radius={[0, 4, 4, 0]}>
                  {durationData.map((entry, index) => (
                    <Cell key={`duration-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Reviews per Repo */}
        {repoData.length > 0 && (
          <ChartCard title="Reviews per Repository">
            <ResponsiveContainer width="100%" height={Math.max(180, repoData.length * 36)}>
              <BarChart data={repoData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                  width={120}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  formatter={(value: number) => [value, "Reviews"]}
                />
                <Bar dataKey="reviews" name="Reviews" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Category Breakdown */}
        {categoryData.length > 0 && (
          <ChartCard title="Findings by Category">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-fg-tertiary)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border-default)" }}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Findings" radius={[4, 4, 0, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`category-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
