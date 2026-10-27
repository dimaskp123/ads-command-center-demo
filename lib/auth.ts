// Login wall: signed session cookie, checked by middleware.ts on every path
// (pages, API routes and the JS bundle that carries the client data).
//
// Configure in Vercel → Settings → Environment Variables:
//   AUTH_SECRET     random string, 32+ characters (signs the session cookie;
//                   changing it signs everyone out)
//   DASHBOARD_USERS comma-separated "username:password" pairs, e.g.
//                   "dimas:correct-horse-battery,ana:another-long-password"
// Without both, the site stays locked (fail closed).
//
// Uses Web Crypto only, so it runs in the Edge middleware and in Node routes.

export const SESSION_COOKIE = "acc_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison (compares SHA-256 digests so lengths never leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Env values pasted into a dashboard often carry stray quotes or spaces; strip them. */
function clean(v: string | undefined): string {
  return (v ?? "").replace(/^[\s'"`]+|[\s'"`]+$/g, "");
}

export function authSecret(): string | null {
  const s = clean(process.env.AUTH_SECRET);
  return s.length >= 32 ? s : null;
}

export function configuredUsers(): Map<string, string> {
  const out = new Map<string, string>();
  // Pairs may be separated by commas, semicolons or line breaks.
  for (const raw of clean(process.env.DASHBOARD_USERS).split(/[,;\n]/)) {
    const pair = clean(raw);
    const i = pair.indexOf(":");
    if (i <= 0) continue;
    const user = clean(pair.slice(0, i)).toLowerCase();
    const pass = clean(pair.slice(i + 1));
    if (user && pass) out.set(user, pass);
  }
  return out;
}

export function authConfigured(): boolean {
  return authSecret() !== null && configuredUsers().size > 0;
}

/** Returns the username when the password matches a configured user. */
export async function checkCredentials(username: string, password: string): Promise<string | null> {
  const users = configuredUsers();
  const user = username.trim().toLowerCase();
  // Always run one comparison so unknown usernames take as long as known ones.
  const ok = await safeEqual(password, users.get(user) ?? "\u0000no-such-user");
  return ok && users.has(user) ? user : null;
}

export async function createSession(user: string): Promise<string> {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET not configured");
  const payload = `${encodeURIComponent(user)}.${Date.now() + SESSION_DAYS * 86_400_000}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/** The session's username if the cookie is authentic, unexpired, and the user still exists. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  const secret = authSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userEnc, exp, sig] = parts;
  if (!(await safeEqual(sig, await hmac(secret, `${userEnc}.${exp}`)))) return null;
  if (!(Number(exp) > Date.now())) return null;
  const user = decodeURIComponent(userEnc);
  // Removing someone from DASHBOARD_USERS revokes their session immediately.
  return configuredUsers().has(user) ? user : null;
}
