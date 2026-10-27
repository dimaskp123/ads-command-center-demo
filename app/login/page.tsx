import { LayoutGrid, Lock } from "lucide-react";
import { authConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Client Ads Command Center" };

// Plain server-rendered form: it must work before sign-in, when the app's
// JavaScript (which carries the client data) is not served.
export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  const configured = authConfigured();
  const error = searchParams.error;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f6f4] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight text-slate-900">Client Ads Command Center</span>
            <span className="block text-xs text-slate-500">Confidential · authorised users only</span>
          </span>
        </div>
        <form method="post" action="/api/auth/login" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Lock className="h-4 w-4 text-slate-400" /> Sign in
          </h1>
          {!configured || error === "setup" ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Sign-in isn&apos;t set up yet. Add <code>AUTH_SECRET</code> and <code>DASHBOARD_USERS</code> in the deployment&apos;s environment variables, then redeploy.
            </p>
          ) : error === "invalid" ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">Wrong username or password.</p>
          ) : null}
          <input type="hidden" name="next" value={searchParams.next ?? "/"} />
          <label className="mt-4 block text-xs font-medium text-slate-600">
            Username
            <input name="username" autoComplete="username" required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Password
            <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" />
          </label>
          <button type="submit" disabled={!configured} className="mt-5 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
