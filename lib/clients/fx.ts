// IDR is the focal currency. Demo build: rates are a fixed sample table.
export const FX_SHEET_ID = "";
export const FX_SHEET_URL = "";

/** month ("YYYY-MM") → IDR per 1 unit of currency */
export type FxTable = Record<string, Record<string, number>>;

export interface FxState {
  table: FxTable; // currency → month → IDR rate
  source: "sheet-snapshot" | "sheet-live";
  fetchedAt: string;
}

// Snapshot read from the sheet on 2026-10-01 (Oct 2026 not yet published).
export const FX_SNAPSHOT: FxState = {
  source: "sheet-snapshot",
  fetchedAt: "2026-10-01",
  table: {
    USD: {
      "2025-12": 16500, // Dec 2025 not on the 2026 tab — Jan 2026 rate carried back
      "2026-01": 16500,
      "2026-02": 16500,
      "2026-03": 16583,
      "2026-04": 16750,
      "2026-05": 16750,
      "2026-06": 17368,
      "2026-07": 17632,
      "2026-08": 17632,
      "2026-09": 17984,
    },
    // IDR per TWD = IDR:USD ÷ TWD:USD (Google Ads accounts bill in TWD).
    TWD: {
      "2025-12": 500,
      "2026-01": 500, // 16500 / 33
      "2026-02": 500, // 16500 / 33
      "2026-03": 502.52, // 16583 / 33
      "2026-04": 500, // 16750 / 33.5
      "2026-05": 500, // 16750 / 33.5
      "2026-06": 526.3, // 17368 / 33
      "2026-07": 526.33, // 17632 / 33.5
      "2026-08": 526.33, // 17632 / 33.5
      "2026-09": 536.84, // 17984 / 33.5
    },
  },
};

export function rateFor(fx: FxState, currency: string, date: string): number {
  if (currency === "IDR") return 1;
  const months = fx.table[currency];
  if (!months) return NaN;
  const month = date.slice(0, 7);
  if (months[month] !== undefined) return months[month];
  // Nearest earlier month, else earliest available.
  const keys = Object.keys(months).sort();
  let best = keys[0];
  for (const k of keys) if (k <= month) best = k;
  return months[best];
}

export function latestRate(fx: FxState, currency: string): { month: string; rate: number } | null {
  if (currency === "IDR") return { month: "", rate: 1 };
  const months = fx.table[currency];
  if (!months) return null;
  const k = Object.keys(months).sort().pop()!;
  return { month: k, rate: months[k] };
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parse the sheet's CSV export (tab "2026"): header row holds "Jan 2026"…,
 * and the first "IDR : USD" and "TWD : USD" rows after it hold the rates.
 */
export function parseFxCsv(csv: string): FxTable | null {
  const rows = csv.split(/\r?\n/).map(parseCsvLine);
  const header = rows.find((r) => r.some((c) => /^[A-Z][a-z]{2} \d{4}$/.test(c.trim())));
  const idr = rows.find((r) => r[0]?.replace(/\s/g, "") === "IDR:USD");
  const twd = rows.find((r) => r[0]?.replace(/\s/g, "") === "TWD:USD");
  if (!header || !idr) return null;
  const cell = (row: string[] | undefined, i: number) => {
    const v = Number((row?.[i] ?? "").replace(/,/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const usd: Record<string, number> = {};
  const twdIdr: Record<string, number> = {};
  header.forEach((h, i) => {
    const m = h.trim().match(/^([A-Z][a-z]{2}) (\d{4})$/);
    if (!m) return;
    const v = cell(idr, i);
    if (v === null) return;
    const month = `${m[2]}-${String(MONTH_ABBR.indexOf(m[1]) + 1).padStart(2, "0")}`;
    usd[month] = v;
    const t = cell(twd, i);
    if (t !== null) twdIdr[month] = Math.round((v / t) * 100) / 100;
  });
  if (!Object.keys(usd).length) return null;
  return Object.keys(twdIdr).length ? { USD: usd, TWD: twdIdr } : { USD: usd };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
