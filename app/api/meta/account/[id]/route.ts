import { NextResponse } from "next/server";
import { getAccountCached, invalidateAccount } from "@/lib/clients/liveCache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/meta/account/<adAccountId>[?refresh=1] → AccountSnapshot.
// Served from the daily cache (refreshed at 09:00 WIB); ?refresh=1 forces a
// new pull from the Graph API. Needs META_ACCESS_TOKEN (system-user token with
// ads_read on the accounts).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.replace(/^act_/i, "").replace(/\D/g, "");
  if (!id) return NextResponse.json({ error: "Invalid ad account ID" }, { status: 400 });
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Live Meta data is not configured. Set META_ACCESS_TOKEN on the server (e.g. Vercel → Settings → Environment Variables) to pull new ad accounts." },
      { status: 501 }
    );
  }
  try {
    if (new URL(req.url).searchParams.get("refresh") === "1") invalidateAccount(id);
    const snap = await getAccountCached(id, token);
    return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
