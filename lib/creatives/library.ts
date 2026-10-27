// Read-side helpers for the Creative Library (4 weekly snapshots, newest first).

import data from "./library.json";
import { tagGroup, type TagGroup } from "./taxonomy";
import type { Creative, CreativeLibraryData, CreativeSnapshot, SocialPlatform } from "./types";

export const LIBRARY = data as unknown as CreativeLibraryData;

export const PLATFORM_NAME: Record<SocialPlatform, string> = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
export const SOCIAL_PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "facebook"];

export const creativeKey = (c: Pick<Creative, "platform" | "id">) => `${c.platform}:${c.id}`;

export function weekLabel(s: CreativeSnapshot) {
  const f = (iso: string, y = false) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${f(s.week.start)} – ${f(s.week.end, true)}`;
}

/** All creatives across the kept weeks, each annotated with its week index (0 = newest). */
export function allCreatives(lib: CreativeLibraryData = LIBRARY): (Creative & { weekIndex: number; weekStart: string })[] {
  return lib.snapshots.flatMap((s, i) => s.creatives.map((c) => ({ ...c, weekIndex: i, weekStart: s.week.start })));
}

export interface TagStat {
  tag: string;
  group: TagGroup;
  count: number; // in the selected week
  avgScore: number | null;
  byWeek: { weekStart: string; count: number; share: number; avgScore: number | null }[]; // oldest → newest
  trend: "rising" | "steady" | "fading" | "new";
  best: Creative | null;
}

/** Tag statistics for one week, with the 4-week history for trends. */
export function tagStats(weekIndex: number, platform: SocialPlatform | "all", lib: CreativeLibraryData = LIBRARY): TagStat[] {
  const weeks = [...lib.snapshots].reverse(); // oldest → newest
  const inScope = (c: Creative) => platform === "all" || c.platform === platform;
  const tags = new Set<string>();
  for (const s of lib.snapshots) for (const c of s.creatives) if (inScope(c)) for (const t of c.tags) if (tagGroup(t) !== "platform") tags.add(t);
  const target = lib.snapshots[weekIndex];
  const out: TagStat[] = [];
  for (const tag of Array.from(tags)) {
    const byWeek = weeks.map((s) => {
      const list = s.creatives.filter((c) => inScope(c));
      const hit = list.filter((c) => c.tags.includes(tag));
      return {
        weekStart: s.week.start,
        count: hit.length,
        share: list.length ? hit.length / list.length : 0,
        avgScore: hit.length ? Math.round(hit.reduce((a, c) => a + c.score, 0) / hit.length) : null,
      };
    });
    const hits = target ? target.creatives.filter((c) => inScope(c) && c.tags.includes(tag)) : [];
    const idx = weeks.length - 1 - weekIndex; // position of the selected week in byWeek
    const cur = byWeek[idx]?.share ?? 0;
    const prior = byWeek.slice(0, idx).map((w) => w.share);
    const priorAvg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
    const trend: TagStat["trend"] =
      priorAvg === null ? "new" : priorAvg === 0 && cur > 0 ? "new" : cur >= priorAvg * 1.3 && cur - priorAvg >= 0.05 ? "rising" : cur <= priorAvg * 0.7 ? "fading" : "steady";
    if (!hits.length && trend !== "fading") continue;
    out.push({
      tag,
      group: tagGroup(tag),
      count: hits.length,
      avgScore: hits.length ? Math.round(hits.reduce((a, c) => a + c.score, 0) / hits.length) : null,
      byWeek,
      trend,
      best: [...hits].sort((a, b) => b.score - a.score)[0] ?? null,
    });
  }
  return out.sort((a, b) => b.count - a.count || (b.avgScore ?? 0) - (a.avgScore ?? 0));
}

/** Embed URL the viewer's browser can load (platform player). */
export function embedUrl(c: Creative): string | null {
  if (!c.url) return null; // demo creatives have no real post
  if (c.platform === "tiktok") return `https://www.tiktok.com/embed/v2/${c.id}`;
  if (c.platform === "instagram") {
    const m = c.url.match(/instagram\.com\/(p|reel|tv)\/([^/?#]+)/);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/` : null;
  }
  if (c.platform === "facebook") {
    const isVideo = /\/(reel|videos|watch)/.test(c.url);
    return `https://www.facebook.com/plugins/${isVideo ? "video" : "post"}.php?href=${encodeURIComponent(c.url)}&show_text=true&width=400`;
  }
  return null;
}

export function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}
