"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, ExternalLink, Info, Minus, Play, Sparkles, X } from "lucide-react";
import { LIBRARY, PLATFORM_NAME, SOCIAL_PLATFORMS, allCreatives, creativeKey, embedUrl, fmtCount, tagStats, weekLabel, type TagStat } from "@/lib/creatives/library";
import { TAG_GROUPS, tagGroup, tagLabel, TAGS, type TagGroup } from "@/lib/creatives/taxonomy";
import type { Creative, SocialPlatform } from "@/lib/creatives/types";
import { Card, CardHeader, Pill, Segmented } from "@/components/clients/ui";
import { Sparkline, SERIES_COLORS } from "@/components/clients/Charts";

export type LibraryView = "best" | "tags" | "tag" | "trends";
export interface LibraryRoute {
  lib: LibraryView;
  tag: string | null;
  week: number; // 0 = newest kept week
  pf: SocialPlatform | "all";
  c: string | null; // open creative "platform:id"
  filters: string[]; // extra tag filters on the best view
}

const PF_STYLE: Record<SocialPlatform, { bg: string; text: string; dot: string }> = {
  tiktok: { bg: "bg-slate-900", text: "text-white", dot: "#0b0b0b" },
  instagram: { bg: "bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-400", text: "text-white", dot: "#d6249f" },
  facebook: { bg: "bg-[#1877f2]", text: "text-white", dot: "#1877f2" },
};

const GROUP_TONE: Record<TagGroup, "red" | "amber" | "sky" | "green" | "violet" | "slate"> = {
  hook: "red",
  angle: "amber",
  script: "violet",
  format: "sky",
  content: "green",
  funnel: "slate",
  length: "slate",
  language: "slate",
  platform: "slate",
};

export function TagChip({ tag, onClick, active }: { tag: string; onClick?: (t: string) => void; active?: boolean }) {
  const g = tagGroup(tag);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(tag);
      }}
      title={`${TAG_GROUPS.find((x) => x.key === g)?.label}: ${tagLabel(tag)} — click to see every creative with this tag`}
      className={`min-w-0 max-w-full rounded-full ${active ? "ring-2 ring-slate-900" : ""}`}
    >
      <Pill tone={GROUP_TONE[g]}>
        <span className="opacity-60">{TAG_GROUPS.find((x) => x.key === g)?.label}:</span> {tagLabel(tag)}
      </Pill>
    </button>
  );
}

function PlatformMark({ platform, small }: { platform: SocialPlatform; small?: boolean }) {
  const s = PF_STYLE[platform];
  return <span className={`inline-flex items-center rounded ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} font-semibold ${s.bg} ${s.text}`}>{PLATFORM_NAME[platform]}</span>;
}

function TrendBadge({ trend }: { trend: TagStat["trend"] }) {
  if (trend === "rising") return <Pill tone="green" icon={ArrowUpRight}>Rising</Pill>;
  if (trend === "fading") return <Pill tone="red" icon={ArrowDownRight}>Fading</Pill>;
  if (trend === "new") return <Pill tone="sky" icon={Sparkles}>New</Pill>;
  return <Pill tone="slate" icon={Minus}>Steady</Pill>;
}

function Thumb({ c, tall }: { c: Creative; tall?: boolean }) {
  const [failed, setFailed] = useState(false);
  const s = PF_STYLE[c.platform];
  const hook = c.analysis?.hook.text || c.caption.split("\n")[0];
  return (
    <div className={`relative overflow-hidden rounded-lg ${tall ? "aspect-[3/4]" : "aspect-[4/5]"} ${s.bg}`}>
      {c.platform === "tiktok" && c.url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/thumb?url=${encodeURIComponent(c.url)}`} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute left-2 top-2 flex items-center gap-1">
        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">#{c.rank}</span>
        <PlatformMark platform={c.platform} small />
      </div>
      <div className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-900" title="Creative score (0–100)">
        {c.score}
      </div>
      <p className="absolute inset-x-2 bottom-2 line-clamp-4 text-[12px] font-medium leading-snug text-white">“{hook}”</p>
      {c.mediaType === "video" && <Play className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/70" />}
    </div>
  );
}

function CreativeCard({ c, onOpen, onTag }: { c: Creative & { weekIndex?: number }; onOpen: () => void; onTag: (t: string) => void }) {
  const keyTags = c.tags.filter((t) => ["hook", "format", "script", "angle"].includes(tagGroup(t))).slice(0, 4);
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Thumb c={c} />
      <div className="mt-2 px-0.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate">@{c.author.handle}</span>
          <span className="shrink-0">{fmtCount(c.author.followers)} followers</span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
          {c.metrics.views !== null ? <Metric label="Views" value={fmtCount(c.metrics.views)} /> : <Metric label="Reactions" value={fmtCount(c.metrics.likes)} />}
          <Metric label="Eng./view" value={c.ratios.engagementRate !== null ? `${(c.ratios.engagementRate * 100).toFixed(1)}%` : "—"} />
          <Metric label="Breakout" value={c.ratios.breakout !== null ? `${c.ratios.breakout >= 10 ? Math.round(c.ratios.breakout) : c.ratios.breakout.toFixed(1)}×` : "—"} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {keyTags.map((t) => (
            <TagChip key={t} tag={t} onClick={onTag} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-1 py-1">
      <div className="text-[13px] font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CreativeLibrary({ route, setRoute }: { route: LibraryRoute; setRoute: (r: Partial<LibraryRoute>) => void }) {
  const lib = LIBRARY;
  const week = Math.min(route.week, Math.max(0, lib.snapshots.length - 1));
  const snap = lib.snapshots[week];
  const everything = useMemo(() => allCreatives(lib), [lib]);
  const open = route.c ? everything.find((x) => creativeKey(x) === route.c && (route.c ? true : false)) ?? null : null;
  const goTag = (tag: string) => setRoute({ lib: "tag", tag, c: null });

  if (!lib.snapshots.length) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-slate-400" />
        <h2 className="mt-2 text-base font-semibold">The Creative Library fills up after the first weekly pull</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Every Monday the refresh collects last week&apos;s best organic posts in Indonesia (TikTok, Instagram, Facebook), scores them and breaks down why they work.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <LibraryHeader route={route} setRoute={setRoute} week={week} />
      {route.lib === "best" && <BestView snapIndex={week} route={route} setRoute={setRoute} onTag={goTag} />}
      {route.lib === "tags" && <TagsView week={week} pf={route.pf} onTag={goTag} />}
      {route.lib === "tag" && route.tag && <TagView tag={route.tag} pf={route.pf} setRoute={setRoute} onTag={goTag} />}
      {route.lib === "trends" && <TrendsView pf={route.pf} onTag={goTag} />}
      {open && <CreativeDetail c={open} onClose={() => setRoute({ c: null })} onTag={goTag} weekText={weekLabel(lib.snapshots[open.weekIndex])} />}
      {snap && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          Organic public posts from Indonesia (captions in Bahasa Indonesia or English), discovered by format words, not topics ({SOCIAL_PLATFORMS.map((p) => `${PLATFORM_NAME[p]}: ${snap.seeds[p]?.length ?? 0} seeds, ${snap.candidates[p] ?? 0} eligible`).join(" · ")}). Score = breakout (views ÷ followers) 35%,
          engagement per view 30%, share/save rate 20%, velocity 15%, ranked within each platform. Retention isn&apos;t published for other accounts&apos; posts, so engagement per view is the closest public proxy. Breakdowns are read from the caption, length, format and engagement
          pattern. Keeps the last 4 weekly pulls (28 days).
        </p>
      )}
    </div>
  );
}

function LibraryHeader({ route, setRoute, week }: { route: LibraryRoute; setRoute: (r: Partial<LibraryRoute>) => void; week: number }) {
  const lib = LIBRARY;
  const titles: Record<LibraryView, string> = { best: "This week's best creatives", tags: "Tags", tag: "Tag", trends: "Trends across 4 weeks" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {route.lib === "tag" ? (
            <button onClick={() => setRoute({ lib: "tags", tag: null })} className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-3.5 w-3.5" /> All tags
            </button>
          ) : null}
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{route.lib === "tag" && route.tag ? tagLabel(route.tag) : titles[route.lib]}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {route.lib === "tag" && route.tag
              ? `${TAG_GROUPS.find((g) => g.key === tagGroup(route.tag!))?.label} — ${TAG_GROUPS.find((g) => g.key === tagGroup(route.tag!))?.help} Showing every creative with this tag across the last ${lib.snapshots.length} week(s).`
              : route.lib === "trends"
                ? "Which hooks, formats and structures are gaining or losing share of the weekly top list."
                : "Best organic posts in Indonesia, any topic. Copy the structure, not the product."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(route.lib === "best" || route.lib === "tags") && lib.snapshots.length > 1 && (
            <select
              value={week}
              onChange={(e) => setRoute({ week: Number(e.target.value) })}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              aria-label="Week"
            >
              {lib.snapshots.map((s, i) => (
                <option key={s.week.start} value={i}>
                  {i === 0 ? "Latest · " : ""}
                  {weekLabel(s)}
                </option>
              ))}
            </select>
          )}
          {lib.snapshots.length === 1 && <span className="text-xs text-slate-500">{weekLabel(lib.snapshots[0])}</span>}
        </div>
      </div>
      <Segmented<SocialPlatform | "all">
        value={route.pf}
        onChange={(pf) => setRoute({ pf })}
        options={[{ value: "all", label: "All platforms" }, ...SOCIAL_PLATFORMS.map((p) => ({ value: p as SocialPlatform | "all", label: PLATFORM_NAME[p] }))]}
      />
    </div>
  );
}

type SortKey = "score" | "views" | "share" | "breakout";

function BestView({ snapIndex, route, setRoute, onTag }: { snapIndex: number; route: LibraryRoute; setRoute: (r: Partial<LibraryRoute>) => void; onTag: (t: string) => void }) {
  const snap = LIBRARY.snapshots[snapIndex];
  const [sort, setSort] = useState<SortKey>("score");
  const stats = useMemo(() => tagStats(snapIndex, route.pf), [snapIndex, route.pf]);
  const list = snap.creatives
    .filter((c) => route.pf === "all" || c.platform === route.pf)
    .filter((c) => route.filters.every((t) => c.tags.includes(t)))
    .sort((a, b) =>
      sort === "views"
        ? (b.metrics.views ?? 0) - (a.metrics.views ?? 0)
        : sort === "share"
          ? (b.ratios.shareRate ?? -1) - (a.ratios.shareRate ?? -1)
          : sort === "breakout"
            ? (b.ratios.breakout ?? -1) - (a.ratios.breakout ?? -1)
            : b.score - a.score || a.rank - b.rank
    );
  const top = stats.filter((s) => s.count > 0 && ["hook", "format", "script", "angle"].includes(s.group)).slice(0, 8);
  const toggleFilter = (t: string) => setRoute({ filters: route.filters.includes(t) ? route.filters.filter((x) => x !== t) : [...route.filters, t] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Winning patterns this week" subtitle="Most common hooks, formats, scripts and angles among the top creatives. Click to filter the grid, or open the tag page." />
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          {top.map((s) => (
            <div key={s.tag} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${route.filters.includes(s.tag) ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
              <button onClick={() => toggleFilter(s.tag)} className="text-left">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{TAG_GROUPS.find((g) => g.key === s.group)?.label}</div>
                <div className="text-sm font-medium text-slate-800">{tagLabel(s.tag)}</div>
              </button>
              <div className="text-right text-[11px] tabular-nums text-slate-500">
                <div className="font-semibold text-slate-900">{s.count}×</div>
                <div>avg {s.avgScore}</div>
              </div>
              <button onClick={() => onTag(s.tag)} title="Open tag page" className="text-slate-300 hover:text-slate-900">
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">
          {list.length} creative{list.length === 1 ? "" : "s"}
        </span>
        {route.filters.map((t) => (
          <button key={t} onClick={() => toggleFilter(t)} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-white">
            {tagLabel(t)} <X className="h-3 w-3" />
          </button>
        ))}
        <div className="ml-auto">
          <Segmented<SortKey>
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: "score", label: "Score" },
              { value: "breakout", label: "Breakout" },
              { value: "share", label: "Share rate" },
              { value: "views", label: "Views" },
            ]}
          />
        </div>
      </div>

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {list.map((c) => (
            <CreativeCard key={creativeKey(c)} c={c} onOpen={() => setRoute({ c: creativeKey(c) })} onTag={toggleFilter} />
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">No creatives match these filters this week.</p>
      )}
    </div>
  );
}

function TagsView({ week, pf, onTag }: { week: number; pf: SocialPlatform | "all"; onTag: (t: string) => void }) {
  const stats = useMemo(() => tagStats(week, pf), [week, pf]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {TAG_GROUPS.filter((g) => g.key !== "platform").map((g) => {
        const rows = stats.filter((s) => s.group === g.key);
        if (!rows.length) return null;
        return (
          <Card key={g.key}>
            <CardHeader title={g.label} subtitle={g.help} />
            <ul className="divide-y divide-slate-50">
              {rows.map((s) => (
                <li key={s.tag}>
                  <button onClick={() => onTag(s.tag)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{tagLabel(s.tag)}</span>
                      <span className="block text-[11px] text-slate-400">
                        {s.count} this week · avg score {s.avgScore ?? "—"}
                      </span>
                    </span>
                    <Sparkline values={s.byWeek.map((w) => w.share * 100)} color={SERIES_COLORS[0]} width={72} height={22} />
                    <TrendBadge trend={s.trend} />
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function TagView({ tag, pf, setRoute, onTag }: { tag: string; pf: SocialPlatform | "all"; setRoute: (r: Partial<LibraryRoute>) => void; onTag: (t: string) => void }) {
  const items = allCreatives().filter((c) => c.tags.includes(tag) && (pf === "all" || c.platform === pf));
  const stat = tagStats(0, pf).find((s) => s.tag === tag);
  const pairs = new Map<string, number>();
  for (const c of items) for (const t of c.tags) if (t !== tag && ["hook", "format", "script", "angle", "content"].includes(tagGroup(t))) pairs.set(t, (pairs.get(t) ?? 0) + 1);
  const topPairs = Array.from(pairs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const platformsSplit = SOCIAL_PLATFORMS.map((p) => ({ p, n: items.filter((c) => c.platform === p).length })).filter((x) => x.n);
  const avg = items.length ? Math.round(items.reduce((a, c) => a + c.score, 0) / items.length) : null;
  const byWeek = LIBRARY.snapshots.map((s, i) => ({ s, list: items.filter((c) => c.weekIndex === i).sort((a, b) => b.score - a.score) })).filter((x) => x.list.length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Creatives (4 weeks)</div>
          <div className="mt-1 text-2xl font-semibold">{items.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Avg score</div>
          <div className="mt-1 text-2xl font-semibold">{avg ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Share of top list, by week</div>
          <div className="mt-2 flex items-center gap-2">
            <Sparkline values={(stat?.byWeek ?? []).map((w) => w.share * 100)} width={96} height={26} />
            {stat && <TrendBadge trend={stat.trend} />}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Platforms</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {platformsSplit.map(({ p, n }) => (
              <span key={p} className="inline-flex items-center gap-1 text-xs text-slate-600">
                <PlatformMark platform={p} small /> {n}
              </span>
            ))}
          </div>
        </Card>
      </div>
      {topPairs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Often paired with:</span>
          {topPairs.map(([t, n]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <TagChip tag={t} onClick={onTag} />
              <span className="text-[10px] text-slate-400">{n}×</span>
            </span>
          ))}
        </div>
      )}
      {byWeek.map(({ s, list }, i) => (
        <section key={s.week.start} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">
            {i === 0 && s === LIBRARY.snapshots[0] ? "Latest week · " : ""}
            {weekLabel(s)} <span className="font-normal text-slate-400">· {list.length}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {list.map((c) => (
              <CreativeCard key={creativeKey(c)} c={c} onOpen={() => setRoute({ c: creativeKey(c) })} onTag={onTag} />
            ))}
          </div>
        </section>
      ))}
      {!items.length && <p className="py-10 text-center text-sm text-slate-400">No creatives with this tag in the kept weeks{pf !== "all" ? ` on ${PLATFORM_NAME[pf]}` : ""}.</p>}
    </div>
  );
}

function TrendsView({ pf, onTag }: { pf: SocialPlatform | "all"; onTag: (t: string) => void }) {
  const stats = useMemo(() => tagStats(0, pf), [pf]);
  const weeks = LIBRARY.snapshots.length;
  const rising = stats.filter((s) => s.trend === "rising" || s.trend === "new").filter((s) => s.count >= 2).slice(0, 8);
  const fading = stats.filter((s) => s.trend === "fading").slice(0, 8);
  return (
    <div className="space-y-4">
      {weeks < 2 && (
        <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Trends need at least two weekly pulls. Everything below is marked “New” until next Monday&apos;s refresh adds a second week.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendList title="Rising / new" subtitle="Gaining share of the weekly top list — try these now" rows={rising} onTag={onTag} />
        <TrendList title="Fading" subtitle="Losing share or dropped out — refresh creatives that rely on them" rows={fading} onTag={onTag} />
      </div>
      <Card>
        <CardHeader title="Share of the top list by week" subtitle="Each row is one tag; the line shows the % of the weekly top creatives carrying it (oldest → newest)." />
        <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:px-5 md:grid-cols-2">
          {TAG_GROUPS.filter((g) => ["hook", "format", "script", "angle"].includes(g.key)).map((g) => (
            <div key={g.key} className="py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
              {stats
                .filter((s) => s.group === g.key)
                .slice(0, 6)
                .map((s) => (
                  <button key={s.tag} onClick={() => onTag(s.tag)} className="flex w-full items-center gap-3 rounded px-1 py-1 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{tagLabel(s.tag)}</span>
                    <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">{Math.round((s.byWeek[s.byWeek.length - 1]?.share ?? 0) * 100)}%</span>
                    <Sparkline values={s.byWeek.map((w) => w.share * 100)} width={80} height={20} />
                  </button>
                ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TrendList({ title, subtitle, rows, onTag }: { title: string; subtitle: string; rows: TagStat[]; onTag: (t: string) => void }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {rows.length ? (
        <ul className="divide-y divide-slate-50">
          {rows.map((s) => (
            <li key={s.tag}>
              <button onClick={() => onTag(s.tag)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-400">{TAG_GROUPS.find((g) => g.key === s.group)?.label}</span>
                  <span className="block text-sm font-medium text-slate-800">{tagLabel(s.tag)}</span>
                </span>
                <Sparkline values={s.byWeek.map((w) => w.share * 100)} width={72} height={22} />
                <TrendBadge trend={s.trend} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-center text-sm text-slate-400">Nothing yet.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CreativeDetail({ c, onClose, onTag, weekText }: { c: Creative; onClose: () => void; onTag: (t: string) => void; weekText: string }) {
  const [play, setPlay] = useState(false);
  const a = c.analysis;
  const embed = embedUrl(c);
  const parts: { k: keyof Creative["scoreParts"]; label: string; w: string }[] = [
    { k: "breakout", label: "Breakout (views ÷ followers)", w: "35%" },
    { k: "engagement", label: "Engagement per view", w: "30%" },
    { k: "share", label: "Share + save rate", w: "20%" },
    { k: "velocity", label: "Velocity (per day)", w: "15%" },
  ];
  const byGroup = (g: TagGroup) => c.tags.filter((t) => tagGroup(t) === g);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl scrollbar-thin"
        role="dialog"
        aria-modal="true"
        aria-label="Creative breakdown"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <PlatformMark platform={c.platform} />
            <span className="truncate text-sm font-semibold text-slate-900">@{c.author.handle}</span>
            <span className="shrink-0 text-xs text-slate-400">
              #{c.rank} · score {c.score} · {weekText}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Open original <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-500">Sample creative</span>
            )}
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-900" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-5">
          <div className="md:col-span-2">
            {play && embed ? (
              <iframe src={embed} className="aspect-[9/16] w-full rounded-lg border border-slate-200" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="Creative" />
            ) : (
              <button onClick={() => setPlay(true)} className="block w-full text-left" disabled={!embed}>
                <Thumb c={c} tall />
                {embed && <span className="mt-1 block text-center text-[11px] text-slate-500">Click to play the post here</span>}
              </button>
            )}
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
              <Metric label="Views" value={fmtCount(c.metrics.views)} />
              <Metric label="Likes" value={fmtCount(c.metrics.likes)} />
              <Metric label="Comments" value={fmtCount(c.metrics.comments)} />
              <Metric label="Shares" value={fmtCount(c.metrics.shares)} />
              <Metric label="Saves" value={fmtCount(c.metrics.saves)} />
              <Metric label="Followers" value={fmtCount(c.author.followers)} />
            </div>
            <div className="mt-3 rounded-lg border border-slate-100 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why it scored {c.score}</div>
              {parts.map((p) => {
                const v = c.scoreParts[p.k];
                return (
                  <div key={p.k} className="mb-1.5">
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>
                        {p.label} <span className="text-slate-400">· {p.w}</span>
                      </span>
                      <span className="tabular-nums">{v === null ? "n/a" : `top ${Math.max(1, Math.round((1 - v) * 100))}%`}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(v ?? 0) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="mt-2 text-[10px] leading-snug text-slate-400">Percentile within this week&apos;s {PLATFORM_NAME[c.platform]} pool (all platforms combined when fewer than 5 {PLATFORM_NAME[c.platform]} posts qualified). Retention isn&apos;t public for other accounts&apos; posts; engagement per view is the proxy.</p>
            </div>
          </div>

          <div className="space-y-4 md:col-span-3">
            {a ? (
              <>
                <section>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hook</div>
                  <p className="mt-1 text-[15px] font-medium leading-snug text-slate-900">“{a.hook.text}”</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">{byGroup("hook").map((t) => <TagChip key={t} tag={t} onClick={onTag} />)}</div>
                </section>
                <section className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why it works</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{a.whyItWorks}</p>
                </section>
                <section>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Script structure</div>
                  <div className="mt-1 flex flex-wrap gap-1">{byGroup("script").map((t) => <TagChip key={t} tag={t} onClick={onTag} />)}</div>
                  <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
                    {a.script.beats.map((b, i) => (
                      <li key={i} className="text-sm text-slate-700">
                        {b}
                      </li>
                    ))}
                  </ol>
                </section>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Angle" tags={byGroup("angle")} onTag={onTag} />
                  <Field label="Funnel stage" tags={byGroup("funnel")} onTag={onTag} />
                  <Field label="Content type" tags={byGroup("content")} onTag={onTag} />
                  <Field label="Format" tags={byGroup("format")} onTag={onTag} />
                  <Field label="Length & language" tags={[...byGroup("length"), ...byGroup("language")]} onTag={onTag} />
                </div>
                <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Replicate it for a client</div>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-900">{a.replicate}</p>
                </section>
                <p className="text-[11px] text-slate-400">
                  Breakdown confidence: <b>{a.confidence}</b>. Read from caption, length, format and engagement pattern. Play the post to confirm the opening.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">This creative was ranked but not analysed yet.</p>
            )}
            <section>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Caption</div>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{c.caption || "—"}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Posted {new Date(c.postedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB · surfaced by “{c.seed}”
              </p>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, tags, onTag }: { label: string; tags: string[]; onTag: (t: string) => void }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">{tags.length ? tags.map((t) => <TagChip key={t} tag={t} onClick={onTag} />) : <span className="text-xs text-slate-400">—</span>}</div>
    </div>
  );
}

export const ALL_TAG_VALUES = TAGS;
