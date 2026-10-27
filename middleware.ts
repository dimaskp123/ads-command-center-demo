import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Every request needs a valid session except the login page, the login/logout
// endpoints and the cron route (which checks CRON_SECRET itself). The matcher
// deliberately includes /_next/static: the JS bundle contains the client data.
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout", "/api/cron/refresh"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Stylesheets and fonts carry no data; the login page needs them before sign-in.
  if (PUBLIC.includes(pathname) || pathname.startsWith("/_next/static/css/") || pathname.startsWith("/_next/static/media/")) {
    return NextResponse.next();
  }

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"],
};
