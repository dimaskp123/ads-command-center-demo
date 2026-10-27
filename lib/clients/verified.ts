// Verified CPAS shared-item figures ("locked" reference numbers).
//
// Why this exists: Meta reports CPAS conversions as catalog_segment_actions /
// catalog_segment_value. The Ads MCP only exposes those through each ad
// set's optimization `result`, so an ATC-optimized campaign shows its shared
// ATC but not the shared purchases + revenue it also drives, and a
// purchase-optimized campaign shows purchases but not its shared ATC.
// Ads Manager shows all of them. The numbers below were read from Ads Manager
// (or from the MCP's campaign-level purchase result) and are treated as truth.
//
// How they're applied (see applyVerified):
//  - Metrics the MCP already reports per day are left untouched.
//  - A missing metric is filled day-by-day: inside each anchor's date range
//    the anchor total is spread across days in proportion to spend, so any
//    window that equals the anchor range reproduces Ads Manager exactly.
//    Nested anchors (e.g. 7d inside 30d inside 90d) are honoured smallest-first.
//  - Days outside every anchor are estimated with the nearest anchor's
//    metric-per-spend ratio and the UI labels those figures as estimates.
//  - When live Graph API data (sharedItems === "full") is loaded, none of this
//    is used — catalog_segment_* fields give exact daily numbers.
//
// To lock new numbers: add an entry (native account currency, inclusive dates).

import type { AccountSnapshot, Counters } from "./types";

export type SharedMetric = "sharedAtc" | "sharedPurchases" | "sharedPurchaseValue";
export const SHARED_METRICS: SharedMetric[] = ["sharedAtc", "sharedPurchases", "sharedPurchaseValue"];

export interface VerifiedAnchor {
  accountId: string;
  campaignId: string;
  campaignName: string;
  start: string;
  end: string;
  metrics: Partial<Record<SharedMetric, number>>;
  source: string;
}

export const VERIFIED_ANCHORS: VerifiedAnchor[] = [];

const days = (a: VerifiedAnchor) => Math.round((Date.parse(a.end) - Date.parse(a.start)) / 86_400_000) + 1;
const within = (d: string, a: { start: string; end: string }) => d >= a.start && d <= a.end;

/** Metrics the MCP already reports per day for a campaign's own optimization event. */
function knownMetrics(kind: string): SharedMetric[] {
  if (kind === "sharedAtc") return ["sharedAtc"];
  if (kind === "sharedPurchase") return ["sharedPurchases", "sharedPurchaseValue"];
  return [];
}

export function applyVerified(snap: AccountSnapshot, anchors: VerifiedAnchor[] = VERIFIED_ANCHORS): AccountSnapshot {
  if (snap.sharedItems === "full") return snap;
  const mine = anchors.filter((a) => a.accountId === snap.accountId);
  if (!mine.length) return snap;

  const campaignDaily = snap.campaignDaily.map((r) => ({ ...r }));
  const daily = snap.daily.map((r) => ({ ...r }));
  const dailyByDate = new Map(daily.map((r) => [r.date, r]));
  const estimatedRanges: { campaignId: string; metric: SharedMetric; dates: string[] }[] = [];

  for (const campaign of snap.campaigns) {
    const cAnchors = mine.filter((a) => a.campaignId === campaign.id);
    if (!cAnchors.length) continue;
    const rows = campaignDaily.filter((r) => r.campaignId === campaign.id);
    const known = knownMetrics(campaign.resultKind);

    for (const metric of SHARED_METRICS) {
      if (known.includes(metric)) continue;
      const withMetric = cAnchors.filter((a) => a.metrics[metric] !== undefined).sort((a, b) => days(a) - days(b));
      if (!withMetric.length) continue;

      const assigned = new Map<string, number>();
      for (const a of withMetric) {
        const inRange = rows.filter((r) => within(r.date, a));
        const already = inRange.reduce((s, r) => s + (assigned.get(r.date) ?? 0), 0);
        const open = inRange.filter((r) => !assigned.has(r.date));
        const remaining = Math.max(0, (a.metrics[metric] ?? 0) - already);
        const spend = open.reduce((s, r) => s + r.spend, 0);
        for (const r of open) {
          const share = spend > 0 ? r.spend / spend : open.length ? 1 / open.length : 0;
          assigned.set(r.date, remaining * share);
        }
      }
      // Outside every anchor → estimate from the widest anchor's ratio to spend.
      const widest = withMetric[withMetric.length - 1];
      const wSpend = rows.filter((r) => within(r.date, widest)).reduce((s, r) => s + r.spend, 0);
      const perSpend = wSpend > 0 ? (widest.metrics[metric] ?? 0) / wSpend : 0;
      const estDates: string[] = [];
      for (const r of rows) {
        if (!assigned.has(r.date) && r.spend > 0 && perSpend > 0) {
          assigned.set(r.date, r.spend * perSpend);
          estDates.push(r.date);
        }
      }
      if (estDates.length) estimatedRanges.push({ campaignId: campaign.id, metric, dates: estDates });

      for (const r of rows) {
        const v = assigned.get(r.date);
        if (v === undefined) continue;
        (r as Counters)[metric] += v;
        const d = dailyByDate.get(r.date);
        if (d) d[metric] += v;
      }
    }
  }

  return { ...snap, campaignDaily, daily, sharedItems: "verified", verified: { anchors: mine, estimated: estimatedRanges } };
}
