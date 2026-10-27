import { NextResponse } from "next/server";

export const revalidate = 86400;

// GET /api/thumb?url=<tiktok video url>
// TikTok cover images are signed and expire, so the library stores the post URL
// only; this route resolves a fresh cover through TikTok's public oEmbed
// endpoint and caches the redirect for a day. Other platforms → 404 (the UI
// shows a text card instead).
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!/^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+/.test(url)) return new NextResponse(null, { status: 404 });
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { next: { revalidate } });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const body = (await res.json()) as { thumbnail_url?: string };
    if (!body.thumbnail_url) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(body.thumbnail_url, { status: 302, headers: { "Cache-Control": "public, max-age=21600, s-maxage=21600" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
