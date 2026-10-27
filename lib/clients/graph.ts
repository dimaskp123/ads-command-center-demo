// Server-only: builds an AccountSnapshot straight from the Meta Marketing API
// (Graph API insights). Unlike the MCP snapshot, this reads
// catalog_segment_actions / catalog_segment_value, so CPAS shared-item ATC,
// purchases and purchase value are complete for every campaign.

import { indicatorToKind, objectiveToKind } from "./resultKind";
import {
  emptyCounters,
  type AccountSnapshot,
  type AdRow,
  type AdsetMeta,
  type CampaignMeta,
  type CampaignDailyRow,
  type Counters,
  type DailyRow,
  type ResultKind,
  type WindowKey,
} from "./types";

const API = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v21.0"}`;

// Currencies Meta stores without minor units (budgets are already whole units).
const ZERO_OFFSET = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

type ActionList = { action_type: string; value: string }[] | undefined;

interface InsightRow {
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  actions?: ActionList;
  action_values?: ActionList;
  catalog_segment_actions?: ActionList;
  catalog_segment_value?: ActionList;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  adset_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
}

async function getAll<T>(path: string, params: Record<string, string>, token: string, maxPages = 20): Promise<T[]> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Match Ads Manager: report conversions with each ad set's own attribution setting.
  if (path.endsWith("/insights")) url.searchParams.set("use_unified_attribution_setting", "true");
  url.searchParams.set("access_token", token);
  const out: T[] = [];
  let next: string | null = url.toString();
  for (let page = 0; next && page < maxPages; page++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `Graph API ${res.status}`);
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}

async function getOne<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Graph API ${res.status}`);
  return body as T;
}

const n = (v: string | undefined) => (v ? Number(v) || 0 : 0);
const pick = (list: ActionList, ...types: string[]) => {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};

function counters(r: InsightRow): Counters {
  const c = emptyCounters();
  c.spend = n(r.spend);
  c.impressions = n(r.impressions);
  c.clicks = n(r.clicks);
  c.linkClicks = pick(r.actions, "link_click");
  c.leads = pick(r.actions, "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead");
  c.atc = pick(r.actions, "omni_add_to_cart", "add_to_cart");
  c.purchases = pick(r.actions, "omni_purchase", "purchase");
  c.purchaseValue = pick(r.action_values, "omni_purchase", "purchase");
  c.lpv = pick(r.actions, "landing_page_view", "omni_landing_page_view");
  c.sharedAtc = pick(r.catalog_segment_actions, "omni_add_to_cart", "add_to_cart");
  c.sharedPurchases = pick(r.catalog_segment_actions, "omni_purchase", "purchase");
  c.sharedPurchaseValue = pick(r.catalog_segment_value, "omni_purchase", "purchase");
  c.conversations = pick(r.actions, "onsite_conversion.messaging_conversation_started_7d");
  c.profileVisits = pick(r.actions, "onsite_conversion.profile_visit", "ig_profile_visit", "profile_visit_view");
  c.adRecall = pick(r.actions, "estimated_ad_recallers");
  c.thruplays = pick(r.actions, "video_thruplay_watched_actions", "thruplay");
  return c;
}

const BASE_FIELDS = "spend,impressions,clicks,actions,action_values,catalog_segment_actions,catalog_segment_value";

function goalToKind(goal: string, eventType: string | undefined, productSet: boolean): ResultKind {
  switch (goal) {
    case "AD_RECALL_LIFT":
      return "adRecall";
    case "REACH":
    case "IMPRESSIONS":
      return "reach";
    case "THRUPLAY":
      return "thruplay";
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":
      return "leads";
    case "CONVERSATIONS":
      return "conversations";
    case "LANDING_PAGE_VIEWS":
      return "lpv";
    case "LINK_CLICKS":
      return "linkClicks";
    case "PROFILE_VISIT":
      return "profileVisits";
    case "POST_ENGAGEMENT":
      return "engagement";
    case "OFFSITE_CONVERSIONS":
    case "VALUE":
      if (eventType === "PURCHASE") return productSet ? "sharedPurchase" : "purchase";
      if (eventType === "ADD_TO_CART") return productSet ? "sharedAtc" : "atc";
      if (eventType === "LEAD") return "leads";
      return indicatorToKind(eventType);
    default:
      return "unknown";
  }
}

/** Cheap token check for the status endpoint. */
export async function checkToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await getOne<{ id: string }>("me", { fields: "id" }, token);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function fetchAccountLive(accountId: string, token: string): Promise<AccountSnapshot> {
  const act = `act_${accountId}`;
  const info = await getOne<{ name: string; currency: string; timezone_name: string }>(act, { fields: "name,currency,timezone_name" }, token);
  const offset = ZERO_OFFSET.has(info.currency) ? 1 : 100;
  const errors: string[] = [];
  const safe = async <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return fallback;
    }
  };

  const [dailyRows, campDaily, campaignsRaw, adsetsRaw, acctWin, campWin, ads7, ads30] = await Promise.all([
    getAll<InsightRow>(`${act}/insights`, { level: "account", date_preset: "last_90d", time_increment: "1", fields: `${BASE_FIELDS},reach`, limit: "500" }, token),
    safe(
      "campaign daily",
      getAll<InsightRow>(`${act}/insights`, { level: "campaign", date_preset: "last_90d", time_increment: "1", fields: `campaign_id,campaign_name,objective,${BASE_FIELDS}`, limit: "500" }, token, 40),
      []
    ),
    safe(
      "campaigns",
      getAll<{ id: string; name: string; objective: string; effective_status: string; daily_budget?: string; lifetime_budget?: string }>(
        `${act}/campaigns`,
        { fields: "id,name,objective,effective_status,daily_budget,lifetime_budget", limit: "500" },
        token
      ),
      []
    ),
    safe(
      "adsets",
      getAll<{ id: string; name: string; campaign_id: string; optimization_goal: string; effective_status: string; daily_budget?: string; promoted_object?: { custom_event_type?: string; product_set_id?: string } }>(
        `${act}/adsets`,
        { fields: "id,name,campaign_id,optimization_goal,effective_status,daily_budget,promoted_object", limit: "500" },
        token
      ),
      []
    ),
    Promise.all(
      (["7d", "30d", "90d"] as WindowKey[]).map((w) =>
        safe(`account ${w}`, getAll<InsightRow>(`${act}/insights`, { level: "account", date_preset: `last_${w}`, fields: "reach,frequency" }, token), [])
      )
    ),
    Promise.all(
      (["7d", "30d", "90d"] as WindowKey[]).map((w) =>
        safe(`campaign ${w}`, getAll<InsightRow>(`${act}/insights`, { level: "campaign", date_preset: `last_${w}`, fields: "campaign_id,spend,reach,frequency", limit: "500" }, token), [])
      )
    ),
    safe(
      "ads 7d",
      getAll<InsightRow>(`${act}/insights`, { level: "ad", date_preset: "last_7d", fields: `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,reach,frequency,${BASE_FIELDS}`, sort: "spend_descending", limit: "60" }, token, 1),
      []
    ),
    safe(
      "ads 30d",
      getAll<InsightRow>(`${act}/insights`, { level: "ad", date_preset: "last_30d", fields: `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,reach,frequency,${BASE_FIELDS}`, sort: "spend_descending", limit: "60" }, token, 1),
      []
    ),
  ]);

  const daily: DailyRow[] = dailyRows.map((r) => ({ date: r.date_start, reach: n(r.reach), ...counters(r) })).sort((a, b) => a.date.localeCompare(b.date));
  const campaignDaily: CampaignDailyRow[] = campDaily.map((r) => ({ campaignId: r.campaign_id!, date: r.date_start, ...counters(r) }));

  const adsets: AdsetMeta[] = adsetsRaw.map((a) => ({
    id: a.id,
    name: a.name,
    campaignId: a.campaign_id,
    optimizationGoal: a.optimization_goal,
    resultKind: goalToKind(a.optimization_goal, a.promoted_object?.custom_event_type, !!a.promoted_object?.product_set_id),
    status: a.effective_status,
    dailyBudget: a.daily_budget ? Number(a.daily_budget) / offset : null,
  }));

  const spendByCampaign = new Map<string, number>();
  for (const r of campaignDaily) spendByCampaign.set(r.campaignId, (spendByCampaign.get(r.campaignId) ?? 0) + r.spend);
  const meta = new Map(campaignsRaw.map((c) => [c.id, c]));
  const campaigns: CampaignMeta[] = [];
  for (const id of Array.from(spendByCampaign.keys())) {
    const c = meta.get(id);
    const row = campDaily.find((r) => r.campaign_id === id);
    const kinds = adsets.filter((a) => a.campaignId === id && a.resultKind !== "unknown").map((a) => a.resultKind);
    const objective = c?.objective ?? row?.objective ?? "UNKNOWN";
    const windows: CampaignMeta["windows"] = {};
    (["7d", "30d", "90d"] as WindowKey[]).forEach((w, i) => {
      const hit = campWin[i].find((r) => r.campaign_id === id);
      if (hit) windows[w] = { reach: n(hit.reach), frequency: n(hit.frequency), spend: n(hit.spend), results: 0, resultIndicator: null };
    });
    campaigns.push({
      id,
      name: c?.name ?? row?.campaign_name ?? id,
      objective,
      resultKind: kinds[0] ?? objectiveToKind(objective),
      status: c?.effective_status ?? "UNKNOWN",
      dailyBudget: c?.daily_budget ? Number(c.daily_budget) / offset : null,
      lifetimeBudget: c?.lifetime_budget ? Number(c.lifetime_budget) / offset : null,
      windows,
    });
  }

  const adsetKind = new Map(adsets.map((a) => [a.id, a.resultKind]));
  const toAd = (r: InsightRow): AdRow => ({
    id: r.ad_id!,
    name: r.ad_name ?? r.ad_id!,
    campaignId: r.campaign_id ?? "",
    campaignName: r.campaign_name ?? "",
    adsetName: r.adset_name ?? "",
    status: "UNKNOWN",
    resultKind: adsetKind.get(r.adset_id ?? "") ?? "unknown",
    reach: n(r.reach),
    frequency: n(r.frequency),
    ...counters(r),
  });

  const accountWindows: AccountSnapshot["accountWindows"] = {};
  (["7d", "30d", "90d"] as WindowKey[]).forEach((w, i) => {
    const r = acctWin[i][0];
    if (r) accountWindows[w] = { reach: n(r.reach), frequency: n(r.frequency) };
  });

  const hasShared = adsets.some((a) => a.resultKind === "sharedAtc" || a.resultKind === "sharedPurchase") || daily.some((d) => d.sharedPurchases || d.sharedAtc);

  return {
    accountId,
    name: info.name,
    currency: info.currency,
    timezone: info.timezone_name,
    fetchedAt: new Date().toISOString(),
    endDate: daily.length ? daily[daily.length - 1].date : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    source: "graph-api",
    sharedItems: hasShared ? "full" : "none",
    daily,
    accountWindows,
    campaigns,
    adsets,
    campaignDaily,
    ads: { "7d": ads7.map(toAd), "30d": ads30.map(toAd) },
    ...(errors.length ? { errors } : {}),
  };
}
