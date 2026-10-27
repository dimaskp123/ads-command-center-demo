"use client";

import type { Platform } from "@/lib/clients/types";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  type LucideIcon,
} from "lucide-react";
import { SEVERITY_RANK, type Severity, type Signal } from "@/lib/clients/analysis";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, right }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="min-w-0 max-w-full">{right}</div>}
    </div>
  );
}

/** Delta pill. `good` decides colour (so a falling CPL is green). */
export function Delta({ value, higherIsBetter = true, neutral }: { value: number | null; higherIsBetter?: boolean; neutral?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-xs text-slate-300">—</span>;
  const up = value >= 0;
  const good = neutral ? null : up === higherIsBetter;
  const cls = good === null ? "text-slate-500" : good ? "text-emerald-600" : "text-red-600";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`relative inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(value * 100) >= 999 ? ">999" : Math.abs(value * 100).toFixed(1)}%
      <span className="sr-only">{up ? "increase" : "decrease"}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  higherIsBetter,
  neutralDelta,
  hint,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  delta?: number | null;
  higherIsBetter?: boolean;
  neutralDelta?: boolean;
  hint?: string;
  sub?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3.5 sm:p-4 ${emphasis ? "border-slate-900/10 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} title={hint}>
      <div className={`text-[11px] font-medium uppercase tracking-wide ${emphasis ? "text-slate-300" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl 2xl:text-2xl ${emphasis ? "text-white" : "text-slate-900"}`}>{value}</div>
      <div className="mt-1 flex min-h-[18px] flex-wrap items-center gap-2">
        {delta !== undefined && <Delta value={delta ?? null} higherIsBetter={higherIsBetter} neutral={neutralDelta} />}
        {sub && <span className={`text-[11px] ${emphasis ? "text-slate-400" : "text-slate-400"}`}>{sub}</span>}
      </div>
    </div>
  );
}

type Tone = "green" | "red" | "amber" | "sky" | "slate" | "violet";
const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Pill({ children, tone = "slate", icon: Icon, title }: { children: React.ReactNode; tone?: Tone; icon?: LucideIcon; title?: string }) {
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1 truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

export const SEVERITY_META: Record<Severity, { icon: LucideIcon; tone: Tone; label: string; bar: string }> = {
  critical: { icon: AlertOctagon, tone: "red", label: "Act now", bar: "bg-red-500" },
  warning: { icon: AlertTriangle, tone: "amber", label: "Watch", bar: "bg-amber-500" },
  info: { icon: Info, tone: "sky", label: "Note", bar: "bg-sky-500" },
  good: { icon: CheckCircle2, tone: "green", label: "Working", bar: "bg-emerald-500" },
};

export function SignalList({
  signals,
  showClient,
  onClientClick,
  limit = 6,
  empty = "Nothing unusual detected.",
}: {
  signals: Signal[];
  showClient?: boolean;
  onClientClick?: (id: string) => void;
  limit?: number;
  empty?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...signals].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const shown = expanded ? sorted : sorted.slice(0, limit);
  if (!sorted.length) return <p className="px-4 py-6 text-center text-sm text-slate-400 sm:px-5">{empty}</p>;
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {shown.map((s) => {
          const meta = SEVERITY_META[s.severity];
          const Icon = meta.icon;
          return (
            <li key={s.id} className="flex gap-3 px-4 py-3 sm:px-5">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  s.severity === "critical" ? "text-red-600" : s.severity === "warning" ? "text-amber-600" : s.severity === "good" ? "text-emerald-600" : "text-sky-600"
                }`}
                aria-label={meta.label}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {showClient && (
                    <button onClick={() => onClientClick?.(s.clientId)} className="text-xs font-semibold text-slate-900 hover:underline">
                      {s.clientName}
                    </button>
                  )}
                  <span className="text-sm font-medium text-slate-800">{s.title}</span>
                  <Pill tone={meta.tone}>{meta.label}</Pill>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.detail}</p>
                {s.action && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    <span className="font-semibold">Do: </span>
                    {s.action}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {sorted.length > limit && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-lg bg-slate-100 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-colors ${size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${
            o.value === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PLATFORM_SHORT: Record<Platform, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className="rounded bg-slate-200/70 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-500">{PLATFORM_SHORT[platform]}</span>;
}
