// Weekly (Mon–Sun) written summaries, generated from the data in code — no
// AI call at view time. Always covers the most recent complete Monday–Sunday
// week in the loaded data, compared with the Monday–Sunday before it,
// independent of the period picker.

import type { FxState } from "./fx";
import {
  METRICS,
  SEVERITY_RANK,
  addDaysIso,
  buildClientModel,
  platformSignals,
  fmtDate,
  fmtIdr,
  fmtInt,
  formatMetric,
  inRange,
  rangeLabel,
  shortName,
  trunc,
  type ClientModel,
  type DateRange,
  type DailyPoint,
  type PlatformSel,
  type Signal,
} from "./analysis";
import type { AccountSnapshot, ClientConfig } from "./types";

export interface WeeklyLine {
  text: string;
  tone?: "good" | "bad" | "neutral";
}

export interface ClientWeekly {
  clientId: string;
  clientName: string;
  week: DateRange;
  prevWeek: DateRange | null;
  hasData: boolean;
  headline: string;
  oneLiner: string; // for the portfolio roll-up
  spend: number;
  prevSpend: number;
  spendDelta: number | null;
  /** True when something in the week needs action (bad anomaly, gap, efficiency slide). */
  needsAttention: boolean;
  performance: WeeklyLine[];
  anomalies: WeeklyLine[];
  suggestions: Signal[];
  creativeNote: string | null;
}

export interface PortfolioWeekly {
  week: DateRange;
  prevWeek: DateRange | null;
  headline: string;
  highlights: WeeklyLine[];
  clients: ClientWeekly[];
  suggestions: Signal[];
}

/** Latest complete Monday–Sunday week ending on or before `endDate`. */
export function lastFullWeek(endDate: string): DateRange {
  const dow = new Date(`${endDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const sunday = addDaysIso(endDate, -dow);
  return { start: addDaysIso(sunday, -6), end: sunday };
}

/** Week-over-week change, suppressed when the previous week is too thin to compare. */
function wow(cur: number | null, prev: number | null, minPrev = 0): number | null {
  if (cur === null || prev === null || !(prev > minPrev)) return null;
  const d = (cur - prev) / prev;
  return Math.abs(d) > 5 ? null : d; // >500% swings come from near-empty weeks
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const signedPct = (d: number | null, digits = 0) => (d === null ? "" : `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(digits)}%`);
const vsPrev = (d: number | null) => (d === null ? "" : ` (${signedPct(d)} vs previous week)`);
const toneFor = (d: number | null, higherIsBetter: boolean, threshold = 0.1): WeeklyLine["tone"] =>
  d === null || Math.abs(d) < threshold ? "neutral" : d > 0 === higherIsBetter ? "good" : "bad";

function weekday(iso: string) {
  return fmtDate(iso, { weekday: "short", month: "short", day: "numeric" });
}

/** Days inside the week that sit far outside the previous 4 weeks' range. */
function weekAnomalies(series: DailyPoint[], week: DateRange, keys: string[]): WeeklyLine[] {
  const baseR = { start: addDaysIso(week.start, -28), end: addDaysIso(week.start, -1) };
  const base = series.filter((d) => inRange(d.date, baseR) && d.spend > 0);
  const days = series.filter((d) => inRange(d.date, week));
  const out: { line: WeeklyLine; score: number }[] = [];
  if (base.length < 10) return [];

  // Delivery gaps
  const zero = days.filter((d) => d.spend === 0).map((d) => d.date);
  if (zero.length && base.length) {
    out.push({
      line: { text: `No delivery on ${zero.length === 7 ? "any day this week" : zero.map((d) => weekday(d)).join(", ")}.`, tone: "bad" },
      score: 10,
    });
  }
  for (const key of keys) {
    const def = METRICS[key];
    if (!def) continue;
    const vals = base.map((d) => def.get({ ...d, reach: null })).filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length < 10) continue;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    if (!(mean > 0)) continue;
    for (const d of days) {
      if (d.spend === 0) continue;
      const v = def.get({ ...d, reach: null });
      if (v === null || !Number.isFinite(v)) continue;
      const z = std > 0 ? (v - mean) / std : 0;
      const ratio = v / mean;
      if (Math.abs(z) < 2.5 || (ratio > 0.6 && ratio < 1.5)) continue;
      const up = v > mean;
      const tone: WeeklyLine["tone"] = key === "spend" ? "neutral" : up === def.higherIsBetter ? "good" : "bad";
      out.push({
        line: {
          text: `${weekday(d.date)}: ${def.label} ${formatMetric(def, v)}, ${ratio >= 1 ? `${ratio.toFixed(1)}×` : `${Math.round((1 - ratio) * 100)}% below`} the 4-week norm (${formatMetric(def, mean)}).`,
          tone,
        },
        score: Math.abs(z) + (tone === "bad" ? 1 : 0),
      });
    }
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.line);
}

export function buildClientWeekly(
  client: ClientConfig,
  accounts: Record<string, AccountSnapshot>,
  fx: FxState,
  platform: PlatformSel = "all"
): ClientWeekly | null {
  const accs = client.accountIds.map((id) => accounts[id]).filter((a) => a && (platform === "all" || (a.platform ?? "meta") === platform));
  if (!accs.length) return null;
  // Same week whichever platform is in scope: the client's last full week.
  const endDate = client.accountIds.map((id) => accounts[id]?.endDate).filter(Boolean).sort().pop()!;
  const week = lastFullWeek(endDate);
  const weekPeriod = { key: "custom", start: week.start, end: week.end } as const;
  const m: ClientModel = buildClientModel(client, accounts, fx, weekPeriod, true, platform);
  // Wider model for anomaly baselines (4 weeks before + the week).
  const wide = buildClientModel(client, accounts, fx, { key: "custom", start: addDaysIso(week.start, -28), end: week.end }, false, platform);

  const t = m.total;
  const p = m.prevTotal ? { ...m.prevTotal, reach: null } : null;
  const prevSpend = p?.spend ?? 0;
  // Only compare weeks when the previous one had meaningful delivery.
  const comparable = !!p && prevSpend > 0.3 * t.spend;
  const spendDelta = p ? wow(t.spend, prevSpend) : null;
  const active = m.campaigns.filter((c) => c.cur.spend > 0);
  const hasData = t.spend > 0 || t.impressions > 0;
  const name = client.name;

  if (!hasData) {
    return {
      clientId: client.id,
      clientName: name,
      week,
      prevWeek: m.prevRange,
      hasData,
      headline: `No spend in ${rangeLabel(week)}.`,
      oneLiner: `${name}: no delivery this week.`,
      spend: 0,
      prevSpend,
      spendDelta,
      needsAttention: prevSpend > 0,
      performance: [],
      anomalies: [],
      suggestions: [],
      creativeNote: null,
    };
  }

  // Headline: spend + primary objective outcome
  const g = m.groups[0];
  const resultDef = g ? METRICS[g.plan.result] : null;
  const costDef = g ? METRICS[g.plan.costPerResult] : null;
  const resultVal = g && resultDef ? resultDef.get(g.cur) : null;
  const costVal = g && costDef ? costDef.get(g.cur) : null;
  const costDelta = comparable && g?.prev && costDef ? wow(costVal, costDef.get({ ...g.prev, reach: null })) : null;
  const resultDelta = comparable && g?.prev && resultDef ? wow(resultVal, resultDef.get({ ...g.prev, reach: null }), 2) : null;
  const outcome =
    g && resultDef && costDef && g.plan.result !== "impressions"
      ? ` ${g.label}: ${formatMetric(resultDef, resultVal)} ${resultDef.label.toLowerCase()}${resultDelta !== null ? ` (${signedPct(resultDelta)})` : ""} at ${formatMetric(costDef, costVal)} ${costDef.label.toLowerCase().replace("cost per ", "per ")}${costDelta !== null ? ` (${signedPct(costDelta)})` : ""}.`
      : g && costDef
        ? ` ${g.label}: ${fmtInt(g.cur.impressions)} impressions at ${formatMetric(costDef, costVal)} CPM${costDelta !== null ? ` (${signedPct(costDelta)})` : ""}.`
        : "";
  const roas = g?.group === "cpas" ? METRICS.sharedRoas.get(g.cur) : null;
  const thinPrev = !!p && !comparable;
  const headline = `Spent ${fmtIdr(t.spend)}${vsPrev(spendDelta)} across ${plural(active.length, "campaign")}${
    thinPrev ? ` (the previous week had ${prevSpend > 0 ? `only ${fmtIdr(prevSpend)} of spend` : "no delivery"}, so changes aren't compared)` : ""
  }.${outcome}${
    roas !== null ? ` Shared-item ROAS ${roas.toFixed(2)}×.` : ""
  }`;

  // Performance lines
  const performance: WeeklyLine[] = [];
  const impD = comparable && p ? wow(t.impressions, p.impressions) : null;
  const ctrNow = METRICS.ctr.get(t);
  const ctrPrev = comparable && p ? METRICS.ctr.get(p) : null;
  const cpmNow = METRICS.cpm.get(t);
  const cpmD = comparable && p ? wow(cpmNow, METRICS.cpm.get(p)) : null;
  performance.push({
    text: `Delivery: ${fmtInt(t.impressions)} impressions${impD !== null ? ` (${signedPct(impD)})` : ""}, ${fmtInt(t.linkClicks)} link clicks, CTR ${formatMetric("ctr", ctrNow)}${
      ctrPrev !== null && ctrNow !== null ? ` (${ctrNow >= ctrPrev ? "+" : "−"}${Math.abs(ctrNow - ctrPrev).toFixed(2)} pt)` : ""
    }, CPM ${formatMetric("cpm", cpmNow)}${cpmD !== null ? ` (${signedPct(cpmD)})` : ""}.`,
    tone: toneFor(cpmD, false, 0.15),
  });
  for (const grp of m.groups.slice(1)) {
    const rd = METRICS[grp.plan.result];
    const cd = METRICS[grp.plan.costPerResult];
    const cdD = comparable && grp.prev ? wow(cd.get(grp.cur), cd.get({ ...grp.prev, reach: null })) : null;
    performance.push({
      text: `${grp.label} (${Math.round(grp.spendShare * 100)}% of spend): ${formatMetric(rd, rd.get(grp.cur))} ${rd.label.toLowerCase()}, ${cd.label} ${formatMetric(cd, cd.get(grp.cur))}${
        cdD !== null ? ` (${signedPct(cdD)})` : ""
      }.`,
      tone: toneFor(cdD, cd.higherIsBetter, 0.15),
    });
  }
  if (g && costDef && g.plan.result !== "impressions") {
    const ranked = g.campaigns
      .filter((c) => c.cur.spend > 0.1 * g.cur.spend)
      .map((c) => ({ c, v: costDef.get(c.cur) }))
      .filter((x): x is { c: typeof x.c; v: number } => x.v !== null);
    if (ranked.length >= 2) {
      ranked.sort((a, b) => (costDef.higherIsBetter ? b.v - a.v : a.v - b.v));
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      performance.push({
        text: `Most efficient: ${shortName(best.c.name)} (${formatMetric(costDef, best.v)}). Least efficient: ${shortName(worst.c.name)} (${formatMetric(costDef, worst.v)}, ${Math.round(
          (worst.c.cur.spend / g.cur.spend) * 100
        )}% of ${g.label} spend).`,
      });
    }
  }
  const stopped = m.campaigns.filter((c) => c.inactiveButSpent);
  if (stopped.length)
    performance.push({ text: `Stopped during the week but counted: ${stopped.map((c) => shortName(c.name)).join(", ")}.`, tone: "neutral" });
  if (m.sharedItems === "verified" && g?.group === "cpas")
    performance.push({ text: "CPAS purchases/revenue from ATC campaigns this week are estimated from the locked Ads Manager ratios (MCP limitation).", tone: "neutral" });

  // Anomalies
  const wg = g ? wide.groups.find((x) => x.key === g.key) : null;
  const anomalies = weekAnomalies(wide.daily, week, ["spend", "cpm", "ctr"]);
  if (wg && g && g.plan.result !== "impressions") {
    for (const l of weekAnomalies(wg.daily, week, [g.plan.costPerResult])) if (!anomalies.some((a) => a.text === l.text)) anomalies.push(l);
  }

  // Suggestions (reuse the insight engine on the week)
  // Per platform for multi-platform clients, so a Google campaign is never
  // compared with (or told to take budget from) a Meta one.
  const suggestions = platformSignals(m, (pf) => buildClientModel(client, accounts, fx, weekPeriod, true, pf), false)
    .filter((s) => s.action && s.kind !== "data")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 4);

  const adWin = m.ads[0]?.window;
  const flagged = m.ads.filter((a) => a.flags.length);
  const creativeNote = m.ads.length
    ? `Creatives (${adWin === "7d" ? "last 7 days of ad data" : "last 30 days of ad data"}): ${plural(
        flagged.filter((a) => a.flags.includes("absorber") || a.flags.includes("noResults")).length,
        "budget absorber"
      )}, ${flagged.filter((a) => a.flags.includes("fatigue")).length} fatigued, ${plural(flagged.filter((a) => a.flags.includes("winner")).length, "winner")}.`
    : null;

  const oneLiner = `${name}: ${fmtIdr(t.spend)}${spendDelta !== null ? ` (${signedPct(spendDelta)})` : ""}${
    g && costDef && g.plan.result !== "impressions" && resultDef
      ? ` · ${m.byPlatform.length > 1 ? `${g.label}: ` : ""}${formatMetric(resultDef, resultVal)} ${resultDef.label.toLowerCase()} @ ${formatMetric(costDef, costVal)}${costDelta !== null ? ` (${signedPct(costDelta)})` : ""}`
      : ` · CPM ${formatMetric("cpm", cpmNow)}`
  }${anomalies.filter((a) => a.tone === "bad").length ? ` · ${anomalies.filter((a) => a.tone === "bad").length} issue${anomalies.filter((a) => a.tone === "bad").length > 1 ? "s" : ""}` : ""}`;

  const needsAttention =
    anomalies.some((a) => a.tone === "bad") || (costDelta !== null && costDef !== null && (costDef.higherIsBetter ? costDelta < -0.2 : costDelta > 0.2));

  return {
    clientId: client.id,
    clientName: name,
    week,
    prevWeek: m.prevRange,
    hasData,
    headline,
    oneLiner,
    spend: t.spend,
    prevSpend,
    spendDelta,
    needsAttention,
    performance,
    anomalies,
    suggestions,
    creativeNote,
  };
}

export function buildPortfolioWeekly(
  clients: ClientConfig[],
  accounts: Record<string, AccountSnapshot>,
  fx: FxState,
  platform: PlatformSel = "all"
): PortfolioWeekly | null {
  const weeks = clients.map((c) => buildClientWeekly(c, accounts, fx, platform)).filter((w): w is ClientWeekly => !!w);
  if (!weeks.length) return null;
  // Use the most common week (all accounts normally share an end date).
  const week = weeks[0].week;
  const same = weeks.filter((w) => w.week.start === week.start);
  const spend = same.reduce((s, w) => s + w.spend, 0);
  const prevSpend = same.reduce((s, w) => s + w.prevSpend, 0);
  const d = prevSpend > 0 ? (spend - prevSpend) / prevSpend : null;
  const movers = same.filter((w) => w.spendDelta !== null && w.spend > 0).sort((a, b) => (b.spendDelta ?? 0) - (a.spendDelta ?? 0));
  const issues = same.filter((w) => w.needsAttention);

  const highlights: WeeklyLine[] = [];
  if (movers.length >= 2) {
    const up = movers[0];
    const down = movers[movers.length - 1];
    if ((up.spendDelta ?? 0) > 0.05) highlights.push({ text: `Biggest spend increase: ${up.clientName} ${signedPct(up.spendDelta)}.`, tone: "neutral" });
    if ((down.spendDelta ?? 0) < -0.05) highlights.push({ text: `Biggest spend drop: ${down.clientName} ${signedPct(down.spendDelta)}.`, tone: "neutral" });
  }
  const resumed = same.filter((w) => w.spend > 0 && w.prevSpend < 0.3 * w.spend);
  if (resumed.length)
    highlights.push({
      text: `Resumed or ramped up from a quiet week: ${resumed.map((w) => `${w.clientName} (${fmtIdr(w.prevSpend)} → ${fmtIdr(w.spend)})`).join(", ")}${d !== null && d > 0.1 ? " — most of the portfolio increase" : ""}.`,
      tone: "neutral",
    });
  const idle = same.filter((w) => !w.hasData).map((w) => w.clientName);
  if (idle.length) highlights.push({ text: `No delivery: ${idle.join(", ")}.`, tone: "bad" });
  highlights.push(
    issues.length
      ? { text: `Needs attention: ${issues.map((w) => w.clientName).join(", ")}.`, tone: "bad" }
      : { text: "No client had a serious anomaly this week.", tone: "good" }
  );

  // Most severe first, at most one per client and two creative-type tips, so
  // the list covers the portfolio instead of repeating one recommendation.
  const ranked = same.flatMap((w) => w.suggestions).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.kind === "creative" ? 1 : 0) - (b.kind === "creative" ? 1 : 0));
  const suggestions: Signal[] = [];
  const perClient = new Map<string, number>();
  let creative = 0;
  for (const s of ranked) {
    if (suggestions.length >= 6) break;
    if ((perClient.get(s.clientId) ?? 0) >= 1) continue;
    if (s.kind === "creative" && creative >= 2) continue;
    suggestions.push(s);
    perClient.set(s.clientId, (perClient.get(s.clientId) ?? 0) + 1);
    if (s.kind === "creative") creative++;
  }

  return {
    week,
    prevWeek: weeks[0].prevWeek,
    headline: `The portfolio spent ${fmtIdr(spend)}${vsPrev(d)} across ${same.filter((w) => w.hasData).length} active clients in ${rangeLabel(week)}.`,
    highlights,
    clients: same,
    suggestions,
  };
}

/** Plain-text version for pasting into chat / email. */
export function weeklyToText(w: ClientWeekly | PortfolioWeekly, title: string): string {
  const lines: string[] = [`${title} — week of ${rangeLabel(w.week)}`, "", w.headline.replace(/ /g, " ")];
  if ("clients" in w) {
    lines.push("", ...w.highlights.map((h) => `• ${h.text}`), "", "By client:", ...w.clients.map((c) => `• ${c.oneLiner}`));
  } else {
    lines.push("", ...w.performance.map((l) => `• ${l.text}`));
    if (w.creativeNote) lines.push(`• ${w.creativeNote}`);
    if (w.anomalies.length) lines.push("", "Anomalies:", ...w.anomalies.map((a) => `• ${a.text}`));
  }
  if (w.suggestions.length)
    lines.push("", "Suggested next steps:", ...w.suggestions.map((s) => `• ${"clients" in w ? `${s.clientName}: ` : ""}${s.title} — ${trunc(s.action ?? "", 220)}`));
  return lines.join("\n").replace(/ /g, " ");
}
