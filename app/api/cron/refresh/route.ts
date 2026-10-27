import { NextResponse } from "next/server";
import { DEFAULT_CLIENTS, isMetaAccount } from "@/lib/clients/registry";
import { dataDay, getAccountCached } from "@/lib/clients/liveCache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by Vercel Cron (vercel.json) every day at 02:00 UTC = 09:00 WIB.
// The cache key rolls over at that moment, so this request does the fresh
// pull for every default client and warms the cache for the day.
// Clients added in the browser are cached on their first view instead.
export async function GET(req: Request) {
  // Public to the login wall (Vercel Cron has no session), so it must carry CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "META_ACCESS_TOKEN not set" }, { status: 501 });

  const ids = Array.from(new Set(DEFAULT_CLIENTS.flatMap((c) => c.accountIds))).filter(isMetaAccount);
  const started = Date.now();
  const results = await Promise.allSettled(ids.map((id) => getAccountCached(id, token)));
  const summary = ids.map((id, i) => {
    const r = results[i];
    return r.status === "fulfilled"
      ? { id, ok: true, name: r.value.name, endDate: r.value.endDate, partialErrors: r.value.errors ?? [] }
      : { id, ok: false, error: (r.reason as Error).message };
  });
  const failed = summary.filter((s) => !s.ok).length;
  return NextResponse.json({ dataDay: dataDay(), ms: Date.now() - started, failed, accounts: summary }, { status: failed ? 207 : 200 });
}
