"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate } from "@/lib/clients/analysis";

// Categorical palette (validated: adjacent CVD ΔE ≥ 9.1, normal-vision ≥ 19.6
// on a light surface). Assigned by fixed entity order, never by rank.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const OTHER_COLOR = "#8a8984";

export interface Series {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** Values to show in the tooltip when `values` are transformed (e.g. indexed). */
  display?: (number | null)[];
  /** Per-series tooltip formatter (falls back to the chart's `format`). */
  fmt?: (v: number | null) => string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(240, entries[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export function TimeSeriesChart({
  dates,
  series,
  type,
  format,
  axisFormat,
  height = 240,
  showTotal,
  emptyLabel = "No data in this window",
  hover: hoverProp,
  onHover,
  showDates = true,
}: {
  dates: string[];
  series: Series[];
  type: "line" | "stacked";
  format: (v: number | null) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  showTotal?: boolean;
  emptyLabel?: string;
  /** Controlled hover index — lets several charts share one crosshair. */
  hover?: number | null;
  onHover?: (i: number | null) => void;
  showDates?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hoverState, setHoverState] = useState<number | null>(null);
  const controlled = onHover !== undefined;
  const hover = controlled ? hoverProp ?? null : hoverState;
  const setHover = (i: number | null) => (controlled ? onHover!(i) : setHoverState(i));
  const pad = { top: 12, right: 12, bottom: showDates ? 26 : 8, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = dates.length;

  const { max, totals } = useMemo(() => {
    const totals = dates.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
    const max =
      type === "stacked"
        ? Math.max(0, ...totals)
        : Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v))));
    return { max, totals };
  }, [dates, series, type]);

  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v: number) => pad.top + innerH - (v / yMax) * innerH;
  const band = innerW / Math.max(1, n);
  const xCenter = (i: number) => pad.left + band * (i + 0.5);
  const hasData = max > 0;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 70))));
  const fmtAxis = axisFormat ?? ((v: number) => format(v));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const barW = Math.max(1, band - (band > 6 ? 2 : band > 3 ? 1 : 0));

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg width={width} height={height} role="img" aria-label="Daily chart" className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e7e6e2" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {showDates && dates.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d} x={xCenter(i)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {fmtDate(d)}
            </text>
          ) : null
        )}

        {hasData && type === "stacked" &&
          dates.map((d, i) => {
            let acc = 0;
            return (
              <g key={d} opacity={hover === null || hover === i ? 1 : 0.55}>
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const h = Math.max(0, y0 - y1 - (si > 0 && y0 - y1 > 3 ? 1 : 0));
                  const isTop = series.slice(si + 1).every((t) => (t.values[i] ?? 0) <= 0);
                  const r = isTop ? Math.min(3, barW / 2, h) : 0;
                  return (
                    <path
                      key={s.key}
                      d={roundedTopRect(xCenter(i) - barW / 2, y1, barW, h, r)}
                      fill={s.color}
                    />
                  );
                })}
              </g>
            );
          })}

        {hasData && type === "line" &&
          series.map((s) => {
            let dPath = "";
            let penDown = false;
            s.values.forEach((v, i) => {
              if (v === null || !Number.isFinite(v)) {
                penDown = false;
                return;
              }
              dPath += `${penDown ? "L" : "M"}${xCenter(i).toFixed(1)},${y(v).toFixed(1)}`;
              penDown = true;
            });
            return <path key={s.key} d={dPath} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
          })}

        {hover !== null && hasData && (
          <g pointerEvents="none">
            <line x1={xCenter(hover)} x2={xCenter(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#9a9993" strokeWidth={1} />
            {type === "line" &&
              series.map((s) => {
                const v = s.values[hover];
                if (v === null || !Number.isFinite(v)) return null;
                return <circle key={s.key} cx={xCenter(hover)} cy={y(v)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />;
              })}
          </g>
        )}

        {!hasData && (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-slate-400 text-xs">
            {emptyLabel}
          </text>
        )}

        <rect
          x={pad.left}
          y={pad.top}
          width={Math.max(0, innerW)}
          height={Math.max(0, innerH)}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hover !== null && hasData && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[160px] max-w-[260px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            left: Math.min(Math.max(0, xCenter(hover) + 12), width - 200),
          }}
        >
          <div className="mb-1 font-medium text-slate-500">{fmtDate(dates[hover], { weekday: "short", month: "short", day: "numeric" })}</div>
          {(type === "stacked" || showTotal) && series.length > 1 && (
            <div className="mb-1 flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
              <span className="text-slate-500">Total</span>
              <span className="font-semibold tabular-nums text-slate-900">{format(totals[hover])}</span>
            </div>
          )}
          {[...series]
            .reverse()
            .filter((s) => s.values[hover] !== null && (type === "line" || (s.values[hover] ?? 0) > 0))
            .map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 py-0.5">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
                  <span className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: s.color }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{(s.fmt ?? format)(s.display ? s.display[hover] : s.values[hover])}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Legend({ items, shape = "rect" }: { items: { label: string; color: string }[]; shape?: "rect" | "line" }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className={shape === "rect" ? "inline-block h-2.5 w-2.5 rounded-sm" : "inline-block h-0.5 w-3.5 rounded"}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = SERIES_COLORS[0], width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(...values, 0);
  if (!(max > 0)) return <div style={{ width, height }} className="flex items-center text-[10px] text-slate-300">no spend</div>;
  const step = width / Math.max(1, values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join("");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={(values.length - 1) * step} cy={height - 2 - (last / max) * (height - 4)} r={2.5} fill={color} />
    </svg>
  );
}

/** Horizontal share bar (one series → one color). */
export function ShareBar({ share, color = SERIES_COLORS[0] }: { share: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, share * 100))}%`, background: color }} />
    </div>
  );
}
