import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, authConfigured, checkCredentials, createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Only same-site paths, so the login form can't be used as an open redirect. */
function safeNext(raw: FormDataEntryValue | null): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`, req.url), 303);

  if (!authConfigured()) return back("setup");
  const user = await checkCredentials(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!user) {
    await new Promise((r) => setTimeout(r, 800)); // slow down password guessing
    return back("invalid");
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
