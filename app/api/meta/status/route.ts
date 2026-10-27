import { NextResponse } from "next/server";
import { checkToken } from "@/lib/clients/graph";
import { dataDay } from "@/lib/clients/liveCache";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ live: false });
  const check = await checkToken(token);
  return NextResponse.json({ live: check.ok, tokenError: check.error ?? null, cacheDay: dataDay() });
}
