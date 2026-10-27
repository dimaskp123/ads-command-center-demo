"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Info, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import {
  AD_FLAG_META,
  GROUP_META,
  METRICS,
  platformSignals,
  daysIn,
  delta,
  rangeLabel,
  fmtDate,
  fmtIdr,
  fmtInt,
  formatMetric,
  pct,
  shortName,
  statusLabel,
  trunc,
  verifiedCoverage,
  type AdFlag,
  type AdView,
  type CampaignView,
  type ClientModel,
  type GroupView,
  type PlatformSel,
  type PlatformSlice,
} from "@/lib/clients/analysis";
import { PLATFORM_LABEL, type Counters, type Platform } from "@/lib/clients/types";
import type { FxState } from "@/lib/clients/fx";
import { MetricExplorer } from "@/components/clients/MetricExplorer";
import { Legend, ShareBar, TimeSeriesChart, SERIES_COLORS } from "@/components/clients/Charts";
import { Card, CardHeader, Delta, Pill, Segmented, SignalList, StatTile } from "@/components/clients/ui";
import type { LoadState } from "@/components/clients/ClientsDashboard";
import { WeeklySummary } from "@/components/clients/WeeklySummary";
import type { ClientWeekly } from "@/lib/clients/weekly";

export type ClientTab = "summary" | "performance" | "campaigns" | "creatives";
export const CLIENT_TABS: { value: ClientTab; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "performance", label: "Performance" },
  { value: "campaigns", label: "Campaigns" },
  { value: "creatives", label: "Ad creatives" },
];

export function ClientDetail({
  model: m,
  color,
  periodLabel,
  loading,
  liveEnabled,
  onRefresh,
  fx,
  weekly,
  onPlatform,
  scoped,
  tab = "summary",
  tabBar,
}: {
  tab?: ClientTab;
  /** Rendered under the client header (the shell's sub-tabs). */
  tabBar?: React.ReactNode;
  fx: FxState;
  onPlatform: (p: PlatformSel) => void;
  /** The client's model for one platform (same period/compare). */
  scoped: (p: Platform) => ClientModel;
  model: ClientModel;
  color: string;
  periodLabel: string;
  loading: LoadState;
  weekly: ClientWeekly | null;
  liveEnabled: boolean;
  onRefresh: () => void;
}) {
  // Each platform gets its own anomalies and suggestions; nothing is compared across platforms.
  const signals = useMemo(() => platformSignals(m, scoped), [m, scoped]);
  const isLoading = m.client.accountIds.some((id) => loading[id]?.status === "loading");
  const errors = m.client.accountIds.map((id) => loading[id]).filter((l) => l?.status === "error");

  if (!m.accounts.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{m.client.name}</h1>
        <Card className="p-6 text-sm text-slate-600">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Pulling ad account {m.client.accountIds.join(", ")} from Meta…
            </span>
          ) : (
            <>
              <p className="font-medium text-slate-900">No data for ad account {m.client.accountIds.join(", ")} yet.</p>
              <p className="mt-1">{errors[0]?.message ?? "This account is not in the MCP snapshot."}</p>
              {!liveEnabled && (
                <p className="mt-3 text-xs text-slate-500">
                  To pull new ad accounts on demand, set <code className="rounded bg-slate-100 px-1">META_ACCESS_TOKEN</code> (a system-user token with <code>ads_read</code>) in the
                  deployment&apos;s environment variables, or ask Claude to refresh the MCP snapshot with this ID.
                </p>
              )}
              <button onClick={onRefresh} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </>
          )}
        </Card>
      </div>
    );
  }

  const t = m.total;
  const p = m.prevTotal ? { ...m.prevTotal, reach: null } : null;
  const multi = m.accounts.length > 1;
  const blendedMulti = m.platform === "all" && m.byPlatform.length > 1;
  const hasMeta = m.accounts.some((a) => (a.platform ?? "meta") === "meta");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{m.client.name}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {periodLabel} · {rangeLabel(m.range)}
            {m.prevRange ? ` · vs ${rangeLabel(m.prevRange)}` : m.prevNote ? ` · ${m.prevNote}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.accounts.map((a) => (
              <Pill key={a.accountId} tone={a.source === "graph-api" ? "green" : "slate"} title={`${a.timezone ? `${a.timezone} · ` : ""}fetched ${new Date(a.fetchedAt).toLocaleString()}`}>
                {a.name} · {a.accountId} · {a.currency}
                {a.currency !== "IDR" ? " → IDR" : ""} · {a.source === "graph-api" ? "live" : a.source === "warehouse" ? "Data warehouse" : "snapshot"}
              </Pill>
            ))}
          </div>
        </div>
        {liveEnabled && (
          <button onClick={onRefresh} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh live
          </button>
        )}
      </div>

      {tabBar}

      {tab === "summary" && (
        <>
          {weekly && <WeeklySummary data={weekly} title={`${m.client.name} weekly summary`} />}

          {/* General KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <StatTile emphasis label="Amount spent" value={fmtIdr(t.spend)} delta={p ? delta(t.spend, p.spend) : undefined} neutralDelta />
            <StatTile label="Impressions" value={fmtInt(t.impressions)} delta={p ? delta(t.impressions, p.impressions) : undefined} />
            <StatTile
              label="Reach"
              value={fmtInt(t.reach)}
              sub={!hasMeta ? "not reported" : blendedMulti ? "Meta only" : t.reachIsSum ? "sum of accounts" : "deduplicated"}
              hint={METRICS.reach.help}
            />
            <StatTile label="Frequency" value={formatMetric("frequency", METRICS.frequency.get(t))} hint={METRICS.frequency.help} />
            <StatTile label="Link clicks" value={fmtInt(t.linkClicks)} delta={p ? delta(t.linkClicks, p.linkClicks) : undefined} />
            <StatTile label="CTR (link)" value={formatMetric("ctr", METRICS.ctr.get(t))} delta={p ? delta(METRICS.ctr.get(t), METRICS.ctr.get(p)) : undefined} />
            <StatTile label="CPM" value={formatMetric("cpm", METRICS.cpm.get(t))} delta={p ? delta(METRICS.cpm.get(t), METRICS.cpm.get(p)) : undefined} higherIsBetter={false} />
          </div>

          {blendedMulti && <PlatformBreakdown slices={m.byPlatform} hasPrev={!!m.prevRange} onPick={onPlatform} />}

          <Card>
            <CardHeader
              title="Insights & anomalies"
              subtitle={blendedMulti ? "Worked out per platform — each platform is judged on its own baseline and campaigns" : "What changed, what's wasting budget, and what to do next"}
            />
            <div className="max-h-[440px] overflow-y-auto scrollbar-thin">
              <SignalList signals={signals} limit={8} />
            </div>
          </Card>
        </>
      )}

      {tab === "performance" && (
        <>
          {/* General KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <StatTile emphasis label="Amount spent" value={fmtIdr(t.spend)} delta={p ? delta(t.spend, p.spend) : undefined} neutralDelta />
            <StatTile label="Impressions" value={fmtInt(t.impressions)} delta={p ? delta(t.impressions, p.impressions) : undefined} />
            <StatTile
              label="Reach"
              value={fmtInt(t.reach)}
              sub={!hasMeta ? "not reported" : blendedMulti ? "Meta only" : t.reachIsSum ? "sum of accounts" : "deduplicated"}
              hint={METRICS.reach.help}
            />
            <StatTile label="Frequency" value={formatMetric("frequency", METRICS.frequency.get(t))} hint={METRICS.frequency.help} />
            <StatTile label="Link clicks" value={fmtInt(t.linkClicks)} delta={p ? delta(t.linkClicks, p.linkClicks) : undefined} />
            <StatTile label="CTR (link)" value={formatMetric("ctr", METRICS.ctr.get(t))} delta={p ? delta(METRICS.ctr.get(t), METRICS.ctr.get(p)) : undefined} />
            <StatTile label="CPM" value={formatMetric("cpm", METRICS.cpm.get(t))} delta={p ? delta(METRICS.cpm.get(t), METRICS.cpm.get(p)) : undefined} higherIsBetter={false} />
          </div>

          <Card>
            <CardHeader
              title="Daily performance"
              subtitle={`IDR values converted at each month's FX rate${multi ? " · spend alone is stacked by ad account" : ""}`}
            />
            <div className="px-3 pb-3 pt-3 sm:px-4">
              <MetricExplorer m={m} fx={fx} color={color} />
            </div>
            <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Objective mix (detected from ad-set optimization)</div>
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                {m.groups.map((g, i) => (
                  <div key={g.key} style={{ width: `${g.spendShare * 100}%`, background: SERIES_COLORS[i] }} title={`${g.label} ${pct(g.spendShare)}`} />
                ))}
              </div>
              <div className="mt-2">
                <Legend items={m.groups.map((g, i) => ({ label: `${g.label} · ${pct(g.spendShare)} · ${fmtIdr(g.cur.spend)}`, color: SERIES_COLORS[i] }))} />
              </div>
            </div>
          </Card>

          {m.groups.map((g, i) => (
            <div key={g.key} className="space-y-3">
              {blendedMulti && m.groups[i - 1]?.platform !== g.platform && <PlatformHeader slice={m.byPlatform.find((x) => x.platform === g.platform)!} />}
              <GroupSection g={g} m={m} mode="performance" />
            </div>
          ))}
        </>
      )}

      {tab === "campaigns" && (
        <>
          {m.groups.map((g, i) => (
            <div key={g.key} className="space-y-3">
              {blendedMulti && m.groups[i - 1]?.platform !== g.platform && <PlatformHeader slice={m.byPlatform.find((x) => x.platform === g.platform)!} />}
              <GroupSection g={g} m={m} mode="campaigns" />
            </div>
          ))}

          <DormantCampaigns m={m} />
        </>
      )}

      {tab === "creatives" &&
        (hasMeta ? (
          <CreativeTable ads={m.ads} rangeDays={daysIn(m.range)} metaOnly={m.byPlatform.length > 1} />
        ) : (
          <Card className="p-6 text-sm text-slate-500">Ad-level creative data is only pulled for Meta accounts.</Card>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function rolling(vals: (number | null)[], nums: number[], dens: number[], win = 7, scale = 1): (number | null)[] {
  // True rolling ratio (Σnum ÷ Σden). Needs ≥3 days with a denominator in the
  // window, otherwise a lone attributed conversion on a no-spend stretch
  // produces a meaningless spike.
  return vals.map((_, i) => {
    let a = 0;
    let b = 0;
    let days = 0;
    for (let k = Math.max(0, i - win + 1); k <= i; k++) {
      a += nums[k];
      b += dens[k];
      if (dens[k] > 0) days++;
    }
    return b > 0 && days >= 3 ? (a / b) * scale : null;
  });
}

function GroupSection({ g, m, mode }: { g: GroupView; m: ClientModel; mode: "performance" | "campaigns" }) {
  const meta = GROUP_META[g.group];
  const prev = g.prev ? { ...g.prev, reach: null } : null;
  const volDef = METRICS[g.plan.volume];
  const effDef = METRICS[g.plan.efficiency];
  const dates = g.daily.map((d) => d.date);
  const [effMode, setEffMode] = useState<"daily" | "rolling">(dates.length > 14 ? "rolling" : "daily");

  // Efficiency = numerator / denominator; derive both so the rolling series is a
  // true 7-day ratio (sum ÷ sum), not an average of daily ratios.
  const effParts = ratioParts(g.plan.efficiency);
  const effDaily = g.daily.map((d) => effDef.get({ ...d, reach: null }));
  const effRolling = effParts ? rolling(effDaily, g.daily.map(effParts.num), g.daily.map(effParts.den), 7, effParts.scale) : effDaily;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {g.label !== meta.short && <span className="text-slate-400">{PLATFORM_LABEL[g.platform]} · </span>}
            {meta.label}
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-slate-500">{meta.why}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{pct(g.spendShare)} of spend</span>
          <span>·</span>
          <span>
            {g.campaigns.length} campaign{g.campaigns.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {g.group === "cpas" && m.sharedItems === "optimization-results" && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Shared-item figures come from each ad set&apos;s optimization result (the MCP doesn&apos;t expose the full catalog-segment breakdown): ATC-optimized ad sets report shared ATC, purchase-optimized
            ad sets report shared purchases + value. ROAS is therefore a <b>floor</b>. With <code>META_ACCESS_TOKEN</code> set, &quot;Refresh live&quot; pulls catalog_segment_actions for every campaign.
          </span>
        </div>
      )}

      {g.group === "cpas" && m.sharedItems === "verified" && <VerifiedNote m={m} />}

      {mode === "performance" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {g.plan.tiles.map((k) => {
              const def = METRICS[k];
              const v = def.get(g.cur);
              const pv = prev && k !== "reach" && k !== "frequency" ? def.get(prev) : null;
              return (
                <StatTile
                  key={k}
                  label={def.label}
                  value={formatMetric(def, v)}
                  delta={prev && k !== "reach" && k !== "frequency" ? delta(v, pv) : undefined}
                  higherIsBetter={def.higherIsBetter}
                  neutralDelta={k === "spend"}
                  hint={def.help}
                  sub={k === "reach" && g.cur.reachIsSum ? "sum of campaigns" : undefined}
                />
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={`Daily ${volDef.label.toLowerCase()}`} />
              <div className="px-3 pb-3 pt-4 sm:px-4">
                <TimeSeriesChart
                  dates={dates}
                  series={[{ key: "v", label: volDef.label, color: SERIES_COLORS[0], values: g.daily.map((d) => volDef.get({ ...d, reach: null })) }]}
                  type="stacked"
                  format={(v) => formatMetric(volDef, v)}
                  axisFormat={(v) => (volDef.format === "idr" ? fmtIdr(v).replace(/^Rp\s/, "") : fmtInt(v))}
                  height={200}
                />
              </div>
            </Card>
            <Card>
              <CardHeader
                title={`${effDef.label}${effMode === "rolling" ? " · 7-day rolling" : " · daily"}`}
                subtitle={effDef.higherIsBetter ? "Higher is better" : "Lower is better"}
                right={
                  <Segmented
                    size="sm"
                    value={effMode}
                    onChange={setEffMode}
                    options={[
                      { value: "rolling", label: "7-day" },
                      { value: "daily", label: "Daily" },
                    ]}
                  />
                }
              />
              <div className="px-3 pb-3 pt-4 sm:px-4">
                <TimeSeriesChart
                  dates={dates}
                  series={[{ key: "e", label: effDef.label, color: SERIES_COLORS[1], values: effMode === "rolling" ? effRolling : effDaily }]}
                  type="line"
                  format={(v) => formatMetric(effDef, v)}
                  axisFormat={(v) => (effDef.format === "idr" ? fmtIdr(v).replace(/^Rp\s/, "") : effDef.format === "x" ? `${v.toFixed(1)}×` : effDef.format === "pct" ? `${v.toFixed(1)}%` : fmtInt(v))}
                  height={200}
                />
              </div>
            </Card>
          </div>
        </>
      )}

      {mode === "campaigns" && <CampaignTable g={g} partialShared={m.sharedItems === "optimization-results"} />}
    </section>
  );
}

function VerifiedNote({ m }: { m: ClientModel }) {
  const cov = verifiedCoverage(m, m.range);
  const ranges = Array.from(new Set(cov.anchors.filter((a) => a.source.startsWith("Ads Manager")).map((a) => rangeLabel(a))));
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${cov.exact ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
      {cov.exact ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        {cov.exact ? (
          <>
            <b>Matches Ads Manager.</b> Shared-item ATC, purchases and purchase value include what ATC-optimized campaigns drove (and the ATC that purchase campaigns drove), locked from Ads Manager for{" "}
            {ranges.join(", ")}.
          </>
        ) : (
          <>
            Includes the purchases and revenue ATC-optimized campaigns drive. The locked Ads Manager totals cover {ranges.join(", ") || "another period"}, which this range doesn&apos;t line up with, so the
            cross-metrics here are allocated from those verified totals by daily spend (and extrapolated at the same ratio outside them) — treat them as <b>estimates</b>. Pick the verified period for exact
            figures, or connect META_ACCESS_TOKEN for exact daily numbers.
          </>
        )}
      </span>
    </div>
  );
}

function ratioParts(key: string): { num: (d: Counters) => number; den: (d: Counters) => number; scale: number } | null {
  const map: Record<string, [keyof Counters, keyof Counters, number]> = {
    cpm: ["spend", "impressions", 1000],
    cpl: ["spend", "leads", 1],
    cpConv: ["spend", "conversations", 1],
    cpSharedAtc: ["spend", "sharedAtc", 1],
    cpSharedPurchase: ["spend", "sharedPurchases", 1],
    sharedRoas: ["sharedPurchaseValue", "spend", 1],
    roas: ["purchaseValue", "spend", 1],
    cpa: ["spend", "purchases", 1],
    cpc: ["spend", "linkClicks", 1],
    cpLpv: ["spend", "lpv", 1],
    cpProfileVisit: ["spend", "profileVisits", 1],
    ctr: ["linkClicks", "impressions", 100],
  };
  const hit = map[key];
  if (!hit) return null;
  return { num: (d) => d[hit[0]] ?? 0, den: (d) => d[hit[1]] ?? 0, scale: hit[2] };
}

function CampaignStatus({ c }: { c: CampaignView }) {
  if (c.inactiveButSpent)
    return (
      <Pill tone="amber" title={`Last spend ${c.lastSpendDate ? fmtDate(c.lastSpendDate) : "—"} — included in totals`}>
        {c.isActive ? "Not delivering" : statusLabel(c.status)} · spent in window
      </Pill>
    );
  if (c.isActive) return <Pill tone="green">Active</Pill>;
  return <Pill tone="slate">{statusLabel(c.status)}</Pill>;
}

// In MCP-snapshot mode an ATC-optimized CPAS campaign can't see shared
// purchases (and vice versa) — show "n/a" rather than a misleading zero.
const ATC_ONLY_HIDDEN = new Set(["sharedPurchases", "sharedPurchaseValue", "sharedRoas", "cpSharedPurchase"]);
const PURCHASE_ONLY_HIDDEN = new Set(["sharedAtc", "cpSharedAtc"]);

function CampaignTable({ g, partialShared }: { g: GroupView; partialShared: boolean }) {
  const cols = Array.from(new Set([g.plan.result, g.plan.costPerResult, ...(g.group === "cpas" ? ["sharedAtc", "sharedPurchases", "sharedPurchaseValue", "sharedRoas"] : []), ...(g.group === "awareness" ? ["reach", "frequency"] : ["ctr"]), "cpm"])).filter(
    (k) => k !== "spend"
  );
  const cpr = METRICS[g.plan.costPerResult];
  return (
    <Card>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium sm:px-5">Campaign</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Daily budget</th>
              <th className="px-3 py-2 text-right font-medium">Spend</th>
              <th className="w-24 px-3 py-2 font-medium">Share</th>
              {cols.map((k) => (
                <th key={k} className="px-3 py-2 text-right font-medium">
                  {METRICS[k].label}
                </th>
              ))}
              {g.prev && <th className="px-3 py-2 text-right font-medium">Δ {cpr.label.replace("Cost per ", "C/")}</th>}
            </tr>
          </thead>
          <tbody>
            {g.campaigns.map((c) => {
              const cur = c.cur;
              return (
                <tr key={c.id} className={`border-b border-slate-50 ${c.inactiveButSpent ? "bg-amber-50/30" : ""}`}>
                  <td className="max-w-[320px] px-4 py-2.5 sm:px-5">
                    <div className="truncate font-medium text-slate-800" title={c.name}>
                      {shortName(c.name)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {c.accountName} · {c.activeDays}d with spend
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <CampaignStatus c={c} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{c.dailyBudgetIdr ? fmtIdr(c.dailyBudgetIdr) : /^\d+$/.test(c.accountId) && !c.objective.startsWith("TIKTOK") ? "ad-set" : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtIdr(cur.spend)}</td>
                  <td className="px-3 py-2.5">
                    <ShareBar share={g.cur.spend ? cur.spend / g.cur.spend : 0} />
                  </td>
                  {cols.map((k) => {
                    const hidden = partialShared && ((c.resultKind === "sharedAtc" && ATC_ONLY_HIDDEN.has(k)) || (c.resultKind === "sharedPurchase" && PURCHASE_ONLY_HIDDEN.has(k)));
                    return (
                      <td key={k} className="px-3 py-2.5 text-right tabular-nums text-slate-700" title={hidden ? "Not exposed for this ad set's optimization event in the MCP snapshot" : undefined}>
                        {hidden ? <span className="text-slate-300">n/a</span> : formatMetric(METRICS[k], METRICS[k].get(cur))}
                      </td>
                    );
                  })}
                  {g.prev && (
                    <td className="px-3 py-2.5 text-right">
                      <Delta value={c.prev ? delta(cpr.get(cur), cpr.get({ ...c.prev, reach: null })) : null} higherIsBetter={cpr.higherIsBetter} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DormantCampaigns({ m }: { m: ClientModel }) {
  const dormant = m.campaigns.filter((c) => c.dormantInWindow);
  if (!dormant.length) return null;
  return (
    <Card>
      <CardHeader
        title="Campaigns with no spend in this window"
        subtitle="They spent earlier in the last 90 days — switch to a longer window to include them."
      />
      <ul className="divide-y divide-slate-50 text-sm">
        {dormant.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
            <span className="text-slate-700">{shortName(c.name)}</span>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <Pill tone="slate">{statusLabel(c.status)}</Pill>
              last spend {c.lastSpendDate ? fmtDate(c.lastSpendDate) : "—"} · {GROUP_META[c.group].short}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const FLAG_FILTERS: { value: "all" | AdFlag; label: string }[] = [
  { value: "all", label: "All" },
  { value: "absorber", label: "Absorbers" },
  { value: "noResults", label: "No results" },
  { value: "fatigue", label: "Fatigue" },
  { value: "lowCtr", label: "Low CTR" },
  { value: "winner", label: "Winners" },
];

function CreativeTable({ ads, rangeDays, metaOnly }: { ads: AdView[]; rangeDays: number; metaOnly?: boolean }) {
  const [filter, setFilter] = useState<"all" | AdFlag>("all");
  const shown = filter === "all" ? ads : ads.filter((a) => a.flags.includes(filter));
  const adWindow = ads[0]?.window ?? (rangeDays <= 7 ? "7d" : "30d");
  const wasted = ads.filter((a) => a.flags.includes("absorber") || a.flags.includes("noResults")).reduce((s, a) => s + a.spendIdr, 0);
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-slate-400" /> Creative diagnostics{metaOnly ? " · Meta ads" : ""}
          </span>
        }
        subtitle={`Top ${ads.length} ads by spend, last ${adWindow === "7d" ? "7" : "30"} days${rangeDays !== (adWindow === "7d" ? 7 : 30) ? ` (ad-level data covers fixed 7/30-day windows; your range is ${rangeDays} days)` : ""}. Each ad is compared with peers that optimize for the same result.`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {wasted > 0 && <Pill tone="red" icon={AlertTriangle}>{fmtIdr(wasted)} on absorbers</Pill>}
            <Segmented size="sm" value={filter} onChange={setFilter} options={FLAG_FILTERS.map((f) => ({ ...f, label: f.value === "all" ? `All ${ads.length}` : `${f.label} ${ads.filter((a) => a.flags.includes(f.value as AdFlag)).length}` }))} />
          </div>
        }
      />
      <div className="max-h-[560px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium sm:px-5">Ad</th>
              <th className="px-3 py-2 text-right font-medium">Spend</th>
              <th className="w-20 px-3 py-2 font-medium">Share</th>
              <th className="px-3 py-2 text-right font-medium">Result</th>
              <th className="px-3 py-2 text-right font-medium">Cost / result</th>
              <th className="px-3 py-2 text-right font-medium">vs peers</th>
              <th className="px-3 py-2 text-right font-medium">CTR</th>
              <th className="px-3 py-2 text-right font-medium">CTR 7d</th>
              <th className="px-3 py-2 text-right font-medium">Freq.</th>
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const vsPeers = a.costPerResult !== null && a.peerMedianCost ? a.costPerResult / a.peerMedianCost : null;
              return (
                <tr key={a.id} className="border-b border-slate-50 align-top">
                  <td className="max-w-[340px] px-4 py-2.5 sm:px-5">
                    <a href={a.adsManagerUrl} target="_blank" rel="noreferrer" className="group inline-flex max-w-full items-center gap-1 font-medium text-slate-800 hover:underline" title={a.name}>
                      <span className="truncate">{trunc(a.name, 60)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
                    </a>
                    <div className="truncate text-[11px] text-slate-400" title={`${a.campaignName} › ${a.adsetName}`}>
                      {shortName(a.campaignName)} › {a.adsetName}
                    </div>
                    {a.flags.length > 0 && <p className="mt-1 text-[11px] leading-snug text-slate-600">{AD_FLAG_META[a.flags[0]].action}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtIdr(a.spendIdr)}</td>
                  <td className="px-3 py-2.5">
                    <ShareBar share={a.spendShare} />
                    <div className="mt-1 text-[10px] tabular-nums text-slate-400">{pct(a.spendShare, 1)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {a.resultCount !== null ? fmtInt(a.resultCount) : "—"}
                    <div className="text-[10px] text-slate-400">{a.resultLabel}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtIdr(a.costPerResult)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${vsPeers === null ? "text-slate-300" : vsPeers >= 1.5 ? "text-red-600" : vsPeers <= 0.7 ? "text-emerald-600" : "text-slate-600"}`}>
                    {vsPeers === null ? "—" : `${vsPeers.toFixed(2)}×`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{a.ctr !== null ? `${a.ctr.toFixed(2)}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{a.ctr7 !== null ? `${a.ctr7.toFixed(2)}%` : "—"}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${a.frequency >= 3 ? "text-amber-700" : "text-slate-500"}`}>{a.frequency ? a.frequency.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {a.flags.map((f) => (
                        <Pill key={f} tone={AD_FLAG_META[f].tone}>
                          {AD_FLAG_META[f].label}
                        </Pill>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-sm text-slate-400">
                  No ads match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Platform split (blended view of a multi-platform client)

function PlatformBreakdown({ slices, hasPrev, onPick }: { slices: PlatformSlice[]; hasPrev: boolean; onPick: (p: PlatformSel) => void }) {
  return (
    <Card>
      <CardHeader title="By platform" subtitle="Each platform's spend and its own main result — open one to see only its campaigns and suggestions" />
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium sm:px-5">Platform</th>
              <th className="px-3 py-2 text-right font-medium">Spend</th>
              <th className="w-28 px-3 py-2 font-medium">Share</th>
              <th className="px-3 py-2 text-right font-medium">Impressions</th>
              <th className="px-3 py-2 text-right font-medium">Clicks</th>
              <th className="px-3 py-2 text-right font-medium">CPM</th>
              <th className="px-3 py-2 text-right font-medium">Main result</th>
              <th className="px-3 py-2 text-right font-medium">Cost / result</th>
              <th className="px-4 py-2 sm:px-5" />
            </tr>
          </thead>
          <tbody>
            {slices.map((sl, i) => {
              const a = { ...sl.cur, reach: null };
              const pa = sl.prev ? { ...sl.prev, reach: null } : null;
              const g = sl.primary;
              const rd = g ? METRICS[g.plan.result] : null;
              const cd = g ? METRICS[g.plan.costPerResult] : null;
              return (
                <tr key={sl.platform} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900 sm:px-5">{PLATFORM_LABEL[sl.platform]}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="font-semibold">{fmtIdr(sl.cur.spend)}</div>
                    {hasPrev && pa && <Delta value={delta(sl.cur.spend, pa.spend)} neutral />}
                  </td>
                  <td className="px-3 py-2.5">
                    <ShareBar share={sl.spendShare} color={SERIES_COLORS[i]} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(sl.cur.impressions)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(sl.cur.linkClicks)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatMetric("cpm", METRICS.cpm.get(a))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {g && rd ? (
                      <>
                        {formatMetric(rd, rd.get(g.cur))} <span className="text-xs text-slate-400">{rd.label.toLowerCase()}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{g && cd ? formatMetric(cd, cd.get(g.cur)) : "—"}</td>
                  <td className="px-4 py-2.5 text-right sm:px-5">
                    <button onClick={() => onPick(sl.platform)} className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
                      Open {PLATFORM_LABEL[sl.platform]} →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlatformHeader({ slice }: { slice: PlatformSlice }) {
  return (
    <div className="flex items-baseline justify-between border-b-2 border-slate-900 pb-1.5 pt-4">
      <h2 className="text-lg font-semibold text-slate-900">{PLATFORM_LABEL[slice.platform]}</h2>
      <span className="text-xs text-slate-500">
        {fmtIdr(slice.cur.spend)} · {pct(slice.spendShare)} of spend
      </span>
    </div>
  );
}
