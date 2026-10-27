import type { Counters, ResultKind } from "./types";

// Maps a Meta `results.indicator` string (e.g. "catalog_segment_actions:omni_purchase",
// "actions:onsite_conversion.messaging_conversation_started_7d") to the kind of
// outcome the ad set optimizes for.
export function indicatorToKind(indicator: string | null | undefined): ResultKind {
  if (!indicator) return "unknown";
  const i = indicator.toLowerCase();
  if (i.startsWith("catalog_segment")) {
    if (i.includes("purchase")) return "sharedPurchase";
    if (i.includes("add_to_cart")) return "sharedAtc";
    return "unknown";
  }
  if (i.includes("ad_recall")) return "adRecall";
  if (i === "reach" || i === "impressions") return "reach";
  if (i.includes("thruplay") || i.includes("video_view")) return "thruplay";
  if (i.includes("lead")) return "leads";
  if (i.includes("messaging") || i.includes("wa_button") || i.includes("whatsapp")) return "conversations";
  if (i.includes("purchase")) return "purchase";
  if (i.includes("add_to_cart")) return "atc";
  if (i.includes("landing_page_view")) return "lpv";
  if (i.includes("profile_visit")) return "profileVisits";
  if (i.includes("link_click")) return "linkClicks";
  if (i.includes("engagement") || i.includes("post_") || i.includes("like")) return "engagement";
  return "unknown";
}

/** Counter that an ad set's optimization `results` feed into (null = already covered / not additive). */
export function kindToCounter(kind: ResultKind): keyof Counters | null {
  switch (kind) {
    case "sharedPurchase":
      return "sharedPurchases";
    case "sharedAtc":
      return "sharedAtc";
    case "conversations":
      return "conversations";
    case "profileVisits":
      return "profileVisits";
    case "adRecall":
      return "adRecall";
    case "thruplay":
      return "thruplays";
    default:
      // leads / lpv / link clicks / purchases already come from their own
      // standard fields; reach is not additive across days.
      return null;
  }
}

export function objectiveToKind(objective: string): ResultKind {
  switch (objective) {
    case "OUTCOME_AWARENESS":
    case "BRAND_AWARENESS":
    case "REACH":
      return "reach";
    case "VIDEO_VIEWS":
      return "thruplay";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "leads";
    case "MESSAGES":
      return "conversations";
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
      return "purchase";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "linkClicks";
    case "OUTCOME_ENGAGEMENT":
    case "POST_ENGAGEMENT":
    case "PAGE_LIKES":
      return "engagement";
    default:
      return "unknown";
  }
}
