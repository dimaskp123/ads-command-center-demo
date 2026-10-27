// Everything the dashboard derives from raw account snapshots: IDR
// conversion, window aggregation, objective detection, metric selection,
// anomaly detection, creative diagnostics and strategic recommendations.

import { rateFor, type FxState } from "./fx";
import {
  COUNTER_KEYS,
  MONEY_KEYS,
  WINDOW_DAYS,
  emptyCounters,
  type AccountSnapshot,
  type AdRow,
  PLATFORM_LABEL,
  type CampaignMeta,
  type ClientConfig,
  type Counters,
  type Platform,
  type ResultKind,
  type PeriodSel,
  type WindowKey,
} from "./types";

// ---------------------------------------------------------------------------
// Platforms

/** Which platform(s) a view covers: one platform, or everything blended. */
export type PlatformSel = "all" | Platform;
export const PLATFORM_ORDER: Platform[] = ["meta", "google", "tiktok"];

export function accountPlatform(a: Pick<AccountSnapshot, "platform">): Platform {
  return a.platform ?? "meta";
}

// ---------------------------------------------------------------------------
// Dates & windows

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface DateRange {
  start: string;
  end: string;
}

export function windowRange(end: string, w: WindowKey): DateRange {
  return { start: addDaysIso(end, -(WINDOW_DAYS[w] - 1)), end };
}

export function previousRange(r: DateRange): DateRange {
  const len = daysIn(r);
  const end = addDaysIso(r.start, -1);
  return { start: addDaysIso(end, -(len - 1)), end };
}

export function daysIn(r: DateRange): number {
  return Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000) + 1;
}

export function eachDate(r: DateRange): string[] {
  const out: string[] = [];
  for (let d = r.start; d <= r.end; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export function inRange(date: string, r: DateRange) {
  return date >= r.start && date <= r.end;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Counters

export function addCounters(target: Counters, src: Counters) {
  for (const k of COUNTER_KEYS) target[k] += src[k];
}

export function toIdr(row: Counters & { date?: string }, currency: string, fx: FxState, dateFallback: string): Counters {
  const rate = rateFor(fx, currency, row.date ?? dateFallback);
  const out = { ...emptyCounters() };
  for (const k of COUNTER_KEYS) out[k] = row[k] * (MONEY_KEYS.includes(k) ? rate : 1);
  return out;
}

// ---------------------------------------------------------------------------
// Objective groups — what the client is actually running

export type Group = "cpas" | "sales" | "leads" | "messaging" | "traffic" | "awareness" | "engagement" | "other";

export const GROUP_ORDER: Group[] = ["cpas", "sales", "leads", "messaging", "traffic", "awareness", "engagement", "other"];

export const GROUP_META: Record<Group, { label: string; short: string; why: string }> = {
  cpas: {
    label: "CPAS · Collaborative Ads (shared items)",
    short: "CPAS",
    why: "Ad sets optimize for a retailer catalog segment (add-to-cart / purchase of shared items), so the scorecard is shared-item ATC, purchases, purchase value and ROAS.",
  },
  sales: {
    label: "Sales · Website conversions",
    short: "Sales",
    why: "Ad sets optimize for pixel purchases / add-to-cart, so the scorecard is purchases, value, ROAS and cost per purchase.",
  },
  leads: {
    label: "Lead generation",
    short: "Leads",
    why: "Ad sets optimize for lead forms, so the scorecard is leads, cost per lead, and the reach / CPM that feeds them.",
  },
  messaging: {
    label: "Messaging · WhatsApp / DM conversations",
    short: "Messaging",
    why: "Ad sets optimize for conversations started (WhatsApp / IG Direct, or a WA-button conversion), so the scorecard is conversations and cost per conversation.",
  },
  traffic: {
    label: "Traffic · Clicks, landing-page & profile visits",
    short: "Traffic",
    why: "Ad sets optimize for link clicks, landing-page views or Instagram profile visits, so the scorecard is those visits and their unit cost.",
  },
  awareness: {
    label: "Awareness · Reach & ad recall",
    short: "Awareness",
    why: "Ad sets optimize for reach or estimated ad-recall lift, so the scorecard is reach, impressions, CPM and frequency.",
  },
  engagement: {
    label: "Engagement",
    short: "Engagement",
    why: "Ad sets optimize for post engagement, so the scorecard is clicks, CTR and CPM.",
  },
  other: { label: "Other", short: "Other", why: "Optimization goal not recognised — showing delivery metrics." },
};

export function kindToGroup(kind: ResultKind): Group {
  switch (kind) {
    case "sharedPurchase":
    case "sharedAtc":
      return "cpas";
    case "purchase":
    case "atc":
      return "sales";
    case "leads":
      return "leads";
    case "conversations":
      return "messaging";
    case "lpv":
    case "linkClicks":
    case "profileVisits":
      return "traffic";
    case "adRecall":
    case "reach":
    case "thruplay":
      return "awareness";
    case "engagement":
      return "engagement";
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Metric catalogue

export type MetricFormat = "idr" | "int" | "pct" | "x" | "dec";

export interface Agg extends Counters {
  reach: number | null; // deduplicated where possible; null if unknown
  reachIsSum?: boolean; // true when summed across campaigns (upper bound)
}

export interface MetricDef {
  key: string;
  label: string;
  format: MetricFormat;
  higherIsBetter: boolean;
  get: (a: Agg) => number | null;
  help?: string;
  /** Additive per-day metric (can be stacked by client). */
  additive?: boolean;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export const METRICS: Record<string, MetricDef> = {
  spend: { key: "spend", label: "Amount spent", format: "idr", higherIsBetter: true, get: (a) => a.spend, additive: true },
  impressions: { key: "impressions", label: "Impressions", format: "int", higherIsBetter: true, get: (a) => a.impressions, additive: true },
  reach: { key: "reach", label: "Reach", format: "int", higherIsBetter: true, get: (a) => a.reach, help: "Meta accounts reached (deduplicated within an ad account). Google Ads and TikTok report no deduplicated reach, so they are not included." },
  frequency: { key: "frequency", label: "Frequency", format: "dec", higherIsBetter: false, get: (a) => (a.reach ? a.impressions / a.reach : null), help: "Impressions ÷ reach. Above ~3.5 in a week usually means audience saturation." },
  cpm: { key: "cpm", label: "CPM", format: "idr", higherIsBetter: false, get: (a) => div(a.spend * 1000, a.impressions) },
  linkClicks: { key: "linkClicks", label: "Link clicks", format: "int", higherIsBetter: true, get: (a) => a.linkClicks, additive: true },
  ctr: { key: "ctr", label: "CTR (link)", format: "pct", higherIsBetter: true, get: (a) => div(a.linkClicks * 100, a.impressions), help: "Link clicks ÷ impressions." },
  cpc: { key: "cpc", label: "CPC (link)", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.linkClicks) },
  leads: { key: "leads", label: "Leads", format: "int", higherIsBetter: true, get: (a) => a.leads, additive: true },
  cpl: { key: "cpl", label: "Cost per lead", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.leads) },
  conversations: { key: "conversations", label: "Conversations", format: "int", higherIsBetter: true, get: (a) => a.conversations, additive: true, help: "Messaging conversations started (or WA-button conversions)." },
  cpConv: { key: "cpConv", label: "Cost per conversation", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.conversations) },
  sharedAtc: { key: "sharedAtc", label: "ATC · shared items", format: "int", higherIsBetter: true, get: (a) => a.sharedAtc, additive: true },
  cpSharedAtc: { key: "cpSharedAtc", label: "Cost per ATC (shared)", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.sharedAtc) },
  sharedPurchases: { key: "sharedPurchases", label: "Purchases · shared items", format: "int", higherIsBetter: true, get: (a) => a.sharedPurchases, additive: true },
  cpSharedPurchase: { key: "cpSharedPurchase", label: "Cost per purchase (shared)", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.sharedPurchases) },
  sharedPurchaseValue: { key: "sharedPurchaseValue", label: "Purchase value · shared items", format: "idr", higherIsBetter: true, get: (a) => a.sharedPurchaseValue, additive: true },
  sharedRoas: { key: "sharedRoas", label: "ROAS · shared items", format: "x", higherIsBetter: true, get: (a) => div(a.sharedPurchaseValue, a.spend) },
  purchases: { key: "purchases", label: "Purchases", format: "int", higherIsBetter: true, get: (a) => a.purchases, additive: true },
  purchaseValue: { key: "purchaseValue", label: "Purchase value", format: "idr", higherIsBetter: true, get: (a) => a.purchaseValue, additive: true },
  roas: { key: "roas", label: "ROAS", format: "x", higherIsBetter: true, get: (a) => div(a.purchaseValue, a.spend) },
  cpa: { key: "cpa", label: "Cost per purchase", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.purchases) },
  atc: { key: "atc", label: "Adds to cart", format: "int", higherIsBetter: true, get: (a) => a.atc, additive: true },
  lpv: { key: "lpv", label: "Landing page views", format: "int", higherIsBetter: true, get: (a) => a.lpv, additive: true },
  cpLpv: { key: "cpLpv", label: "Cost per LPV", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.lpv) },
  profileVisits: { key: "profileVisits", label: "IG profile visits", format: "int", higherIsBetter: true, get: (a) => a.profileVisits, additive: true },
  cpProfileVisit: { key: "cpProfileVisit", label: "Cost per profile visit", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.profileVisits) },
  adRecall: { key: "adRecall", label: "Est. ad recall lift", format: "int", higherIsBetter: true, get: (a) => a.adRecall, additive: true, help: "Estimated people who would remember the ad within 2 days (summed per day — approximate)." },
  cpAdRecall: { key: "cpAdRecall", label: "Cost per ad recall", format: "idr", higherIsBetter: false, get: (a) => div(a.spend, a.adRecall) },
  thruplays: { key: "thruplays", label: "ThruPlays", format: "int", higherIsBetter: true, get: (a) => a.thruplays, additive: true },
  clicks: { key: "clicks", label: "Clicks (all)", format: "int", higherIsBetter: true, get: (a) => a.clicks, additive: true },
};

export interface GroupMetricPlan {
  tiles: string[];
  volume: string; // daily chart 1
  efficiency: string; // daily chart 2
  costPerResult: string; // used for campaign ranking / anomalies
  result: string;
}

/** Which metrics matter for a group — `a` lets us drop tiles with no data. */
export function planFor(group: Group, a: Agg): GroupMetricPlan {
  switch (group) {
    case "cpas":
      return {
        tiles: ["spend", "sharedAtc", "sharedPurchases", "sharedPurchaseValue", "sharedRoas", "cpSharedPurchase", "cpSharedAtc", "ctr"],
        volume: a.sharedPurchases > 0 ? "sharedPurchases" : "sharedAtc",
        efficiency: a.sharedPurchaseValue > 0 ? "sharedRoas" : "cpSharedAtc",
        costPerResult: a.sharedPurchases > 0 ? "cpSharedPurchase" : "cpSharedAtc",
        result: a.sharedPurchases > 0 ? "sharedPurchases" : "sharedAtc",
      };
    case "sales":
      return { tiles: ["spend", "atc", "purchases", "purchaseValue", "roas", "cpa", "ctr"], volume: "purchases", efficiency: "roas", costPerResult: "cpa", result: "purchases" };
    case "leads":
      return { tiles: ["spend", "leads", "cpl", "reach", "impressions", "cpm", "ctr"], volume: "leads", efficiency: "cpl", costPerResult: "cpl", result: "leads" };
    case "messaging":
      return { tiles: ["spend", "conversations", "cpConv", "linkClicks", "ctr", "cpm", "reach"], volume: "conversations", efficiency: "cpConv", costPerResult: "cpConv", result: "conversations" };
    case "traffic": {
      const tiles = ["spend", "linkClicks", "cpc", "ctr"];
      if (a.lpv > 0) tiles.push("lpv", "cpLpv");
      if (a.profileVisits > 0) tiles.push("profileVisits", "cpProfileVisit");
      const pv = a.profileVisits > a.lpv;
      const lp = a.lpv > 0;
      return {
        tiles,
        volume: pv ? "profileVisits" : lp ? "lpv" : "linkClicks",
        efficiency: pv ? "cpProfileVisit" : lp ? "cpLpv" : "cpc",
        costPerResult: pv ? "cpProfileVisit" : lp ? "cpLpv" : "cpc",
        result: pv ? "profileVisits" : lp ? "lpv" : "linkClicks",
      };
    }
    case "awareness": {
      const tiles = ["spend", "reach", "impressions", "cpm", "frequency"];
      if (a.adRecall > 0) tiles.push("adRecall", "cpAdRecall");
      if (a.thruplays > 0) tiles.push("thruplays");
      return { tiles, volume: "impressions", efficiency: "cpm", costPerResult: "cpm", result: "impressions" };
    }
    default:
      return { tiles: ["spend", "impressions", "clicks", "ctr", "cpm"], volume: "clicks", efficiency: "cpm", costPerResult: "cpm", result: "clicks" };
  }
}

// ---------------------------------------------------------------------------
// Client model

export interface CampaignView {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  platform: Platform;
  currency: string;
  objective: string;
  resultKind: ResultKind;
  group: Group;
  status: string;
  isActive: boolean;
  dailyBudgetIdr: number | null;
  cur: Agg;
  prev: Counters | null;
  lastSpendDate: string | null;
  activeDays: number;
  /** Spent in the window but is not delivering now (paused / stopped). */
  inactiveButSpent: boolean;
  /** Spent in the 90d data but nothing in this window. */
  dormantInWindow: boolean;
}

export interface DailyPoint extends Counters {
  date: string;
  reach: number;
}

export interface PlatformSlice {
  platform: Platform;
  cur: Counters;
  prev: Counters | null;
  spendShare: number;
  /** The platform's largest objective group (its headline result). */
  primary: GroupView | null;
}

export interface ClientModel {
  client: ClientConfig;
  /** Platform scope of this model ("all" = blended). */
  platform: PlatformSel;
  /** Platforms the client runs on (whatever the scope), in display order. */
  platforms: Platform[];
  /** Per-platform totals in this model's range (one entry when scoped). */
  byPlatform: PlatformSlice[];
  accounts: AccountSnapshot[];
  missingAccounts: string[];
  endDate: string;
  range: DateRange;
  prevRange: DateRange | null;
  /** The preset this range corresponds to (null for an arbitrary custom range). */
  presetKey: WindowKey | null;
  /** Why no comparison is shown although one was requested. */
  prevNote: string | null;
  dataFloor: string; // earliest date in the loaded data
  dataStart: string | null; // first date with spend across accounts
  total: Agg;
  prevTotal: Counters | null;
  daily: DailyPoint[]; // full 90d IDR series (range applied by consumers)
  /** The same 90d series split by platform. */
  platformDaily: Partial<Record<Platform, DailyPoint[]>>;
  campaigns: CampaignView[];
  groups: GroupView[];
  primaryGroup: Group | null;
  ads: AdView[];
  sharedItems: AccountSnapshot["sharedItems"];
}

export interface GroupView {
  group: Group;
  platform: Platform;
  /** Unique within a model: `${platform}:${group}`. */
  key: string;
  /** Short label; prefixed with the platform when the model spans several. */
  label: string;
  campaigns: CampaignView[];
  cur: Agg;
  prev: Counters | null;
  plan: GroupMetricPlan;
  spendShare: number;
  daily: DailyPoint[]; // group daily within the selected range
}

const ACTIVE_STATUSES = new Set(["ACTIVE", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREAPPROVED"]);

function campaignGroup(c: CampaignMeta, cpasHint: boolean): Group {
  const g = kindToGroup(c.resultKind);
  // A sales campaign on an account flagged as CPAS whose result is still a
  // pixel event is treated as CPAS only if the name says so.
  if (g === "sales" && cpasHint && /cpas/i.test(c.name)) return "cpas";
  return g;
}

export function buildClientModel(
  client: ClientConfig,
  accounts: Record<string, AccountSnapshot>,
  fx: FxState,
  period: PeriodSel,
  compare: boolean,
  platform: PlatformSel = "all"
): ClientModel {
  const allAccs = client.accountIds.map((id) => accounts[id]).filter(Boolean) as AccountSnapshot[];
  const platforms = PLATFORM_ORDER.filter((p) => allAccs.some((a) => accountPlatform(a) === p));
  const accs = platform === "all" ? allAccs : allAccs.filter((a) => accountPlatform(a) === platform);
  // Unloaded IDs are custom Meta accounts; only report them where Meta is in scope.
  const missingAccounts = platform === "all" || platform === "meta" ? client.accountIds.filter((id) => !accounts[id]) : [];
  const endDate = accs.map((a) => a.endDate).sort().pop() ?? new Date().toISOString().slice(0, 10);
  const dataFloor = addDaysIso(endDate, -89);
  const { range, presetKey } = resolvePeriod(period, endDate);
  let prevRange: DateRange | null = null;
  let prevNote: string | null = null;
  if (compare) {
    const p = previousRange(range);
    if (p.start >= dataFloor) prevRange = p;
    else prevNote = `Comparison needs data from ${fmtDate(p.start, { month: "short", day: "numeric" })}; loaded data starts ${fmtDate(dataFloor, { month: "short", day: "numeric" })}.`;
  }
  const cpasHint = !!client.cpas || accs.some((a) => /cpas/i.test(a.name));

  // Daily, IDR
  const byDate = new Map<string, DailyPoint>();
  for (const date of eachDate({ start: addDaysIso(endDate, -89), end: endDate })) byDate.set(date, { date, reach: 0, ...emptyCounters() });
  for (const a of accs) {
    for (const r of a.daily) {
      const p = byDate.get(r.date);
      if (!p) continue;
      addCounters(p, toIdr(r, a.currency, fx, r.date));
      p.reach += r.reach;
    }
  }
  const daily = Array.from(byDate.values());
  const platformDaily: Partial<Record<Platform, DailyPoint[]>> = {};
  for (const pf of PLATFORM_ORDER) {
    const pAccs = accs.filter((a) => accountPlatform(a) === pf);
    if (!pAccs.length) continue;
    const m = new Map(daily.map((d) => [d.date, { date: d.date, reach: 0, ...emptyCounters() } as DailyPoint]));
    for (const a of pAccs)
      for (const r of a.daily) {
        const pt = m.get(r.date);
        if (!pt) continue;
        addCounters(pt, toIdr(r, a.currency, fx, r.date));
        pt.reach += r.reach;
      }
    platformDaily[pf] = Array.from(m.values());
  }
  const dataStart = daily.find((d) => d.spend > 0)?.date ?? null;

  const sumRange = (r: DateRange) => {
    const c = emptyCounters();
    for (const d of daily) if (inRange(d.date, r)) addCounters(c, d);
    return c;
  };

  // Reach is Meta-only: Google Ads and TikTok have no deduplicated account reach.
  const reachAccs = accs.filter((a) => (a.platform ?? "meta") === "meta");
  const accountReach = reachAccs.length
    ? reachAccs.reduce<number | null>((s, a) => {
        const r = presetKey ? a.accountWindows[presetKey]?.reach : undefined;
        return r === undefined || s === null ? null : s + r;
      }, 0)
    : null;
  const total: Agg = { ...sumRange(range), reach: accountReach, reachIsSum: reachAccs.length > 1 };
  const prevTotal = prevRange ? sumRange(prevRange) : null;

  // Campaigns
  const campaigns: CampaignView[] = [];
  for (const a of accs) {
    const rowsBy = new Map<string, typeof a.campaignDaily>();
    for (const r of a.campaignDaily) {
      const list = rowsBy.get(r.campaignId) ?? [];
      list.push(r);
      rowsBy.set(r.campaignId, list);
    }
    for (const c of a.campaigns) {
      const rows = rowsBy.get(c.id) ?? [];
      const cur = emptyCounters();
      const prev = emptyCounters();
      let lastSpendDate: string | null = null;
      let activeDays = 0;
      for (const r of rows) {
        const idr = toIdr(r, a.currency, fx, r.date);
        if (inRange(r.date, range)) {
          addCounters(cur, idr);
          if (r.spend > 0) activeDays++;
        }
        if (prevRange && inRange(r.date, prevRange)) addCounters(prev, idr);
        if (r.spend > 0 && (!lastSpendDate || r.date > lastSpendDate)) lastSpendDate = r.date;
      }
      const isActive = ACTIVE_STATUSES.has(c.status);
      const budgetRate = rateFor(fx, a.currency, endDate);
      campaigns.push({
        id: c.id,
        name: c.name,
        accountId: a.accountId,
        accountName: a.name,
        platform: accountPlatform(a),
        currency: a.currency,
        objective: c.objective,
        resultKind: c.resultKind,
        group: campaignGroup(c, cpasHint),
        status: c.status,
        isActive,
        dailyBudgetIdr: c.dailyBudget !== null ? c.dailyBudget * budgetRate : null,
        cur: { ...cur, reach: presetKey ? c.windows[presetKey]?.reach ?? null : null },
        prev: prevRange ? prev : null,
        lastSpendDate,
        activeDays,
        inactiveButSpent: cur.spend > 0 && (!isActive || (lastSpendDate !== null && lastSpendDate < addDaysIso(endDate, -2))),
        dormantInWindow: cur.spend === 0 && lastSpendDate !== null,
      });
    }
  }
  campaigns.sort((x, y) => y.cur.spend - x.cur.spend);

  // Groups
  const spentCampaigns = campaigns.filter((c) => c.cur.spend > 0 || c.cur.sharedPurchases > 0 || c.cur.leads > 0);
  const groups: GroupView[] = [];
  // Groups never mix platforms: a Google lead campaign and a Meta lead
  // campaign land in separate sections with separate suggestions.
  const multiPlatform = new Set(spentCampaigns.map((c) => c.platform)).size > 1;
  for (const pf of PLATFORM_ORDER)
  for (const g of GROUP_ORDER) {
    const cs = spentCampaigns.filter((c) => c.group === g && c.platform === pf);
    if (!cs.length) continue;
    const cur: Agg = { ...emptyCounters(), reach: 0, reachIsSum: true };
    const prev = prevRange ? emptyCounters() : null;
    for (const c of cs) {
      addCounters(cur, c.cur);
      if (c.cur.reach !== null && cur.reach !== null) cur.reach += c.cur.reach;
      if (prev && c.prev) addCounters(prev, c.prev);
    }
    if (cs.every((c) => c.cur.reach === null)) cur.reach = null; // Google / TikTok only
    // If the group is the only one, the account-level deduplicated reach is exact.
    const allCampaignsInGroup = spentCampaigns.every((c) => c.group === g && c.platform === pf);
    if (allCampaignsInGroup && total.reach !== null) {
      cur.reach = total.reach;
      cur.reachIsSum = total.reachIsSum;
    }
    const ids = new Set(cs.map((c) => c.id));
    const gd = new Map<string, DailyPoint>();
    for (const date of eachDate(range)) gd.set(date, { date, reach: 0, ...emptyCounters() });
    for (const a of accs) {
      for (const r of a.campaignDaily) {
        if (!ids.has(r.campaignId)) continue;
        const p = gd.get(r.date);
        if (p) addCounters(p, toIdr(r, a.currency, fx, r.date));
      }
    }
    groups.push({
      group: g,
      platform: pf,
      key: `${pf}:${g}`,
      label: multiPlatform ? `${PLATFORM_LABEL[pf]} · ${GROUP_META[g].short}` : GROUP_META[g].short,
      campaigns: cs,
      cur,
      prev,
      plan: planFor(g, cur),
      spendShare: total.spend > 0 ? cur.spend / total.spend : 0,
      daily: Array.from(gd.values()),
    });
  }
  // Platform blocks stay together (largest platform first), groups by spend inside.
  const pfSpend = (pf: Platform) => groups.filter((g) => g.platform === pf).reduce((t, g) => t + g.cur.spend, 0);
  groups.sort((x, y) => (x.platform === y.platform ? y.cur.spend - x.cur.spend : pfSpend(y.platform) - pfSpend(x.platform)));

  const byPlatform: PlatformSlice[] = PLATFORM_ORDER.filter((pf) => accs.some((a) => accountPlatform(a) === pf)).map((pf) => {
    const cur = emptyCounters();
    const prev = prevRange ? emptyCounters() : null;
    for (const c of campaigns) {
      if (c.platform !== pf) continue;
      addCounters(cur, c.cur);
      if (prev && c.prev) addCounters(prev, c.prev);
    }
    const pg = groups.filter((g) => g.platform === pf).sort((x, y) => y.cur.spend - x.cur.spend);
    return { platform: pf, cur, prev, spendShare: total.spend > 0 ? cur.spend / total.spend : 0, primary: pg[0] ?? null };
  });
  byPlatform.sort((x, y) => y.cur.spend - x.cur.spend);

  // Ads (7d or 30d snapshot — 90d uses 30d)
  const adWindow: "7d" | "30d" = presetKey === "7d" || (range.end === endDate && daysIn(range) <= 7) ? "7d" : "30d";
  const ads: AdView[] = [];
  for (const a of accs) {
    const rows = a.ads[adWindow] ?? [];
    const rows7 = new Map((a.ads["7d"] ?? []).map((r) => [r.id, r]));
    const rate = effectiveRate(a, fx, windowRange(a.endDate, adWindow));
    for (const r of rows) ads.push(buildAdView(r, a, rate, rows7.get(r.id) ?? null, adWindow));
  }
  annotateAds(ads);

  return {
    client,
    platform,
    platforms,
    byPlatform,
    accounts: accs,
    missingAccounts,
    endDate,
    range,
    prevRange,
    presetKey,
    prevNote,
    dataFloor,
    dataStart,
    total,
    prevTotal,
    daily,
    platformDaily,
    campaigns,
    groups,
    primaryGroup: groups[0]?.group ?? null,
    ads,
    sharedItems: accs.some((a) => a.sharedItems === "full")
      ? "full"
      : accs.some((a) => a.sharedItems === "verified")
        ? "verified"
        : accs.some((a) => a.sharedItems === "optimization-results")
          ? "optimization-results"
          : "none",
  };
}

/** Resolve a period to a date range clamped to the loaded 90 days. */
export function resolvePeriod(period: PeriodSel, endDate: string): { range: DateRange; presetKey: WindowKey | null } {
  if (period.key !== "custom") return { range: windowRange(endDate, period.key), presetKey: period.key };
  const floor = addDaysIso(endDate, -89);
  let start = period.start < floor ? floor : period.start;
  let end = period.end > endDate ? endDate : period.end;
  if (start > end) [start, end] = [end, start];
  const range = { start, end };
  const presetKey = (["7d", "30d", "90d"] as WindowKey[]).find((k) => {
    const r = windowRange(endDate, k);
    return r.start === start && r.end === end;
  }) ?? null;
  return { range, presetKey };
}

export function rangeLabel(r: DateRange): string {
  const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
  return `${fmtDate(r.start, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })} – ${fmtDate(r.end, { month: "short", day: "numeric", year: "numeric" })}`;
}

function effectiveRate(a: AccountSnapshot, fx: FxState, r: DateRange): number {
  let native = 0;
  let idr = 0;
  for (const d of a.daily) {
    if (!inRange(d.date, r)) continue;
    native += d.spend;
    idr += d.spend * rateFor(fx, a.currency, d.date);
  }
  return native > 0 ? idr / native : rateFor(fx, a.currency, r.end);
}

// ---------------------------------------------------------------------------
// Creatives

export type AdFlag = "absorber" | "fatigue" | "winner" | "lowCtr" | "noResults";

export const AD_FLAG_META: Record<AdFlag, { label: string; tone: "red" | "amber" | "green" | "slate"; action: string }> = {
  absorber: { label: "Budget absorber", tone: "red", action: "Pause or cap it and move budget to the best-performing ad in the same ad set." },
  noResults: { label: "No results", tone: "red", action: "Spending with zero optimization results — check the ad's landing / event setup or pause it." },
  fatigue: { label: "Fatigue", tone: "amber", action: "Frequency is high and CTR is falling — refresh the creative (new hook / first 3 seconds) or widen the audience." },
  lowCtr: { label: "Low CTR", tone: "amber", action: "CTR is well below its peers — test a new thumbnail, headline or opening frame." },
  winner: { label: "Winner", tone: "green", action: "Cheapest results among its peers — duplicate into new ad sets or raise its ad set budget gradually (+20%/day)." },
};

export interface AdView extends AdRow {
  accountId: string;
  currency: string;
  window: "7d" | "30d";
  spendIdr: number;
  valueIdr: number;
  group: Group;
  resultLabel: string;
  resultCount: number | null; // null for awareness ads (CPM used instead)
  costPerResult: number | null; // IDR
  ctr: number | null;
  ctr7: number | null; // last-7d CTR, for fatigue
  spendShare: number; // share of client ad spend in window
  flags: AdFlag[];
  peerMedianCost: number | null;
  adsManagerUrl: string;
}

const RESULT_FOR_KIND: Partial<Record<ResultKind, { key: keyof Counters; label: string }>> = {
  sharedPurchase: { key: "sharedPurchases", label: "Shared purchases" },
  sharedAtc: { key: "sharedAtc", label: "Shared ATC" },
  purchase: { key: "purchases", label: "Purchases" },
  atc: { key: "atc", label: "Adds to cart" },
  leads: { key: "leads", label: "Leads" },
  conversations: { key: "conversations", label: "Conversations" },
  lpv: { key: "lpv", label: "Landing page views" },
  profileVisits: { key: "profileVisits", label: "Profile visits" },
  linkClicks: { key: "linkClicks", label: "Link clicks" },
  adRecall: { key: "adRecall", label: "Ad recall lift" },
  thruplay: { key: "thruplays", label: "ThruPlays" },
};

function buildAdView(r: AdRow, a: AccountSnapshot, rate: number, r7: AdRow | null, window: "7d" | "30d"): AdView {
  const spendIdr = r.spend * rate;
  const res = RESULT_FOR_KIND[r.resultKind];
  const group = kindToGroup(r.resultKind);
  let resultCount: number | null = null;
  let costPerResult: number | null = null;
  let resultLabel = "CPM";
  if (res) {
    resultCount = r[res.key];
    costPerResult = resultCount > 0 ? spendIdr / resultCount : null;
    resultLabel = res.label;
  } else {
    // reach / unknown → use CPM as the unit cost
    costPerResult = r.impressions > 0 ? (spendIdr * 1000) / r.impressions : null;
  }
  return {
    ...r,
    accountId: a.accountId,
    currency: a.currency,
    window,
    spendIdr,
    valueIdr: (r.sharedPurchaseValue || r.purchaseValue) * rate,
    group,
    resultLabel,
    resultCount,
    costPerResult,
    ctr: r.impressions > 0 ? (r.linkClicks / r.impressions) * 100 : null,
    ctr7: r7 && r7.impressions > 500 ? (r7.linkClicks / r7.impressions) * 100 : null,
    spendShare: 0,
    flags: [],
    peerMedianCost: null,
    adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${a.accountId}&selected_ad_ids=${r.id}`,
  };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function annotateAds(ads: AdView[]) {
  const totalSpend = ads.reduce((s, a) => s + a.spendIdr, 0);
  for (const a of ads) a.spendShare = totalSpend > 0 ? a.spendIdr / totalSpend : 0;
  // Peers = same result kind (so CPL is compared with CPL, CPM with CPM).
  const byKind = new Map<ResultKind, AdView[]>();
  for (const a of ads) byKind.set(a.resultKind, [...(byKind.get(a.resultKind) ?? []), a]);
  for (const peers of Array.from(byKind.values())) {
    const peerSpend = peers.reduce((s, a) => s + a.spendIdr, 0);
    const costs = peers.filter((a) => a.costPerResult !== null && a.spendIdr > 0.02 * peerSpend).map((a) => a.costPerResult!);
    const medCost = median(costs);
    const ctrs = peers.filter((a) => a.ctr !== null && a.impressions > 1000).map((a) => a.ctr!);
    const medCtr = median(ctrs);
    for (const a of peers) {
      a.peerMedianCost = medCost;
      const peerShare = peerSpend > 0 ? a.spendIdr / peerSpend : 0;
      const material = a.spendShare >= 0.05 || peerShare >= 0.15;
      if (a.resultCount === 0 && material) a.flags.push("noResults");
      else if (medCost !== null && a.costPerResult !== null && material && a.costPerResult >= 1.5 * medCost && peers.length >= 3)
        a.flags.push("absorber");
      if (medCost !== null && a.costPerResult !== null && a.costPerResult <= 0.7 * medCost && peerShare >= 0.05 && peers.length >= 3)
        a.flags.push("winner");
      if (a.frequency >= 3 && a.ctr7 !== null && a.ctr !== null && a.ctr7 < 0.8 * a.ctr) a.flags.push("fatigue");
      if (medCtr !== null && a.ctr !== null && a.ctr < 0.5 * medCtr && material && a.group !== "awareness") a.flags.push("lowCtr");
    }
  }
  ads.sort((x, y) => y.spendIdr - x.spendIdr);
}

// ---------------------------------------------------------------------------
// Anomaly detection (daily series)

export type Severity = "critical" | "warning" | "info" | "good";

export interface Signal {
  id: string;
  clientId: string;
  clientName: string;
  severity: Severity;
  kind: "anomaly" | "creative" | "pacing" | "inactive" | "data" | "opportunity";
  /** Set when the signal comes from one platform of a multi-platform client. */
  platform?: Platform;
  title: string;
  detail: string;
  action?: string;
}

function meanStd(xs: number[]) {
  const m = xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length || 1);
  return { mean: m, std: Math.sqrt(v) };
}

function ratioSeries(daily: DailyPoint[], def: MetricDef): (number | null)[] {
  return daily.map((d) => def.get({ ...d, reach: d.reach || null }));
}

/**
 * Compares the last 3 days with the 14 days before them. A metric is
 * flagged when the recent mean sits ≥2σ away from the baseline AND moved
 * ≥25% — so tiny, noisy series don't trigger alerts.
 */
export function detectAnomalies(m: ClientModel): Signal[] {
  const out: Signal[] = [];
  const end = m.endDate;
  const recentR = { start: addDaysIso(end, -2), end };
  const baseR = { start: addDaysIso(end, -16), end: addDaysIso(end, -3) };
  const recent = m.daily.filter((d) => inRange(d.date, recentR));
  const base = m.daily.filter((d) => inRange(d.date, baseR));
  const name = m.client.name;
  if (base.filter((d) => d.spend > 0).length < 7) return out; // not enough history

  const baseSpend = meanStd(base.map((d) => d.spend));
  const lastTwo = m.daily.slice(-2);
  if (baseSpend.mean > 0 && lastTwo.every((d) => d.spend === 0)) {
    out.push({
      id: `${m.client.id}-stopped`,
      clientId: m.client.id,
      clientName: name,
      severity: "critical",
      kind: "anomaly",
      title: "Delivery stopped",
      detail: `No spend on the last 2 days vs a 14-day average of ${fmtIdr(baseSpend.mean)}/day.`,
      action: "Check billing, account restrictions, ad rejections or ended schedules.",
    });
    return out;
  }

  const checks: { key: string; label: string }[] = [
    { key: "spend", label: "Daily spend" },
    { key: "cpm", label: "CPM" },
    { key: "ctr", label: "CTR (link)" },
  ];
  if (m.primaryGroup) {
    const plan = m.groups[0].plan;
    if (!checks.some((c) => c.key === plan.costPerResult)) checks.push({ key: plan.costPerResult, label: METRICS[plan.costPerResult].label });
    if (plan.efficiency !== plan.costPerResult && !checks.some((c) => c.key === plan.efficiency))
      checks.push({ key: plan.efficiency, label: METRICS[plan.efficiency].label });
  }

  for (const c of checks) {
    const def = METRICS[c.key];
    // For ratio metrics derive from 3-day pooled totals (robust to zero days).
    const pool = (rows: DailyPoint[]) => {
      const t = { ...emptyCounters(), reach: null } as Agg;
      for (const r of rows) addCounters(t, r);
      return def.get(t);
    };
    const baseVals = ratioSeries(base, def).filter((v): v is number => v !== null);
    if (baseVals.length < 7) continue;
    const { mean, std } = meanStd(baseVals);
    const recentVal = def.additive ? recent.reduce((s, d) => s + (def.get({ ...d, reach: null }) ?? 0), 0) / recent.length : pool(recent);
    if (recentVal === null || mean === 0) continue;
    const change = (recentVal - mean) / mean;
    const z = std > 0 ? (recentVal - mean) / (std / Math.sqrt(recent.length)) : 0;
    if (Math.abs(change) < 0.25 || Math.abs(z) < 2) continue;
    const up = change > 0;
    const good = def.key === "spend" ? null : up === def.higherIsBetter;
    const big = Math.abs(change) >= 0.5;
    out.push({
      id: `${m.client.id}-anom-${c.key}`,
      clientId: m.client.id,
      clientName: name,
      severity: good === true ? "good" : good === null ? (big ? "warning" : "info") : big ? "critical" : "warning",
      kind: "anomaly",
      title: `${c.label} ${up ? "up" : "down"} ${Math.abs(change * 100).toFixed(0)}%`,
      detail: `Last 3 days ${formatMetric(def, recentVal)} vs 14-day baseline ${formatMetric(def, mean)}.`,
      action: anomalyAction(def.key, up),
    });
  }
  return out;
}

function anomalyAction(key: string, up: boolean): string | undefined {
  if (key === "spend") return up ? "Confirm the budget increase was intended; watch cost per result over the next 2–3 days." : "Check for budget caps, paused ad sets, or rejected ads limiting delivery.";
  if (key === "cpm") return up ? "Auction pressure or a narrowing audience — consider broadening targeting or Advantage+ placements." : undefined;
  if (key === "ctr") return up ? undefined : "Creative wear-out is the usual cause — rotate in fresh creatives.";
  if (key.startsWith("cp") || key === "cpl" || key === "cpa") return up ? "Efficiency is slipping — find the ad set driving the increase (campaign table) and shift budget to the cheapest one." : "Efficiency improving — a good moment to scale the best ad set gradually.";
  if (key.toLowerCase().includes("roas")) return up ? "Return improving — consider raising budget 15–20% on the top campaign." : "Return falling — check the retailer stock/price of hero SKUs and refresh DPA creatives.";
  return undefined;
}

// ---------------------------------------------------------------------------
// Insights & recommendations

export function buildInsights(m: ClientModel): Signal[] {
  const out: Signal[] = [];
  const id = m.client.id;
  const name = m.client.name;
  const push = (s: Omit<Signal, "clientId" | "clientName">) => out.push({ ...s, clientId: id, clientName: name });

  // Data coverage
  if (m.dataStart && m.dataStart > m.range.start) {
    push({
      id: `${id}-coverage`,
      severity: "info",
      kind: "data",
      title: `Spend starts ${fmtDate(m.dataStart)}`,
      detail: `No spend before ${fmtDate(m.dataStart, { month: "short", day: "numeric", year: "numeric" })}, so this window covers ${daysIn({ start: m.dataStart, end: m.endDate })} active days.`,
    });
  }
  for (const acc of m.missingAccounts)
    push({ id: `${id}-missing-${acc}`, severity: "warning", kind: "data", title: `No data for ad account ${acc}`, detail: "Refresh live data (needs META_ACCESS_TOKEN on the server) or check the ID." });

  // Delivery gaps: ≥3 consecutive zero-spend days inside the window after spend began
  {
    const rows = m.daily.filter((d) => inRange(d.date, m.range) && (!m.dataStart || d.date >= m.dataStart));
    let run: string[] = [];
    const gaps: string[][] = [];
    for (const d of rows) {
      if (d.spend === 0) run.push(d.date);
      else {
        if (run.length >= 3) gaps.push(run);
        run = [];
      }
    }
    if (run.length >= 3) gaps.push(run);
    if (gaps.length) {
      const days = gaps.reduce((s, g) => s + g.length, 0);
      push({
        id: `${id}-gaps`,
        severity: "warning",
        kind: "pacing",
        title: `${days} day${days > 1 ? "s" : ""} without delivery`,
        detail: `No spend ${gaps.map((g) => `${fmtDate(g[0])}–${fmtDate(g[g.length - 1])}`).join(", ")}. Gaps reset learning and cost reach momentum.`,
        action: "Check billing / payment method, spend caps and campaign schedules; consider an account spending limit alert.",
      });
    }
  }

  // Inactive-but-spent campaigns
  const inactive = m.campaigns.filter((c) => c.inactiveButSpent);
  if (inactive.length) {
    const spend = inactive.reduce((s, c) => s + c.cur.spend, 0);
    push({
      id: `${id}-inactive`,
      severity: "info",
      kind: "inactive",
      title: `${inactive.length} inactive campaign${inactive.length > 1 ? "s" : ""} still counted`,
      detail: `${inactive.map((c) => shortName(c.name)).join(", ")} — ${fmtIdr(spend)} (${pct(spend / (m.total.spend || 1))} of spend) in this window. Included in every total.`,
    });
  }

  // Pacing vs previous period
  if (m.prevTotal && m.prevTotal.spend > 0) {
    const ch = (m.total.spend - m.prevTotal.spend) / m.prevTotal.spend;
    if (Math.abs(ch) >= 0.3)
      push({
        id: `${id}-pacing`,
        severity: "warning",
        kind: "pacing",
        title: `Spend ${ch > 0 ? "up" : "down"} ${Math.abs(ch * 100).toFixed(0)}% vs previous period`,
        detail: `${fmtIdr(m.total.spend)} vs ${fmtIdr(m.prevTotal.spend)}.`,
        action: ch > 0 ? "Verify cost per result held up with the extra budget." : "Confirm the cut was planned; under-delivery can starve learning.",
      });
  }

  for (const g of m.groups) {
    const plan = g.plan;
    const cpr = METRICS[plan.costPerResult];
    // Budget reallocation inside the group
    const ranked = g.campaigns
      .filter((c) => c.cur.spend > 0.05 * g.cur.spend)
      .map((c) => ({ c, cost: cpr.get(c.cur) }))
      .filter((x) => x.cost !== null) as { c: CampaignView; cost: number }[];
    if (ranked.length >= 2) {
      ranked.sort((a, b) => (cpr.higherIsBetter ? b.cost - a.cost : a.cost - b.cost));
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      const gap = cpr.higherIsBetter ? best.cost / worst.cost : worst.cost / best.cost;
      if (gap >= 1.4 && g.group !== "awareness") {
        push({
          id: `${id}-${g.key}-realloc`,
          severity: "info",
          kind: "opportunity",
          title: `${g.label}: ${shortName(best.c.name)} is ${gap.toFixed(1)}× more efficient`,
          detail: `${cpr.label}: ${formatMetric(cpr, best.cost)} vs ${formatMetric(cpr, worst.cost)} on ${shortName(worst.c.name)} (${pct(worst.c.cur.spend / g.cur.spend)} of ${g.label} spend).`,
          action: `Shift 15–25% of ${shortName(worst.c.name)}'s budget to ${shortName(best.c.name)}, then re-check in 3–4 days.`,
        });
      }
    }
    // Campaigns with spend but zero results — judged on each campaign's own
    // optimization event (an ATC-optimized CPAS campaign is judged on ATC).
    for (const c of g.campaigns) {
      const own = RESULT_FOR_KIND[c.resultKind];
      if (!own || g.group === "awareness") continue;
      const res = c.cur[own.key];
      if (c.cur.spend > 0.15 * g.cur.spend && res === 0)
        push({
          id: `${id}-${c.id}-zero`,
          severity: "critical",
          kind: "opportunity",
          title: `${shortName(c.name)}: spend with zero ${own.label.toLowerCase()}`,
          detail: `${fmtIdr(c.cur.spend)} in this window and no ${own.label.toLowerCase()} recorded.`,
          action: "Check the optimization event fires (pixel / catalog segment), otherwise pause and reallocate.",
        });
    }
    // Awareness saturation
    if (g.group === "awareness" && g.cur.reach && g.cur.impressions / g.cur.reach >= 3.5 && daysIn(m.range) <= 7)
      push({
        id: `${id}-freq`,
        severity: "warning",
        kind: "opportunity",
        title: `Awareness frequency ${(g.cur.impressions / g.cur.reach).toFixed(1)} in 7 days`,
        detail: "Same people are seeing the ads repeatedly — CPM per new person reached is climbing.",
        action: "Broaden the audience or add fresh creatives; cap frequency in the reach ad set.",
      });
    // CPM drift
    if (g.prev && g.prev.impressions > 0 && g.cur.impressions > 0) {
      const cpmNow = (g.cur.spend * 1000) / g.cur.impressions;
      const cpmPrev = (g.prev.spend * 1000) / g.prev.impressions;
      const ch = (cpmNow - cpmPrev) / cpmPrev;
      if (ch >= 0.25)
        push({
          id: `${id}-${g.key}-cpm`,
          severity: "warning",
          kind: "anomaly",
          title: `${g.label} CPM +${(ch * 100).toFixed(0)}% vs previous period`,
          detail: `${fmtIdr(cpmNow)} vs ${fmtIdr(cpmPrev)}.`,
          action: "Check audience overlap between ad sets and whether placements were restricted.",
        });
    }
    // CPAS specifics
    if (g.group === "cpas") {
      const roas = METRICS.sharedRoas.get(g.cur);
      if (roas !== null)
        push({
          id: `${id}-cpas-roas`,
          severity: roas >= 3 ? "good" : roas >= 1 ? "info" : "warning",
          kind: "opportunity",
          title: `Shared-item ROAS ${roas.toFixed(2)}×`,
          detail:
            m.sharedItems === "optimization-results"
              ? "Counts purchase value only from purchase-optimized ad sets, so treat it as a floor — ATC ad sets' downstream purchases aren't exposed by the MCP."
              : m.sharedItems === "verified"
                ? `Includes revenue driven by ATC-optimized campaigns (locked from Ads Manager)${verifiedCoverage(m, m.range).exact ? "" : " — part of this range is estimated from the verified ratios"}.`
                : "Purchase value of shared catalog items ÷ spend.",
          action:
            roas >= 3
              ? "Healthy return — scale the purchase-optimized retargeting ad set 15–20% at a time."
              : "Move budget toward purchase-optimized retargeting (VC/ATC audiences) and refresh the DPA product set with in-stock best sellers.",
        });
      if (g.cur.sharedAtc > 0 && g.cur.sharedPurchases > 0) {
        const r = g.cur.sharedPurchases / g.cur.sharedAtc;
        if (r < 0.05)
          push({
            id: `${id}-cpas-funnel`,
            severity: "info",
            kind: "opportunity",
            title: `ATC → purchase ratio ${(r * 100).toFixed(1)}%`,
            detail: `${fmtInt(g.cur.sharedAtc)} shared ATC vs ${fmtInt(g.cur.sharedPurchases)} shared purchases.`,
            action: "Retarget recent add-to-carters (7–14 days) with a purchase-optimized ad set and voucher messaging.",
          });
      }
    }
  }

  // Creatives
  const flagged = m.ads.filter((a) => a.flags.length);
  const absorbers = flagged.filter((a) => a.flags.includes("absorber") || a.flags.includes("noResults"));
  if (absorbers.length) {
    const spend = absorbers.reduce((s, a) => s + a.spendIdr, 0);
    push({
      id: `${id}-absorbers`,
      severity: "critical",
      kind: "creative",
      title: `${absorbers.length} budget-absorbing creative${absorbers.length > 1 ? "s" : ""}`,
      detail: `${absorbers.slice(0, 3).map((a) => `"${trunc(a.name, 38)}"`).join(", ")}${absorbers.length > 3 ? "…" : ""} — ${fmtIdr(spend)} (${pct(spend / (m.ads.reduce((s, a) => s + a.spendIdr, 0) || 1))} of ad spend) at ≥1.5× the peer cost per result.`,
      action: AD_FLAG_META.absorber.action,
    });
  }
  const fatigued = flagged.filter((a) => a.flags.includes("fatigue"));
  if (fatigued.length)
    push({
      id: `${id}-fatigue`,
      severity: "warning",
      kind: "creative",
      title: `${fatigued.length} creative${fatigued.length > 1 ? "s" : ""} showing fatigue`,
      detail: `${fatigued.slice(0, 3).map((a) => `"${trunc(a.name, 38)}"`).join(", ")} — frequency ≥3 and 7-day CTR down >20% vs 30-day.`,
      action: AD_FLAG_META.fatigue.action,
    });
  const winners = flagged.filter((a) => a.flags.includes("winner"));
  if (winners.length)
    push({
      id: `${id}-winners`,
      severity: "good",
      kind: "creative",
      title: `${winners.length} winning creative${winners.length > 1 ? "s" : ""} to scale`,
      detail: `${winners.slice(0, 3).map((a) => `"${trunc(a.name, 38)}"`).join(", ")} — ≤0.7× the peer cost per result.`,
      action: AD_FLAG_META.winner.action,
    });

  return out;
}

/**
 * Anomalies + insights that never mix platforms. A client on one platform gets
 * the usual signals; a multi-platform client gets each platform's own signals
 * (its own baseline, pacing, campaign comparisons), titled with the platform.
 * `scoped` builds the client's model for one platform.
 */
export function platformSignals(m: ClientModel, scoped: (p: Platform) => ClientModel, withAnomalies = true): Signal[] {
  const run = (x: ClientModel) => [...(withAnomalies ? detectAnomalies(x) : []), ...buildInsights(x)];
  if (m.platform !== "all" || m.platforms.length <= 1) return run(m);
  const out: Signal[] = [];
  for (const p of m.platforms) {
    const x = scoped(p);
    if (!x.accounts.length) continue;
    for (const s of run(x)) {
      const prefix = `${PLATFORM_LABEL[p]} · `;
      out.push({ ...s, id: `${p}:${s.id}`, platform: p, title: s.title.startsWith(prefix) ? s.title : `${prefix}${s.title}` });
    }
  }
  return out;
}

/**
 * Is a range fully backed by locked Ads Manager numbers? Exact when it holds
 * no extrapolated days and every overlapping anchor lies wholly inside it.
 */
export function verifiedCoverage(m: ClientModel, r: DateRange): { exact: boolean; anchors: { start: string; end: string; source: string }[] } {
  const anchors: { start: string; end: string; source: string }[] = [];
  let exact = true;
  for (const a of m.accounts) {
    if (!a.verified) continue;
    for (const an of a.verified.anchors) {
      const overlaps = an.start <= r.end && an.end >= r.start;
      if (!overlaps) continue;
      if (!anchors.some((x) => x.start === an.start && x.end === an.end && x.source === an.source)) anchors.push(an);
      if (an.start < r.start || an.end > r.end) {
        // A wider anchor is harmless if, for each of its metrics, a smaller
        // anchor of the same campaign that sits inside the range covers the overlap.
        const os = an.start > r.start ? an.start : r.start;
        const oe = an.end < r.end ? an.end : r.end;
        const covered = Object.entries(an.metrics)
          .filter(([, v]) => v !== undefined)
          .every(([k]) =>
            a.verified!.anchors.some(
              (b) => b.campaignId === an.campaignId && b.metrics[k] !== undefined && b.start >= r.start && b.end <= r.end && b.start <= os && b.end >= oe
            )
          );
        if (!covered) exact = false;
      }
    }
    for (const e of a.verified.estimated) if (e.dates.some((d) => inRange(d, r))) exact = false;
  }
  return { exact: exact && anchors.length > 0, anchors };
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 };

// ---------------------------------------------------------------------------
// Formatting

export function fmtIdr(n: number | null | undefined, compact = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1_000_000_000) return `Rp\u00a0${(n / 1_000_000_000).toFixed(2)}\u00a0M`;
  if (compact && Math.abs(n) >= 1_000_000) return `Rp\u00a0${(n / 1_000_000).toFixed(1)}\u00a0jt`;
  if (compact && Math.abs(n) >= 10_000) return `Rp\u00a0${(n / 1_000).toFixed(0)}\u00a0rb`;
  return `Rp\u00a0${Math.round(n).toLocaleString("id-ID")}`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

export function formatMetric(def: MetricDef | string, v: number | null | undefined): string {
  const d = typeof def === "string" ? METRICS[def] : def;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  switch (d.format) {
    case "idr":
      return fmtIdr(v);
    case "int":
      return fmtInt(v);
    case "pct":
      return `${v.toFixed(2)}%`;
    case "x":
      return `${v.toFixed(2)}×`;
    case "dec":
      return v.toFixed(2);
  }
}

export function delta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / prev;
}

export function shortName(name: string): string {
  // Drop the "1234:" job-number prefix common in these accounts.
  return name.replace(/^\d+:\s*/, "");
}

export function trunc(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function statusLabel(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
