// Normalized shapes shared by the MCP snapshot (lib/clients/snapshot.json),
// the live Graph API route (app/api/meta/account/[id]) and the dashboard UI.
// All money values here are in the ad account's NATIVE currency — conversion
// to IDR happens at render time (lib/clients/fx.ts) so a refreshed FX table
// re-prices everything without re-fetching ads data.

export type WindowKey = "7d" | "30d" | "90d";
export const WINDOWS: WindowKey[] = ["7d", "30d", "90d"];
export const WINDOW_DAYS: Record<WindowKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
/** Selected reporting period: a preset window or an explicit custom range. */
export type PeriodSel = { key: WindowKey } | { key: "custom"; start: string; end: string };

export const WINDOW_LABEL: Record<WindowKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

/** Additive delivery/conversion counters (safe to sum across days/campaigns). */
export interface Counters {
  spend: number;
  impressions: number;
  linkClicks: number;
  clicks: number;
  leads: number;
  atc: number;
  purchases: number;
  purchaseValue: number;
  lpv: number;
  // Optimization-event results (from the `results` / `result_values` fields
  // at ad-set level, or catalog_segment_* in live Graph API mode).
  sharedAtc: number; // CPAS add-to-cart for shared catalog items
  sharedPurchases: number; // CPAS purchases for shared catalog items
  sharedPurchaseValue: number; // CPAS purchase value for shared items (native ccy)
  conversations: number; // messaging conversations started (WhatsApp / IG DM)
  profileVisits: number; // Instagram profile visits
  adRecall: number; // estimated ad recall lift (people) — approximate when summed
  thruplays: number;
}

export interface DailyRow extends Counters {
  date: string; // YYYY-MM-DD in the ad account's timezone
  reach: number; // daily reach (not summable across days)
}

export interface CampaignWindowStats {
  reach: number;
  frequency: number;
  spend: number;
  results: number;
  resultIndicator: string | null;
}

/** What a campaign is actually optimizing for — drives which metrics matter. */
export type ResultKind =
  | "adRecall"
  | "reach"
  | "thruplay"
  | "leads"
  | "conversations"
  | "sharedPurchase"
  | "sharedAtc"
  | "purchase"
  | "atc"
  | "lpv"
  | "linkClicks"
  | "profileVisits"
  | "engagement"
  | "unknown";

export interface CampaignMeta {
  id: string;
  name: string;
  objective: string;
  /** Dominant (by spend) ad-set optimization result. */
  resultKind: ResultKind;
  status: string; // effective_status, e.g. ACTIVE / PAUSED / CAMPAIGN_PAUSED
  dailyBudget: number | null; // native currency, major units
  lifetimeBudget: number | null;
  windows: Partial<Record<WindowKey, CampaignWindowStats>>;
}

export interface AdsetMeta {
  id: string;
  name: string;
  campaignId: string;
  optimizationGoal: string;
  resultKind: ResultKind;
  status: string;
  dailyBudget: number | null;
}

export interface CampaignDailyRow extends Counters {
  campaignId: string;
  date: string;
}

export interface AdRow extends Counters {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  adsetName: string;
  status: string;
  resultKind: ResultKind;
  reach: number;
  frequency: number;
  thumbnailUrl?: string | null;
}

export interface AccountWindowStats {
  reach: number;
  frequency: number;
}

export type DataSource = "mcp-snapshot" | "graph-api" | "warehouse";

/** Ad platform an account runs on. Missing = Meta (older snapshots). */
export type Platform = "meta" | "google" | "tiktok";
export const PLATFORM_LABEL: Record<Platform, string> = { meta: "Meta", google: "Google Ads", tiktok: "TikTok Ads" };

export interface AccountSnapshot {
  accountId: string;
  name: string;
  /** Defaults to "meta". Google / TikTok accounts come from the data warehouse. */
  platform?: Platform;
  currency: string;
  timezone: string;
  fetchedAt: string; // ISO timestamp
  /** Last full day contained in the data (yesterday at fetch time). */
  endDate: string;
  source: DataSource;
  /**
   * How CPAS shared-item conversions were sourced:
   *  - "full": catalog_segment_actions / catalog_segment_value (Graph API) —
   *    every campaign reports shared ATC, purchases and value.
   *  - "optimization-results": the MCP exposes shared-item events only as an
   *    ad set's own optimization result, so ATC-optimized ad sets contribute
   *    shared ATC and purchase-optimized ad sets contribute shared purchases +
   *    value (purchases driven by ATC ad sets are not visible → ROAS is a floor).
   *  - "verified": as above, with the missing cross metrics filled from the
   *    locked reference numbers in lib/clients/verified.ts.
   *  - "none": no CPAS activity.
   */
  sharedItems: "none" | "optimization-results" | "verified" | "full";
  /** Present when lib/clients/verified.ts filled missing shared-item metrics. */
  verified?: {
    anchors: { campaignId: string; campaignName: string; start: string; end: string; metrics: Record<string, number | undefined>; source: string }[];
    estimated: { campaignId: string; metric: string; dates: string[] }[];
  };
  daily: DailyRow[];
  accountWindows: Partial<Record<WindowKey, AccountWindowStats>>;
  campaigns: CampaignMeta[];
  adsets: AdsetMeta[];
  campaignDaily: CampaignDailyRow[];
  ads: Partial<Record<"7d" | "30d", AdRow[]>>;
  errors?: string[];
}

export interface ClientConfig {
  id: string;
  name: string;
  accountIds: string[];
  /** Hint used when neither campaign nor account names say "CPAS". */
  cpas?: boolean;
  custom?: boolean; // added by the viewer in the UI
}

export function emptyCounters(): Counters {
  return {
    spend: 0,
    impressions: 0,
    linkClicks: 0,
    clicks: 0,
    leads: 0,
    atc: 0,
    purchases: 0,
    purchaseValue: 0,
    lpv: 0,
    sharedAtc: 0,
    sharedPurchases: 0,
    sharedPurchaseValue: 0,
    conversations: 0,
    profileVisits: 0,
    adRecall: 0,
    thruplays: 0,
  };
}

export const COUNTER_KEYS: (keyof Counters)[] = [
  "spend",
  "impressions",
  "linkClicks",
  "clicks",
  "leads",
  "atc",
  "purchases",
  "purchaseValue",
  "lpv",
  "sharedAtc",
  "sharedPurchases",
  "sharedPurchaseValue",
  "conversations",
  "profileVisits",
  "adRecall",
  "thruplays",
];

/** Money-valued counters (converted to IDR at render time). */
export const MONEY_KEYS: (keyof Counters)[] = ["spend", "purchaseValue", "sharedPurchaseValue"];
