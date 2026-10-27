import type { AccountSnapshot, ClientConfig, Platform } from "./types";
import snapshotJson from "./snapshot.json";
import { applyVerified } from "./verified";

// Meta ad account IDs are plain digits. Google Ads IDs keep their dashes
// (123-456-7890). Google Ads and TikTok accounts are listed in XCHANNEL_ACCOUNTS
// and loaded from data/xchannel via the snapshot (no live Graph API pull).
export const DEFAULT_CLIENTS: ClientConfig[] = [
  { id: "alpha", name: "Alpha Fitness", accountIds: ["576226255045540", "933-926-4990"] },
  { id: "beta", name: "Beta Skincare", accountIds: ["7105040784183072", "6017045666140681", "359-953-4112"] },
  { id: "gamma", name: "Gamma Home", accountIds: ["7669710482744998"], cpas: true },
  { id: "delta", name: "Delta Baby", accountIds: ["593040334267396"], cpas: true },
  { id: "epsilon", name: "Epsilon Jewelry", accountIds: ["2082953888172512"] },
  { id: "zeta", name: "Zeta Beauty", accountIds: ["2091471302347958", "8249072700800877134"] },
  { id: "eta", name: "Eta Coffee", accountIds: ["9668745755651323751"] },
];

/** Non-Meta accounts: refreshed from the data warehouse. */
export const XCHANNEL_ACCOUNTS: { accountId: string; platform: Platform; client: string }[] = [
  { accountId: "933-926-4990", platform: "google", client: "alpha" },
  { accountId: "359-953-4112", platform: "google", client: "beta" },
  { accountId: "9668745755651323751", platform: "tiktok", client: "eta" },
  { accountId: "8249072700800877134", platform: "tiktok", client: "zeta" },
];
const XCHANNEL_IDS = new Set(XCHANNEL_ACCOUNTS.map((a) => a.accountId));

/** True for accounts the Meta Graph API can pull (everything not in XCHANNEL_ACCOUNTS). */
export function isMetaAccount(id: string): boolean {
  return !XCHANNEL_IDS.has(id);
}

const RAW_SNAPSHOT = snapshotJson as unknown as {
  fetchedAt: string;
  accounts: Record<string, AccountSnapshot>;
};

/** MCP snapshot with locked Ads Manager figures applied (lib/clients/verified.ts). */
export const SNAPSHOT = {
  fetchedAt: RAW_SNAPSHOT.fetchedAt,
  accounts: Object.fromEntries(Object.entries(RAW_SNAPSHOT.accounts).map(([id, a]) => [id, applyVerified(a)])),
};

const CUSTOM_KEY = "client-ads-dashboard:custom-clients:v1";

export function loadCustomClients(): ClientConfig[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && c.id && Array.isArray(c.accountIds)) : [];
  } catch {
    return [];
  }
}

export function saveCustomClients(clients: ClientConfig[]) {
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(clients));
  } catch {
    /* storage unavailable — clients live for this session only */
  }
}

export function normalizeAccountId(raw: string): string {
  return raw.trim().replace(/^act_/i, "").replace(/\D/g, "");
}
