// Server-only: daily cache for live Graph API pulls.
//
// Each ad account's snapshot is stored in Next.js' data cache (persistent on
// Vercel) under a key that includes the "data day". The data day rolls over
// at 09:00 Asia/Jakarta, so the first request after 9 AM — normally the
// Vercel cron in vercel.json — pulls fresh numbers from Meta and everyone
// else reads the cached copy. No extra storage service is needed.

import { revalidateTag, unstable_cache } from "next/cache";
import { fetchAccountLive } from "./graph";
import type { AccountSnapshot } from "./types";

const REFRESH_HOUR_WIB = 9;
const CACHE_VERSION = "v1";

export const accountTag = (id: string) => `meta-account-${id}`;

/** YYYY-MM-DD of the current refresh cycle (changes at 09:00 WIB / 02:00 UTC). */
export function dataDay(now = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 3_600_000 - REFRESH_HOUR_WIB * 3_600_000);
  return wib.toISOString().slice(0, 10);
}

class PartialSnapshot extends Error {
  constructor(public snapshot: AccountSnapshot) {
    super("partial snapshot");
  }
}

/**
 * Cached live pull. Snapshots with partial errors are returned but never
 * cached, so a transient Meta hiccup doesn't stick for a whole day.
 */
export async function getAccountCached(id: string, token: string): Promise<AccountSnapshot & { cacheDay: string }> {
  const day = dataDay();
  const cached = unstable_cache(
    async () => {
      const snap = await fetchAccountLive(id, token);
      if (snap.errors?.length) throw new PartialSnapshot(snap);
      return snap;
    },
    ["meta-account", CACHE_VERSION, id, day],
    { tags: [accountTag(id), "meta-all"], revalidate: 2 * 24 * 3600 }
  );
  try {
    return { ...(await cached()), cacheDay: day };
  } catch (e) {
    if (e instanceof PartialSnapshot || (e as { snapshot?: AccountSnapshot }).snapshot) {
      return { ...(e as PartialSnapshot).snapshot, cacheDay: day };
    }
    throw e;
  }
}

/** Drop the cached snapshot so the next read pulls from Meta again. */
export function invalidateAccount(id: string) {
  revalidateTag(accountTag(id));
}
