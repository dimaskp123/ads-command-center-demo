"use client";

import { CalendarClock, Coins, Database, ExternalLink, KeyRound, RefreshCw, Sparkles } from "lucide-react";
import { FX_SHEET_URL, type FxState } from "@/lib/clients/fx";
import { fmtDate } from "@/lib/clients/analysis";
import { PLATFORM_LABEL, type AccountSnapshot, type ClientConfig } from "@/lib/clients/types";
import { SNAPSHOT } from "@/lib/clients/registry";
import { LIBRARY, weekLabel } from "@/lib/creatives/library";
import { Card, CardHeader, Pill } from "@/components/clients/ui";

/** Everything about where the numbers come from, in one place instead of the header. */
export function DataSettings({
  clients,
  accounts,
  fx,
  endDate,
  liveEnabled,
  tokenError,
  loadingCount,
  onRefreshAll,
}: {
  clients: ClientConfig[];
  accounts: Record<string, AccountSnapshot>;
  fx: FxState;
  endDate: string;
  liveEnabled: boolean;
  tokenError: string | null;
  loadingCount: number;
  onRefreshAll: () => void;
}) {
  const months = Array.from(new Set(Object.values(fx.table).flatMap((m) => Object.keys(m)))).sort().reverse().slice(0, 6);
  const currencies = Object.keys(fx.table);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Data &amp; settings</h1>
        <p className="mt-1 text-sm text-slate-500">Where every number on this dashboard comes from, how fresh it is, and how it refreshes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <Database className="h-3.5 w-3.5" /> Ads data
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">Through {fmtDate(endDate, { month: "short", day: "numeric", year: "numeric" })}</div>
          <p className="mt-1 text-xs text-slate-500">Snapshot built {fmtDate(SNAPSHOT.fetchedAt.slice(0, 10))} · rolling 90 days</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <Sparkles className="h-3.5 w-3.5" /> Creative Library
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {LIBRARY.snapshots.length ? `${LIBRARY.snapshots.length} of 4 weeks` : "No weeks yet"}
          </div>
          <p className="mt-1 text-xs text-slate-500">{LIBRARY.snapshots[0] ? `Newest: ${weekLabel(LIBRARY.snapshots[0])}` : "Filled by the Monday routine"}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <CalendarClock className="h-3.5 w-3.5" /> Refresh
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">Mondays · 09:00 WIB</div>
          <p className="mt-1 text-xs text-slate-500">Ads data, weekly summaries and the Creative Library update together.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Ad accounts" subtitle="Every account feeding the dashboard, with its source and currency" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Currency</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Data through</th>
              </tr>
            </thead>
            <tbody>
              {clients.flatMap((c) =>
                c.accountIds.map((id) => {
                  const a = accounts[id];
                  return (
                    <tr key={`${c.id}-${id}`} className="border-b border-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">
                        {a?.name ? `${a.name} · ` : ""}
                        {id}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{PLATFORM_LABEL[a?.platform ?? "meta"]}</td>
                      <td className="px-4 py-2 text-slate-600">{a ? `${a.currency}${a.currency !== "IDR" ? " → IDR" : ""}` : "—"}</td>
                      <td className="px-4 py-2">
                        {a ? (
                          <Pill tone={a.source === "graph-api" ? "green" : "slate"}>{a.source === "graph-api" ? "Live" : a.source === "warehouse" ? "Data warehouse" : "Weekly snapshot"}</Pill>
                        ) : (
                          <Pill tone="amber">No data yet</Pill>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">{a ? fmtDate(a.endDate) : "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="FX rates to IDR"
            subtitle={fx.source === "sheet-live" ? "Read live from the FX sheet" : `Sheet snapshot from ${fmtDate(fx.fetchedAt)}`}
            right={
              FX_SHEET_URL ? (
              <a href={FX_SHEET_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
                Open sheet <ExternalLink className="h-3 w-3" />
              </a>
              ) : null
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">
                    <Coins className="inline h-3.5 w-3.5" /> Month
                  </th>
                  {currencies.map((cur) => (
                    <th key={cur} className="px-4 py-2 text-right font-medium">
                      {cur} → IDR
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((mo) => (
                  <tr key={mo} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-slate-700">{fmtDate(`${mo}-01`, { month: "short", year: "numeric" })}</td>
                    {currencies.map((cur) => (
                      <td key={cur} className="px-4 py-2 text-right tabular-nums text-slate-600">
                        {fx.table[cur][mo]?.toLocaleString("id-ID") ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-slate-400">Each spend day uses its month&apos;s rate; the latest month is carried forward until the next one is published.</p>
        </Card>

        <Card>
          <CardHeader title="Live connection" subtitle="Optional: pull Meta data on demand instead of waiting for Monday" />
          <div className="space-y-3 p-4 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-400" />
              {tokenError ? (
                <Pill tone="red">Meta token rejected</Pill>
              ) : liveEnabled ? (
                <Pill tone="green">Meta token connected</Pill>
              ) : (
                <Pill tone="slate">No Meta token: weekly snapshot only</Pill>
              )}
            </div>
            {tokenError && <p className="text-xs text-red-700">{tokenError}</p>}
            {!liveEnabled && (
              <p className="text-xs leading-relaxed">
                Set <code className="rounded bg-slate-100 px-1">META_ACCESS_TOKEN</code> (a system-user token with <code>ads_read</code>) in the deployment&apos;s environment variables to enable live
                pulls, on-demand data for newly added accounts and the full CPAS catalog-segment breakdown.
              </p>
            )}
            {liveEnabled && (
              <button onClick={onRefreshAll} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingCount ? "animate-spin" : ""}`} />
                {loadingCount ? `Refreshing ${loadingCount}…` : "Refresh all accounts now"}
              </button>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Methodology" />
        <div className="space-y-2 p-4 text-xs leading-relaxed text-slate-600">
          <p>
            Spend and purchase values are converted to IDR per day using that month&apos;s IDR:USD (and IDR:TWD) rate from the FX sheet. Totals include every campaign that spent in the selected
            period, active or not. Comparisons always use the same number of days immediately before the selected period.
          </p>
          <p>
            Each client&apos;s metrics follow the objective detected from ad-set optimization: awareness and lead campaigns report reach, impressions, leads, CPL and CPM; CPAS campaigns report
            shared-item add-to-carts, purchases, purchase value and ROAS. CPAS shared-item figures combine each ad set&apos;s optimization result with locked Ads Manager figures.
          </p>
          <p>
            The Creative Library ranks public organic posts from Indonesia (Indonesian and English) posted in the last finished Monday–Sunday week. It scores breakout reach versus creator size,
            engagement per view, share and save rate, and velocity, each as a percentile within its platform. The breakdown (hook, angle, script, format) is read from the caption and post
            metadata. Retention curves are not public, so engagement per view is the retention proxy.
          </p>
        </div>
      </Card>
    </div>
  );
}
