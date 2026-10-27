"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Loader2, PauseCircle, Table2 } from "lucide-react";
import {
  METRICS,
  PLATFORM_ORDER,
  addCounters,
  delta,
  eachDate,
  fmtDate,
  fmtIdr,
  fmtInt,
  formatMetric,
  inRange,
  pct,
  platformSignals,
  rangeLabel,
  shortName,
  statusLabel,
  type Agg,
  type ClientModel,
  type PlatformSel,
  type Signal,
} from "@/lib/clients/analysis";
import { PLATFORM_LABEL, emptyCounters, type Counters, type Platform } from "@/lib/clients/types";
import { Legend, ShareBar, Sparkline, TimeSeriesChart, SERIES_COLORS } from "@/components/clients/Charts";
import { Card, CardHeader, Delta, Pill, PlatformBadge, Segmented, SignalList, StatTile } from "@/components/clients/ui";
import type { LoadState } from "@/components/clients/ClientsDashboard";
import { WeeklySummary } from "@/components/clients/WeeklySummary";
import type { PortfolioWeekly } from "@/lib/clients/weekly";

type ChartMetric = "spend" | "impressions" | "linkClicks" | "ctr";

export function Overview({
  models,
  platform,
  onPlatform,
  scoped,
  colors,
  periodLabel,
  onOpen,
  loading,
  weekly,
}: {
  models: ClientModel[];
  platform: PlatformSel;
  onPlatform: (p: PlatformSel) => void;
  /** A client's model for one platform (same period/compare). */
  scoped: (m: ClientModel, p: Platform) => ClientModel;
  colors: Record<string, string>;
  periodLabel: string;
  onOpen: (id: string) => void;
  loading: LoadState;
  weekly: PortfolioWeekly | null;
}) {
  const [metric, setMetric] = useState<ChartMetric>("spend");
  const [split, setSplit] = useState<"client" | "platform" | "total">("client");
  const [showTable, setShowTable] = useState(false);

  const withData = models.filter((m) => m.accounts.length);
  const range = withData[0]?.range ?? models[0]?.range;
  const prevRange = withData[0]?.prevRange ?? null;

  const total: Agg = useMemo(() => {
    const t = { ...emptyCounters(), reach: null } as Agg;
    for (const m of withData) addCounters(t, m.total);
    return t;
  }, [withData]);
  const prevTotal = useMemo(() => {
    if (!prevRange) return null;
    const t = emptyCounters();
    for (const m of withData) if (m.prevTotal) addCounters(t, m.prevTotal);
    return t;
  }, [withData, prevRange]);

  // Per platform for multi-platform clients: no cross-platform comparisons.
  const signals: Signal[] = useMemo(() => withData.flatMap((m) => platformSignals(m, (p) => scoped(m, p))), [withData, scoped]);

  // Platform split of the portfolio (blended view only).
  const platformRows = useMemo(() => {
    if (platform !== "all") return [];
    return PLATFORM_ORDER.map((pf) => {
      const cur = emptyCounters();
      const prev: Counters | null = prevRange ? emptyCounters() : null;
      const clients: ClientModel[] = [];
      for (const m of withData) {
        const sl = m.byPlatform.find((x) => x.platform === pf);
        if (!sl) continue;
        clients.push(m);
        addCounters(cur, sl.cur);
        if (prev && sl.prev) addCounters(prev, sl.prev);
      }
      return { platform: pf, cur, prev, clients };
    }).filter((r) => r.clients.length);
  }, [platform, withData, prevRange]);
  const actionable = signals.filter((s) => s.severity === "critical" || s.severity === "warning" || s.kind === "creative" || s.kind === "opportunity");

  const dates = useMemo(() => (range ? eachDate(range) : []), [range]);
  const def = METRICS[metric];
  const series = useMemo(() => {
    if (split === "platform" && metric !== "ctr") {
      return PLATFORM_ORDER.filter((pf) => withData.some((m) => m.platformDaily[pf])).map((pf, i) => ({
        key: pf,
        label: PLATFORM_LABEL[pf],
        color: SERIES_COLORS[i],
        values: dates.map((d) => withData.reduce((t, m) => t + (m.platformDaily[pf]?.find((x) => x.date === d)?.[metric] ?? 0), 0)),
      }));
    }
    if (split !== "client" || metric === "ctr") {
      const vals = dates.map((d) => {
        const t = { ...emptyCounters(), reach: null } as Agg;
        for (const m of withData) {
          const p = m.daily.find((x) => x.date === d);
          if (p) addCounters(t, p);
        }
        return def.get(t);
      });
      const out = [{ key: "total", label: "All clients", color: SERIES_COLORS[0], values: vals }];
      if (metric === "ctr" && split === "client") {
        return withData.map((m) => ({
          key: m.client.id,
          label: m.client.name,
          color: colors[m.client.id],
          values: dates.map((d) => {
            const p = m.daily.find((x) => x.date === d);
            return p && p.impressions > 0 ? def.get({ ...p, reach: null }) : null;
          }),
        }));
      }
      return out;
    }
    return withData.map((m) => ({
      key: m.client.id,
      label: m.client.name,
      color: colors[m.client.id],
      values: dates.map((d) => m.daily.find((x) => x.date === d)?.[metric] ?? 0),
    }));
  }, [split, metric, dates, withData, colors, def]);

  const inactiveSpenders = withData.flatMap((m) => m.campaigns.filter((c) => c.inactiveButSpent).map((c) => ({ m, c })));
  const totalSpend = total.spend || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{platform === "all" ? "Portfolio overview" : `${PLATFORM_LABEL[platform]} overview`}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {periodLabel} · {range ? rangeLabel(range) : ""}
          {prevRange ? ` · compared with ${rangeLabel(prevRange)}` : withData[0]?.prevNote ? ` · ${withData[0].prevNote}` : ""}
        </p>
      </div>

      {weekly && <WeeklySummary data={weekly} title="Portfolio weekly summary" onClientClick={onOpen} />}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile emphasis label="Amount spent" value={fmtIdr(total.spend)} delta={prevTotal ? delta(total.spend, prevTotal.spend) : undefined} neutralDelta sub={`${withData.length} clients`} />
        <StatTile label="Impressions" value={fmtInt(total.impressions)} delta={prevTotal ? delta(total.impressions, prevTotal.impressions) : undefined} />
        <StatTile label="Link clicks" value={fmtInt(total.linkClicks)} delta={prevTotal ? delta(total.linkClicks, prevTotal.linkClicks) : undefined} />
        <StatTile
          label="CTR (link)"
          value={formatMetric("ctr", METRICS.ctr.get(total))}
          delta={prevTotal ? delta(METRICS.ctr.get(total), METRICS.ctr.get({ ...prevTotal, reach: null })) : undefined}
          hint="Link clicks ÷ impressions"
        />
        <StatTile
          label="CPM"
          value={formatMetric("cpm", METRICS.cpm.get(total))}
          delta={prevTotal ? delta(METRICS.cpm.get(total), METRICS.cpm.get({ ...prevTotal, reach: null })) : undefined}
          higherIsBetter={false}
        />
        <StatTile
          label="CPC (link)"
          value={formatMetric("cpc", METRICS.cpc.get(total))}
          delta={prevTotal ? delta(METRICS.cpc.get(total), METRICS.cpc.get({ ...prevTotal, reach: null })) : undefined}
          higherIsBetter={false}
        />
      </div>

      {platformRows.length > 1 && (
        <Card>
          <CardHeader title="By platform" subtitle="Which clients run where. Open a platform to see only its numbers, campaigns and suggestions." />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium sm:px-5">Platform</th>
                  <th className="px-3 py-2 font-medium">Clients</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="w-28 px-3 py-2 font-medium">Share</th>
                  <th className="px-3 py-2 text-right font-medium">Impr.</th>
                  <th className="px-3 py-2 text-right font-medium">Clicks</th>
                  <th className="px-3 py-2 text-right font-medium">CTR</th>
                  <th className="px-3 py-2 text-right font-medium">CPM</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {platformRows.map((r, i) => {
                  const a = { ...r.cur, reach: null };
                  return (
                    <tr key={r.platform} onClick={() => onPlatform(r.platform)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900 sm:px-5">{PLATFORM_LABEL[r.platform]}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.clients.map((m) => (
                            <button
                              key={m.client.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpen(m.client.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200"
                            >
                              <span className="h-2 w-2 rounded-sm" style={{ background: colors[m.client.id] }} />
                              {m.client.name}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="whitespace-nowrap font-semibold text-slate-900">{fmtIdr(r.cur.spend)}</div>
                        {r.prev && <Delta value={delta(r.cur.spend, r.prev.spend)} neutral />}
                      </td>
                      <td className="px-3 py-3">
                        <ShareBar share={r.cur.spend / (total.spend || 1)} color={SERIES_COLORS[i]} />
                        <div className="mt-1 text-[11px] tabular-nums text-slate-400">{pct(r.cur.spend / (total.spend || 1), 1)}</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtInt(r.cur.impressions)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtInt(r.cur.linkClicks)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMetric("ctr", METRICS.ctr.get(a))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMetric("cpm", METRICS.cpm.get(a))}</td>
                      <td className="pr-3 text-slate-300">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Daily chart + alerts */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={`Daily ${def.label.toLowerCase()}`}
            subtitle={
              metric === "ctr" ? "Ratio metric — one line per client (no stacking)" : split === "client" ? "Stacked by client" : split === "platform" ? "Stacked by platform" : "All clients combined"
            }
            right={
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  size="sm"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: "spend", label: "Spend" },
                    { value: "impressions", label: "Impr." },
                    { value: "linkClicks", label: "Clicks" },
                    { value: "ctr", label: "CTR" },
                  ]}
                />
                <Segmented
                  size="sm"
                  value={split}
                  onChange={setSplit}
                  options={[
                    { value: "client", label: "By client" },
                    ...(platform === "all" && platformRows.length > 1 ? [{ value: "platform" as const, label: "By platform" }] : []),
                    { value: "total", label: "Total" },
                  ]}
                />
              </div>
            }
          />
          <div className="px-3 pb-3 pt-4 sm:px-4">
            <TimeSeriesChart
              dates={dates}
              series={series}
              type={metric === "ctr" || split === "total" ? "line" : "stacked"}

              format={(v) => formatMetric(def, v)}
              axisFormat={(v) => (def.format === "idr" ? fmtIdr(v).replace(/^Rp\s/, "") : def.format === "pct" ? `${v.toFixed(1)}%` : fmtInt(v))}
              height={260}
            />
            {series.length > 1 && (
              <div className="mt-2 px-1">
                <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} shape={metric === "ctr" ? "line" : "rect"} />
              </div>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="What needs attention"
            subtitle="Anomalies (last 3 days vs 14-day baseline), budget-absorbing creatives & reallocation ideas"
            right={<Pill tone={actionable.some((s) => s.severity === "critical") ? "red" : "slate"}>{actionable.filter((s) => s.severity === "critical").length} critical</Pill>}
          />
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <SignalList signals={actionable} showClient onClientClick={onOpen} limit={8} />
          </div>
        </Card>
      </div>

      {/* Client table */}
      <Card>
        <CardHeader
          title="Clients"
          subtitle="Detected objectives drive the headline KPI. Click a client for its full objective-specific view."
          right={
            <button onClick={() => setShowTable((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
              <Table2 className="h-3.5 w-3.5" /> {showTable ? "Hide" : "Show"} daily data table
            </button>
          }
        />
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">Client</th>
                <th className="px-3 py-2 font-medium">Running</th>
                <th className="px-3 py-2 text-right font-medium">Spend</th>
                <th className="w-28 px-3 py-2 font-medium">Share</th>
                <th className="px-3 py-2 text-right font-medium">Impr.</th>
                <th className="px-3 py-2 text-right font-medium">Link clicks</th>
                <th className="px-3 py-2 text-right font-medium">CTR</th>
                <th className="px-3 py-2 text-right font-medium">Headline KPI</th>
                <th className="px-3 py-2 font-medium">Daily spend</th>
                <th className="px-3 py-2 font-medium">Alerts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const loadingIds = m.client.accountIds.filter((id) => loading[id]);
                if (!m.accounts.length) {
                  const err = m.client.accountIds.map((id) => loading[id]).find((l) => l?.status === "error");
                  return (
                    <tr key={m.client.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium sm:px-5">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[m.client.id] }} />
                        {m.client.name}
                      </td>
                      <td colSpan={10} className="px-3 py-3 text-xs text-slate-500">
                        {loadingIds.length && !err ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pulling {m.client.accountIds.join(", ")} from Meta…
                          </span>
                        ) : (
                          <span className="text-amber-700">{err?.message ?? "No data yet for this ad account."}</span>
                        )}
                      </td>
                    </tr>
                  );
                }
                const g = m.groups[0];
                const headline = g ? METRICS[g.plan.costPerResult] : null;
                const headlineVal = g && headline ? headline.get(g.cur) : null;
                const prevHeadline = g?.prev && headline ? headline.get({ ...g.prev, reach: null }) : null;
                const resultDef = g ? METRICS[g.plan.result] : null;
                const sig = signals.filter((s) => s.clientId === m.client.id);
                const crit = sig.filter((s) => s.severity === "critical").length;
                const warn = sig.filter((s) => s.severity === "warning").length;
                const spark = m.daily.filter((d) => inRange(d.date, m.range)).map((d) => d.spend);
                return (
                  <tr key={m.client.id} onClick={() => onOpen(m.client.id)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors[m.client.id] }} />
                        <span className="font-medium text-slate-900">{m.client.name}</span>
                      </div>
                      <div className="ml-[18px] flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                        {m.byPlatform.map((x) => (
                          <PlatformBadge key={x.platform} platform={x.platform} />
                        ))}
                        <span>
                          {m.accounts.length} account{m.accounts.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.groups.map((x) => (
                          <Pill key={x.key} tone="slate" title={`${pct(x.spendShare)} of spend`}>
                            {x.label} {pct(x.spendShare)}
                          </Pill>
                        ))}
                        {!m.groups.length && <span className="text-xs text-slate-400">No spend</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="whitespace-nowrap font-semibold text-slate-900">{fmtIdr(m.total.spend)}</div>
                      {m.prevTotal && <Delta value={delta(m.total.spend, m.prevTotal.spend)} neutral />}
                    </td>
                    <td className="px-3 py-3">
                      <ShareBar share={m.total.spend / totalSpend} color={colors[m.client.id]} />
                      <div className="mt-1 text-[11px] tabular-nums text-slate-400">{pct(m.total.spend / totalSpend, 1)}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtInt(m.total.impressions)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtInt(m.total.linkClicks)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMetric("ctr", METRICS.ctr.get(m.total))}</td>
                    <td className="px-3 py-3 text-right">
                      {g && headline && resultDef ? (
                        <>
                          <div className="font-semibold tabular-nums text-slate-900">
                            {formatMetric(headline, headlineVal)} <span className="text-[11px] font-normal text-slate-400">{headline.label.replace("Cost per ", "/ ")}</span>
                          </div>
                          <div className="text-[11px] tabular-nums text-slate-400">
                            {m.byPlatform.length > 1 && <span className="text-slate-500">{PLATFORM_LABEL[g.platform]} · </span>}
                            {formatMetric(resultDef, resultDef.get(g.cur))} {resultDef.label.toLowerCase()}{" "}
                            {prevHeadline !== null && <Delta value={delta(headlineVal, prevHeadline)} higherIsBetter={headline.higherIsBetter} />}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Sparkline values={spark} color={colors[m.client.id]} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {crit > 0 && <Pill tone="red">{crit}</Pill>}
                        {warn > 0 && <Pill tone="amber">{warn}</Pill>}
                        {!crit && !warn && <Pill tone="green">OK</Pill>}
                      </div>
                    </td>
                    <td className="pr-3 text-slate-300">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {showTable && <DailyTable models={withData} dates={dates} metric={metric} />}
      </Card>

      {/* Inactive-but-spent */}
      <Card>
        <CardHeader
          title="Inactive campaigns that still spent in this window"
          subtitle="Paused, stopped or no longer delivering — their spend and results are included in every total above."
          right={<Pill tone="slate" icon={PauseCircle}>{inactiveSpenders.length}</Pill>}
        />
        {inactiveSpenders.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium sm:px-5">Client</th>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Last spend</th>
                  <th className="px-3 py-2 text-right font-medium">Spend in window</th>
                  <th className="px-3 py-2 text-right font-medium">Share of client</th>
                </tr>
              </thead>
              <tbody>
                {inactiveSpenders.map(({ m, c }) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 sm:px-5">
                      <button onClick={() => onOpen(m.client.id)} className="font-medium text-slate-900 hover:underline">
                        {m.client.name}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{shortName(c.name)}</td>
                    <td className="px-3 py-2.5">
                      <Pill tone="slate">{statusLabel(c.status)}</Pill>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{c.lastSpendDate ? fmtDate(c.lastSpendDate) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtIdr(c.cur.spend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{pct(c.cur.spend / (m.total.spend || 1), 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-center text-sm text-slate-400">Every campaign that spent in this window is still delivering.</p>
        )}
      </Card>
    </div>
  );
}

function DailyTable({ models, dates, metric }: { models: ClientModel[]; dates: string[]; metric: ChartMetric }) {
  const def = METRICS[metric];
  return (
    <div className="max-h-96 overflow-auto border-t border-slate-100 scrollbar-thin">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2 font-medium">Date</th>
            {models.map((m) => (
              <th key={m.client.id} className="px-3 py-2 text-right font-medium">
                {m.client.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...dates].reverse().map((d) => (
            <tr key={d} className="border-t border-slate-50">
              <td className="px-4 py-1.5 text-slate-500">{fmtDate(d, { weekday: "short", month: "short", day: "numeric" })}</td>
              {models.map((m) => {
                const p = m.daily.find((x) => x.date === d);
                return (
                  <td key={m.client.id} className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                    {p ? formatMetric(def, def.get({ ...p, reach: null })) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
