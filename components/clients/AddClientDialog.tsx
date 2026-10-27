"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { normalizeAccountId, SNAPSHOT } from "@/lib/clients/registry";
import type { ClientConfig } from "@/lib/clients/types";

export function AddClientDialog({
  existing,
  onClose,
  onAdd,
  liveEnabled,
}: {
  existing: ClientConfig[];
  onClose: () => void;
  onAdd: (c: ClientConfig) => void;
  liveEnabled: boolean;
}) {
  const [name, setName] = useState("");
  const [ids, setIds] = useState("");
  const [cpas, setCpas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = ids
    .split(/[\s,;]+/)
    .map(normalizeAccountId)
    .filter(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the client a name.");
    if (!parsed.length) return setError("Enter at least one ad account ID.");
    const bad = parsed.find((id) => id.length < 8 || id.length > 20);
    if (bad) return setError(`"${bad}" doesn't look like a Meta ad account ID.`);
    const taken = existing.flatMap((c) => c.accountIds.map((id) => ({ id, client: c.name }))).find((x) => parsed.includes(x.id));
    if (taken) return setError(`Ad account ${taken.id} already belongs to ${taken.client}.`);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
    const id = existing.some((c) => c.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug;
    onAdd({ id, name: name.trim(), accountIds: Array.from(new Set(parsed)), cpas: cpas || undefined, custom: true });
  };

  const inSnapshot = parsed.filter((id) => SNAPSHOT.accounts[id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-client-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id="add-client-title" className="text-sm font-semibold text-slate-900">
            Add client
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-900" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Client name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mooimom"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Ad account ID(s)</span>
            <textarea
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              rows={2}
              placeholder="1234567890123456, act_9876543210 — separate several with commas"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Accounts in different currencies are converted to IDR and combined. {parsed.length > 0 && `${parsed.length} ID${parsed.length > 1 ? "s" : ""} detected.`}
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={cpas} onChange={(e) => setCpas(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-slate-900" />
            <span>
              CPAS client (collaborative ads with a marketplace). Optional — objectives are detected automatically from each ad set&apos;s optimization goal; this only helps when campaign names don&apos;t say
              &quot;CPAS&quot;.
            </span>
          </label>
          {!liveEnabled && parsed.length > inSnapshot.length && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              Live pulls are off on this deployment (no <code>META_ACCESS_TOKEN</code>), so a new account will show &quot;no data&quot; until the token is set or the snapshot is refreshed. The client is
              still saved in this browser.
            </p>
          )}
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
            <Plus className="h-3.5 w-3.5" /> Add & pull data
          </button>
        </div>
      </form>
    </div>
  );
}
