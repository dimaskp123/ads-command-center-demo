"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { addDaysIso, daysIn, rangeLabel, type DateRange } from "@/lib/clients/analysis";

/**
 * The one period control: presets and quick ranges as rows, two date inputs,
 * and the comparison toggle, limited to the loaded data window. The
 * comparison period is always the same number of days immediately before
 * the chosen range.
 */
export function PeriodPicker({
  label,
  range,
  min,
  max,
  onApply,
  compare,
  compareAvailable,
  onCompare,
}: {
  label: string;
  range: DateRange;
  min: string;
  max: string;
  onApply: (start: string, end: string) => void;
  compare: boolean;
  compareAvailable: boolean;
  onCompare: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setStart(range.start);
      setEnd(range.end);
    }
  }, [open, range.start, range.end]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const monthStart = `${max.slice(0, 7)}-01`;
  const prevMonthEnd = addDaysIso(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
  const quick: { label: string; start: string; end: string }[] = [
    { label: "Last 7 days", start: addDaysIso(max, -6), end: max },
    { label: "Last 30 days", start: addDaysIso(max, -29), end: max },
    { label: "Last 90 days", start: addDaysIso(max, -89), end: max },
    { label: "Last 14 days", start: addDaysIso(max, -13), end: max },
    { label: "Last 45 days", start: addDaysIso(max, -44), end: max },
    { label: "Last 60 days", start: addDaysIso(max, -59), end: max },
    { label: "This month to date", start: monthStart, end: max },
    { label: "Previous month", start: prevMonthStart < min ? min : prevMonthStart, end: prevMonthEnd },
  ];

  const valid = start && end && start <= end && start >= min && end <= max;
  const len = valid ? daysIn({ start, end }) : 0;
  const prevFits = valid && addDaysIso(start, -len) >= min;

  const apply = (s: string, e: string) => {
    onApply(s, e);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
      >
        <CalendarRange className="h-3.5 w-3.5 text-slate-500" />
        <span className="font-semibold">{label}</span>
        <span className="hidden text-slate-400 sm:inline">{rangeLabel(range)}</span>
        {compare && compareAvailable && <span className="hidden text-slate-400 md:inline">· vs prev {daysIn(range)}d</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <ul className="mb-2">
            {quick.map((q) => {
              const selected = q.start === range.start && q.end === range.end;
              return (
                <li key={q.label}>
                  <button
                    onClick={() => apply(q.start, q.end)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex w-4 justify-center">{selected && <Check className="h-4 w-4 stroke-[3] text-slate-900" />}</span>
                      {q.label}
                    </span>
                    <span className="text-[11px] text-slate-400">{daysIn(q)}d</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-100 px-1 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-slate-500">
                From
                <input
                  type="date"
                  value={start}
                  min={min}
                  max={max}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900"
                />
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                To
                <input
                  type="date"
                  value={end}
                  min={min}
                  max={max}
                  onChange={(e) => setEnd(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              {valid ? (
                <>
                  {len} days · compares with the previous {len} days{" "}
                  {prevFits ? `(${rangeLabel({ start: addDaysIso(start, -len), end: addDaysIso(start, -1) })})` : "— not available, it starts before the loaded data"}
                </>
              ) : (
                `Pick dates between ${rangeLabel({ start: min, end: max })}.`
              )}
            </p>
            <label className={`mt-3 flex items-center gap-2 text-xs ${compareAvailable ? "text-slate-700" : "text-slate-300"}`}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-slate-900"
                checked={compare && compareAvailable}
                disabled={!compareAvailable}
                onChange={(e) => onCompare(e.target.checked)}
              />
              Compare with the previous {daysIn(range)} days
            </label>
            <button
              disabled={!valid}
              onClick={() => apply(start, end)}
              className="mt-2 w-full rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
