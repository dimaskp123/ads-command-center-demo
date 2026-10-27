"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, Copy, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { rangeLabel } from "@/lib/clients/analysis";
import { weeklyToText, type ClientWeekly, type PortfolioWeekly, type WeeklyLine } from "@/lib/clients/weekly";
import { Card, Pill, SEVERITY_META } from "@/components/clients/ui";

function Line({ l }: { l: WeeklyLine }) {
  const Icon = l.tone === "good" ? TrendingUp : l.tone === "bad" ? TrendingDown : null;
  return (
    <li className="flex gap-2 text-sm leading-relaxed text-slate-700">
      <span className="mt-[7px] inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
      <span>
        {l.text}
        {Icon && <Icon className={`ml-1 inline h-3.5 w-3.5 ${l.tone === "good" ? "text-emerald-600" : "text-red-600"}`} aria-label={l.tone === "good" ? "improving" : "worsening"} />}
      </span>
    </li>
  );
}

export function WeeklySummary({
  data,
  title,
  onClientClick,
}: {
  data: ClientWeekly | PortfolioWeekly;
  title: string;
  onClientClick?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const portfolio = "clients" in data;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(weeklyToText(data, title));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <CalendarDays className="h-4 w-4 text-slate-400" /> Weekly summary · {rangeLabel(data.week)}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Last complete Monday–Sunday{data.prevWeek ? `, compared with ${rangeLabel(data.prevWeek)}` : ""}. Written from the data; doesn&apos;t change with the period picker.
          </p>
        </div>
        <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy as text"}
        </button>
      </div>

      <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <p className="text-[15px] font-medium leading-relaxed text-slate-900">{data.headline}</p>
          {portfolio ? (
            <>
              <ul className="space-y-1">{data.highlights.map((l, i) => <Line key={i} l={l} />)}</ul>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">By client</div>
                <ul className="space-y-1">
                  {data.clients.map((c) => (
                    <li key={c.clientId} className="text-sm text-slate-700">
                      <button className="text-left hover:underline" onClick={() => onClientClick?.(c.clientId)}>
                        {c.oneLiner}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <>
              <ul className="space-y-1">
                {data.performance.map((l, i) => (
                  <Line key={i} l={l} />
                ))}
                {data.creativeNote && <Line l={{ text: data.creativeNote }} />}
              </ul>
              {data.anomalies.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <AlertTriangle className="h-3 w-3" /> Anomalies this week
                  </div>
                  <ul className="space-y-1">
                    {data.anomalies.map((l, i) => (
                      <Line key={i} l={l} />
                    ))}
                  </ul>
                </div>
              )}
              {data.hasData && data.anomalies.length === 0 && <p className="text-xs text-slate-500">No day this week fell outside the normal range of the previous 4 weeks.</p>}
            </>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Lightbulb className="h-3 w-3" /> Suggested next steps
          </div>
          {data.suggestions.length ? (
            <ol className="space-y-2.5">
              {data.suggestions.map((s, i) => (
                <li key={s.id} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {portfolio && <span className="text-xs font-semibold text-slate-900">{s.clientName}</span>}
                      <span className="text-sm font-medium text-slate-800">{s.title}</span>
                      <Pill tone={SEVERITY_META[s.severity].tone}>{SEVERITY_META[s.severity].label}</Pill>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{s.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Nothing pressing — keep current settings.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
