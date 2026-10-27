"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { METRICS, eachDate, fmtIdr, fmtInt, formatMetric, type ClientModel, type MetricDef } from "@/lib/clients/analysis";
import { rateFor, type FxState } from "@/lib/clients/fx";
import { Legend, SERIES_COLORS, TimeSeriesChart, type Series } from "@/components/clients/Charts";
import { Segmented } from "@/components/clients/ui";

const BASE = ["spend", "impressions", "reach", "linkClicks", "ctr", "cpm", "cpc", "clicks"];
const MAX = 4;

function axisFmt(def: MetricDef) {
  return (v: number) =>
    def.format === "idr" ? fmtIdr(v).replace(/^Rp\s/, "") : def.format === "pct" ? `${v.toFixed(1)}%` : def.format === "x" ? `${v.toFixed(1)}×` : def.format === "dec" ? v.toFixed(1) : fmtInt(v);
}

/**
 * Daily chart with a metric picker. One metric → bars (or a line for ratios);
 * several metrics → either synchronized panels (each on its own true scale,
 * one shared crosshair) or one overlay indexed to each metric's period
 * average = 100, so "Spend vs Impressions" can be read together without a
 * misleading second y-axis. Tooltips always show the real values.
 */
export function MetricExplorer({ m, fx, color }: { m: ClientModel; fx: FxState; color: string }) {
  const dates = useMemo(() => eachDate(m.range), [m.range]);
  const points = useMemo(() => {
    const by = new Map(m.daily.map((d) => [d.date, d]));
    return dates.map((d) => by.get(d) ?? null);
  }, [m.daily, dates]);

  // Offer base metrics + whatever the client's objectives make relevant, if it has data.
  const options = useMemo(() => {
    const keys = [...BASE];
    for (const g of m.groups) for (const k of [...g.plan.tiles, g.plan.result, g.plan.costPerResult]) if (!keys.includes(k) && k !== "frequency") keys.push(k);
    return keys.filter((k) => METRICS[k] && points.some((p) => p && (METRICS[k].get({ ...p, reach: p.reach || null }) ?? 0) > 0));
  }, [m.groups, points]);

  const resultKey = m.groups[0]?.plan.result;
  const combos = [
    { label: "Spend vs Impressions", keys: ["spend", "impressions"] },
    { label: "Clicks vs Impressions", keys: ["linkClicks", "impressions"] },
    ...(resultKey && resultKey !== "impressions" ? [{ label: `Spend vs ${METRICS[resultKey].label}`, keys: ["spend", resultKey] }] : []),
    { label: "CPM vs CTR", keys: ["cpm", "ctr"] },
  ].filter((c) => c.keys.every((k) => options.includes(k)));

  const [selected, setSelected] = useState<string[]>(["spend"]);
  const [mode, setMode] = useState<"panels" | "indexed">("panels");
  const [hover, setHover] = useState<number | null>(null);
  const active = selected.filter((k) => options.includes(k));
  const keys = active.length ? active : ["spend"];

  const toggle = (k: string) =>
    setSelected((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : cur.length >= MAX ? [...cur.slice(1), k] : [...cur, k]));

  const valuesFor = (k: string) => points.map((p) => (p ? METRICS[k].get({ ...p, reach: p.reach || null }) : null));
  const multiAccount = m.accounts.length > 1;

  let body: React.ReactNode;
  if (keys.length === 1) {
    const def = METRICS[keys[0]];
    const stackedByAccount = keys[0] === "spend" && multiAccount;
    const series: Series[] = stackedByAccount
      ? m.accounts.map((a, i) => ({
          key: a.accountId,
          label: `${a.name} (${a.currency})`,
          color: SERIES_COLORS[i],
          values: dates.map((d) => {
            const r = a.daily.find((x) => x.date === d);
            return r ? r.spend * rateFor(fx, a.currency, d) : 0;
          }),
        }))
      : [{ key: def.key, label: def.label, color, values: valuesFor(def.key) }];
    body = (
      <>
        <TimeSeriesChart dates={dates} series={series} type={def.additive ? "stacked" : "line"} format={(v) => formatMetric(def, v)} axisFormat={axisFmt(def)} height={240} />
        {stackedByAccount && (
          <div className="mt-2 px-1">
            <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
          </div>
        )}
      </>
    );
  } else if (mode === "panels") {
    body = (
      <div className="space-y-1">
        {keys.map((k, i) => {
          const def = METRICS[k];
          return (
            <div key={k}>
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-slate-600">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                {def.label}
              </div>
              <TimeSeriesChart
                dates={dates}
                series={[{ key: k, label: def.label, color: SERIES_COLORS[i], values: valuesFor(k) }]}
                type={def.additive ? "stacked" : "line"}
                format={(v) => formatMetric(def, v)}
                axisFormat={axisFmt(def)}
                height={i === keys.length - 1 ? 140 : 118}
                showDates={i === keys.length - 1}
                hover={hover}
                onHover={setHover}
              />
            </div>
          );
        })}
      </div>
    );
  } else {
    const series: Series[] = keys.map((k, i) => {
      const def = METRICS[k];
      const raw = valuesFor(k);
      const nums = raw.filter((v): v is number => v !== null && Number.isFinite(v));
      const mean = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
      return {
        key: k,
        label: def.label,
        color: SERIES_COLORS[i],
        values: raw.map((v) => (v === null || !mean ? null : (v / mean) * 100)),
        display: raw,
        fmt: (v) => formatMetric(def, v),
      };
    });
    body = (
      <>
        <TimeSeriesChart dates={dates} series={series} type="line" format={(v) => (v === null ? "—" : v.toFixed(0))} axisFormat={(v) => v.toFixed(0)} height={260} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} shape="line" />
          <span className="text-[11px] text-slate-400">Index: 100 = the metric&apos;s daily average for this period</span>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {options.map((k) => {
            const i = keys.indexOf(k);
            const on = i >= 0;
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
                  on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
                }`}
              >
                {on && keys.length > 1 && <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLORS[i] }} />}
                {METRICS[k].label}
                {on && keys.length > 1 && <X className="h-3 w-3 opacity-70" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {combos.length > 0 && <span className="text-[11px] text-slate-400">Quick compare:</span>}
          {combos.map((c) => (
            <button key={c.label} onClick={() => setSelected(c.keys)} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200 hover:text-slate-900">
              {c.label}
            </button>
          ))}
          {keys.length > 1 && (
            <div className="ml-auto">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "panels", label: "Separate scales" },
                  { value: "indexed", label: "Overlay (indexed)" },
                ]}
              />
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-400">Pick one metric, or up to {MAX} to compare. Click a selected metric to remove it.</p>
      </div>
      {body}
    </div>
  );
}
