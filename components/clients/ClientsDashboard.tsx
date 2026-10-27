"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Database, LayoutGrid, LogOut, Plus, Sparkles, Tags, Trash2, TrendingUp, type LucideIcon } from "lucide-react";
import { DEFAULT_CLIENTS, SNAPSHOT, isMetaAccount, loadCustomClients, saveCustomClients } from "@/lib/clients/registry";
import { FX_SNAPSHOT, type FxState } from "@/lib/clients/fx";
import { PLATFORM_ORDER, addDaysIso, buildClientModel, daysIn, fmtDate, fmtIdr, resolvePeriod, windowRange, type ClientModel, type PlatformSel } from "@/lib/clients/analysis";
import { PLATFORM_LABEL, WINDOW_LABEL, type AccountSnapshot, type ClientConfig, type PeriodSel, type Platform, type WindowKey } from "@/lib/clients/types";
import type { SocialPlatform } from "@/lib/creatives/types";
import { OTHER_COLOR, SERIES_COLORS } from "@/components/clients/Charts";
import { PlatformBadge, Segmented } from "@/components/clients/ui";
import { Overview } from "@/components/clients/Overview";
import { CLIENT_TABS, ClientDetail, type ClientTab } from "@/components/clients/ClientDetail";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { PeriodPicker } from "@/components/clients/PeriodPicker";
import { DataSettings } from "@/components/clients/DataSettings";
import { CreativeLibrary, type LibraryRoute, type LibraryView } from "@/components/creatives/CreativeLibrary";
import { buildClientWeekly, buildPortfolioWeekly } from "@/lib/clients/weekly";

export type LoadState = Record<string, { status: "loading" | "error"; message?: string }>;

export function clientColor(index: number) {
  return SERIES_COLORS[index] ?? OTHER_COLOR;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type View = "overview" | "client" | "library" | "data";
interface Route {
  view: View;
  client: string | null;
  tab: ClientTab;
  lib: LibraryRoute;
}
const LIB_DEFAULT: LibraryRoute = { lib: "best", tag: null, week: 0, pf: "all", c: null, filters: [] };
const ROUTE_DEFAULT: Route = { view: "overview", client: null, tab: "summary", lib: LIB_DEFAULT };
const LIB_VIEWS: LibraryView[] = ["best", "tags", "tag", "trends"];
const SOCIAL: SocialPlatform[] = ["tiktok", "instagram", "facebook"];

function readUrl(): { route: Route; period: PeriodSel | null; platform: PlatformSel } {
  if (typeof window === "undefined") return { route: ROUTE_DEFAULT, period: null, platform: "all" };
  const p = new URLSearchParams(window.location.search);
  const w = p.get("w");
  const from = p.get("from");
  const to = p.get("to");
  const period: PeriodSel | null =
    from && to && ISO.test(from) && ISO.test(to) ? { key: "custom", start: from, end: to } : w === "7d" || w === "30d" || w === "90d" ? { key: w } : null;
  const pf = p.get("platform");
  const client = p.get("client");
  const v = p.get("view");
  const view: View = v === "library" || v === "data" ? v : client ? "client" : "overview";
  const lib = p.get("lib") as LibraryView | null;
  const lpf = p.get("pf") as SocialPlatform | null;
  return {
    route: {
      view,
      client: view === "client" ? client : null,
      tab: CLIENT_TABS.find((t) => t.value === p.get("tab"))?.value ?? "summary",
      lib: {
        lib: lib && LIB_VIEWS.includes(lib) ? lib : "best",
        tag: p.get("tag"),
        week: Math.max(0, Math.min(3, Number(p.get("week")) || 0)),
        pf: lpf && SOCIAL.includes(lpf) ? lpf : "all",
        c: p.get("c"),
        filters: (p.get("f") ?? "").split(",").filter(Boolean),
      },
    },
    period,
    platform: pf === "meta" || pf === "google" || pf === "tiktok" ? pf : "all",
  };
}

/** The page's own URL params: client + tab, or the library route, or the data page. */
function routeParams(p: URLSearchParams, r: Route) {
  for (const k of ["view", "client", "tab", "lib", "tag", "week", "pf", "c", "f"]) p.delete(k);
  if (r.view === "client" && r.client) {
    p.set("client", r.client);
    if (r.tab !== "summary") p.set("tab", r.tab);
  } else if (r.view === "library") {
    p.set("view", "library");
    if (r.lib.lib !== "best") p.set("lib", r.lib.lib);
    if (r.lib.lib === "tag" && r.lib.tag) p.set("tag", r.lib.tag);
    if (r.lib.week) p.set("week", String(r.lib.week));
    if (r.lib.pf !== "all") p.set("pf", r.lib.pf);
    if (r.lib.c) p.set("c", r.lib.c);
    if (r.lib.lib === "best" && r.lib.filters.length) p.set("f", r.lib.filters.join(","));
  } else if (r.view === "data") p.set("view", "data");
}

function platformParam(p: URLSearchParams, platform: PlatformSel) {
  if (platform === "all") p.delete("platform");
  else p.set("platform", platform);
}

function writeUrl(mutate: (p: URLSearchParams) => void, push = false) {
  const p = new URLSearchParams(window.location.search);
  mutate(p);
  const url = `${window.location.pathname}${p.toString() ? `?${p}` : ""}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** Does a client run on this platform? Unloaded (custom) clients are Meta. */
export function runsOn(m: ClientModel, platform: PlatformSel): boolean {
  if (platform === "all") return true;
  return m.platforms.length ? m.platforms.includes(platform) : platform === "meta";
}

function periodParams(p: URLSearchParams, period: PeriodSel) {
  p.delete("w");
  p.delete("from");
  p.delete("to");
  if (period.key === "custom") {
    p.set("from", period.start);
    p.set("to", period.end);
  } else if (period.key !== "30d") p.set("w", period.key);
}

export function ClientsDashboard() {
  const [period, setPeriod] = useState<PeriodSel>({ key: "30d" });
  const [compare, setCompare] = useState(true);
  const [platform, setPlatform] = useState<PlatformSel>("all");
  const [route, setRouteState] = useState<Route>(ROUTE_DEFAULT);
  const selected = route.view === "client" ? route.client : null;
  const [custom, setCustom] = useState<ClientConfig[]>([]);
  const [live, setLive] = useState<Record<string, AccountSnapshot>>({});
  const [loading, setLoading] = useState<LoadState>({});
  const [fx, setFx] = useState<FxState>(FX_SNAPSHOT);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Boot: URL state, custom clients, FX, live-status.
  useEffect(() => {
    const u = readUrl();
    setRouteState(u.route);
    if (u.period) setPeriod(u.period);
    setPlatform(u.platform);
    setCustom(loadCustomClients());
    fetch("/api/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.table && setFx(d))
      .catch(() => {});
    fetch("/api/meta/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setLiveEnabled(Boolean(d?.live));
        setTokenError(d?.tokenError ?? null);
      })
      .catch(() => {});
    const onPop = () => {
      const u2 = readUrl();
      setRouteState(u2.route);
      setPlatform(u2.platform);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** Move to another page (pushes history); partial library routes merge into the current one. */
  const go = useCallback((next: Partial<Omit<Route, "lib">> & { lib?: Partial<LibraryRoute> }, push = true) => {
    setRouteState((cur) => {
      const r: Route = { ...cur, ...next, lib: { ...cur.lib, ...(next.lib ?? {}) } };
      writeUrl((p) => routeParams(p, r), push);
      return r;
    });
    if (push) window.scrollTo({ top: 0 });
  }, []);
  const navigate = useCallback((client: string | null) => go(client ? { view: "client", client, tab: "summary" } : { view: "overview", client: null }), [go]);
  // Only switching library page or tag adds a history entry; opening a creative, filters and week/platform don't.
  const setLib = useCallback((r: Partial<LibraryRoute>) => go({ view: "library", lib: r }, r.lib !== undefined || r.tag !== undefined), [go]);

  const changePlatform = (next: PlatformSel) => {
    setPlatform(next);
    writeUrl((p) => platformParam(p, next));
  };

  const changePeriod = (next: PeriodSel) => {
    setPeriod(next);
    writeUrl((p) => periodParams(p, next));
  };

  const fetchAccount = useCallback(async (id: string, force = false) => {
    setLoading((s) => ({ ...s, [id]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/meta/account/${id}${force ? "?refresh=1" : ""}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setLive((s) => ({ ...s, [id]: body as AccountSnapshot }));
      setLoading((s) => {
        const rest = { ...s };
        delete rest[id];
        return rest;
      });
    } catch (e) {
      setLoading((s) => ({ ...s, [id]: { status: "error", message: (e as Error).message } }));
    }
  }, []);

  const clients = useMemo(() => [...DEFAULT_CLIENTS, ...custom], [custom]);
  const accounts = useMemo(() => ({ ...SNAPSHOT.accounts, ...live }), [live]);

  // Live mode: load every client's daily-cached Graph API data on open (the
  // snapshot shows meanwhile). Without a token, only custom clients missing
  // from the snapshot are attempted (they'll show the setup message).
  useEffect(() => {
    const ids = (liveEnabled ? clients.flatMap((c) => c.accountIds) : custom.flatMap((c) => c.accountIds).filter((id) => !accounts[id])).filter(isMetaAccount);
    for (const id of Array.from(new Set(ids))) if (!live[id] && !loading[id]) fetchAccount(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEnabled, custom]);

  // Blended models decide which platforms each client runs on; the scoped
  // models (one platform, or blended again for "all") drive every view.
  const blended: ClientModel[] = useMemo(() => clients.map((c) => buildClientModel(c, accounts, fx, period, compare)), [clients, accounts, fx, period, compare]);
  const allModels: ClientModel[] = useMemo(
    () => (platform === "all" ? blended : clients.map((c) => buildClientModel(c, accounts, fx, period, compare, platform))),
    [blended, clients, accounts, fx, period, compare, platform]
  );
  const models = useMemo(() => allModels.filter((m, i) => runsOn(blended[i], platform)), [allModels, blended, platform]);
  const visibleClients = useMemo(() => clients.filter((c, i) => runsOn(blended[i], platform)), [clients, blended, platform]);
  const portfolioWeekly = useMemo(() => buildPortfolioWeekly(visibleClients, accounts, fx, platform), [visibleClients, accounts, fx, platform]);
  // Clients per platform, for the platform switcher.
  const platformCounts = useMemo(() => {
    const out: Partial<Record<Platform, number>> = {};
    for (const m of blended) for (const pf of m.platforms.length ? m.platforms : (["meta"] as Platform[])) out[pf] = (out[pf] ?? 0) + 1;
    return out;
  }, [blended]);
  const colors = useMemo(() => Object.fromEntries(clients.map((c, i) => [c.id, clientColor(i)])), [clients]);

  const addClient = (c: ClientConfig) => {
    const next = [...custom, c];
    setCustom(next);
    saveCustomClients(next);
    setAdding(false);
    navigate(c.id);
  };
  const removeClient = (id: string) => {
    const next = custom.filter((c) => c.id !== id);
    setCustom(next);
    saveCustomClients(next);
    if (selected === id) navigate(null);
  };
  const refreshAll = () => {
    for (const c of clients) for (const id of c.accountIds.filter(isMetaAccount)) fetchAccount(id, true);
  };

  const current = selected ? models.find((m) => m.client.id === selected) ?? null : null;
  // Stable per-platform model builders (memoised so signal lists aren't rebuilt every render).
  const scopedFor = useCallback(
    (m: ClientModel, pf: Platform) => buildClientModel(m.client, accounts, fx, period, compare, pf),
    [accounts, fx, period, compare]
  );
  const scopedCurrent = useCallback((pf: Platform) => scopedFor(current!, pf), [scopedFor, current]);
  const currentBlended = selected ? blended.find((m) => m.client.id === selected) ?? null : null;
  const endDate = blended.map((m) => m.endDate).sort().pop() ?? SNAPSHOT.fetchedAt.slice(0, 10);
  const { range: globalRange, presetKey } = resolvePeriod(period, endDate);
  const periodDays = daysIn(globalRange);
  const periodLabel = presetKey ? WINDOW_LABEL[presetKey] : `Custom · ${periodDays} days`;
  const prevAvailable = addDaysIso(globalRange.start, -periodDays) >= addDaysIso(endDate, -89);
  const anyLive = Object.keys(live).length > 0;
  // Presets picked from the period menu map back to their short URL form.
  const applyRange = (start: string, end: string) => {
    const preset = (["7d", "30d", "90d"] as WindowKey[]).find((k) => {
      const r = windowRange(endDate, k);
      return r.start === start && r.end === end;
    });
    changePeriod(preset ? { key: preset } : { key: "custom", start, end });
  };
  const adsView = route.view === "overview" || route.view === "client";
  const platformOptions =
    route.view === "client" && currentBlended
      ? currentBlended.platforms.length > 1
        ? [{ value: "all" as PlatformSel, label: "All platforms" }, ...currentBlended.platforms.map((pf) => ({ value: pf as PlatformSel, label: PLATFORM_LABEL[pf] }))]
        : null
      : [
          { value: "all" as PlatformSel, label: "All platforms" },
          ...PLATFORM_ORDER.filter((pf) => platformCounts[pf]).map((pf) => ({ value: pf as PlatformSel, label: `${PLATFORM_LABEL[pf]} · ${platformCounts[pf]}` })),
        ];
  const loadingCount = Object.values(loading).filter((l) => l.status === "loading").length;

  const libCount = (v: LibraryView) => route.view === "library" && (route.lib.lib === v || (v === "tags" && route.lib.lib === "tag"));

  return (
    <div className="min-h-screen bg-[#f6f6f4] text-slate-900">
      {/* Top bar: brand + freshness only; everything else lives in Data & settings */}
      <header className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => navigate(null)} className="flex items-center gap-2.5 text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight">
                Client Ads Command Center <span className="ml-1 rounded bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-950">Demo · sample data</span>
              </span>
              <span className="block text-[11px] text-slate-400">Meta, Google &amp; TikTok Ads · {clients.length} clients · all figures in IDR</span>
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <button onClick={() => go({ view: "data" })} className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 hover:bg-white/10" title="Data sources, FX rates and refresh schedule">
              <Calendar className="h-3.5 w-3.5" />
              Data through {fmtDate(endDate, { month: "short", day: "numeric", year: "numeric" })} · {anyLive ? "live" : "updates Mondays"}
            </button>
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 hover:bg-white/10" title="Sign out of this device">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </form>
            {tokenError && (
              <button onClick={() => go({ view: "data" })} className="rounded-md bg-red-500/20 px-2 py-1 text-red-200" title={tokenError}>
                Meta token rejected
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Filter row: only on ads pages, scopes everything below */}
      {adsView && (
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-[#f6f6f4]/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
            <PeriodPicker
              label={periodLabel}
              range={globalRange}
              min={addDaysIso(endDate, -89)}
              max={endDate}
              onApply={applyRange}
              compare={compare}
              compareAvailable={prevAvailable}
              onCompare={setCompare}
            />
            {platformOptions && <Segmented<PlatformSel> value={platform} onChange={changePlatform} options={platformOptions} />}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6 sm:px-6">
        <nav className="hidden w-56 shrink-0 lg:block" aria-label="Sections">
          <div className={`sticky ${adsView ? "top-16" : "top-4"} max-h-[calc(100vh-5rem)] space-y-1 overflow-y-auto scrollbar-thin`}>
            <NavHeading>Ads performance</NavHeading>
            <NavItem
              active={route.view === "overview"}
              onClick={() => navigate(null)}
              color="#0b0b0b"
              label={platform === "all" ? "Portfolio overview" : `${PLATFORM_LABEL[platform]} overview`}
              sub={fmtIdr(models.reduce((s, m) => s + m.total.spend, 0))}
            />
            <div className="flex items-center justify-between px-2 pb-1 pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{platform === "all" ? "Clients" : `Clients on ${PLATFORM_LABEL[platform]}`}</span>
              <button onClick={() => setAdding(true)} title="Add a client by ad account ID" className="inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-slate-900">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            {models.map((m) => (
              <NavItem
                key={m.client.id}
                active={selected === m.client.id}
                onClick={() => navigate(m.client.id)}
                color={colors[m.client.id]}
                label={m.client.name}
                badges={platform === "all" ? m.platforms : undefined}
                sub={m.accounts.length ? fmtIdr(m.total.spend) : m.client.accountIds.some((id) => loading[id]?.status === "loading") ? "loading…" : "no data"}
                onRemove={m.client.custom ? () => removeClient(m.client.id) : undefined}
              />
            ))}

            <NavHeading>Creative Library</NavHeading>
            <NavLink icon={Sparkles} label="This week's best" active={libCount("best")} onClick={() => go({ view: "library", lib: { lib: "best", tag: null, c: null } })} />
            <NavLink icon={Tags} label="Tag explorer" active={libCount("tags")} onClick={() => go({ view: "library", lib: { lib: "tags", tag: null, c: null } })} />
            <NavLink icon={TrendingUp} label="Trends (4 weeks)" active={libCount("trends")} onClick={() => go({ view: "library", lib: { lib: "trends", tag: null, c: null } })} />

            <NavHeading>Settings</NavHeading>
            <NavLink icon={Database} label="Data & settings" active={route.view === "data"} onClick={() => go({ view: "data" })} />
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          {/* Mobile navigation */}
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-thin lg:hidden">
            <Chip active={route.view === "overview"} onClick={() => navigate(null)} color="#0b0b0b" label="Overview" />
            <Chip active={route.view === "library"} onClick={() => go({ view: "library", lib: { lib: "best", tag: null, c: null } })} icon={Sparkles} label="Creative Library" />
            {models.map((m) => (
              <Chip key={m.client.id} active={selected === m.client.id} onClick={() => navigate(m.client.id)} color={colors[m.client.id]} label={m.client.name} />
            ))}
            <Chip active={false} onClick={() => setAdding(true)} icon={Plus} label="Add client" />
            <Chip active={route.view === "data"} onClick={() => go({ view: "data" })} icon={Database} label="Data" />
          </div>

          {route.view === "library" ? (
            <CreativeLibrary route={route.lib} setRoute={setLib} />
          ) : route.view === "data" ? (
            <DataSettings
              clients={clients}
              accounts={accounts}
              fx={fx}
              endDate={endDate}
              liveEnabled={liveEnabled}
              tokenError={tokenError}
              loadingCount={loadingCount}
              onRefreshAll={refreshAll}
            />
          ) : current ? (
            <ClientDetail
              key={current.client.id}
              model={current}
              color={colors[current.client.id]}
              periodLabel={periodLabel}
              loading={loading}
              liveEnabled={liveEnabled}
              fx={fx}
              weekly={buildClientWeekly(current.client, accounts, fx, platform)}
              onPlatform={changePlatform}
              scoped={scopedCurrent}
              onRefresh={() => current.client.accountIds.filter(isMetaAccount).forEach((id) => fetchAccount(id, true))}
              tab={route.tab}
              tabBar={<TabBar value={route.tab} onChange={(tab) => go({ tab }, false)} />}
            />
          ) : currentBlended && platform !== "all" ? (
            <p className="py-20 text-center text-sm text-slate-500">
              {currentBlended.client.name} doesn&apos;t run on {PLATFORM_LABEL[platform]}.{" "}
              <button className="underline" onClick={() => changePlatform("all")}>
                Show all platforms
              </button>
            </p>
          ) : selected ? (
            <p className="py-20 text-center text-sm text-slate-500">
              Unknown client.{" "}
              <button className="underline" onClick={() => navigate(null)}>
                Back to overview
              </button>
            </p>
          ) : (
            <Overview models={models} platform={platform} onPlatform={changePlatform} scoped={scopedFor} colors={colors} periodLabel={periodLabel} onOpen={navigate} loading={loading} weekly={portfolioWeekly} />
          )}
        </main>
      </div>

      {adding && <AddClientDialog existing={clients} onClose={() => setAdding(false)} onAdd={addClient} liveEnabled={liveEnabled} />}
    </div>
  );
}

function TabBar({ value, onChange }: { value: ClientTab; onChange: (t: ClientTab) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto border-b border-slate-200 px-4 scrollbar-thin sm:mx-0 sm:px-0" role="tablist">
      <div className="flex gap-5">
        {CLIENT_TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={`-mb-px shrink-0 border-b-2 pb-2 text-sm font-medium ${value === t.value ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:pt-0">{children}</div>;
}

function NavLink({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${active ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-700 hover:bg-white/60"}`}
    >
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {label}
    </button>
  );
}

function NavItem({
  active,
  onClick,
  color,
  label,
  sub,
  badges,
  onRemove,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  sub: string;
  badges?: Platform[];
  onRemove?: () => void;
}) {
  return (
    <div className={`group flex items-center rounded-lg ${active ? "bg-white shadow-sm ring-1 ring-slate-200" : "hover:bg-white/60"}`}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${active ? "font-semibold text-slate-900" : "text-slate-700"}`}>{label}</span>
          <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-slate-400">
            {sub}
            {badges && badges.length > 1 && badges.map((b) => <PlatformBadge key={b} platform={b} />)}
          </span>
        </span>
      </button>
      {onRemove && (
        <button onClick={onRemove} title="Remove client" className="mr-1 rounded p-1 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Chip({ active, onClick, color, icon: Icon, label }: { active: boolean; onClick: () => void; color?: string; icon?: LucideIcon; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
    >
      {Icon ? <Icon className="h-3 w-3" /> : <span className="h-2 w-2 rounded-sm" style={{ background: color }} />}
      {label}
    </button>
  );
}
