import { admin } from "./push.server";

export const DEFAULT_REDIRECT = "https://mitmacht.demokratie.ch/api/public/auth/linkedin/callback";
export const STATE_TTL_MS = 10 * 60 * 1000;

export function linkedinConfig() {
  const clientId = process.env["LINKEDIN_CLIENT_ID"];
  const clientSecret = process.env["LINKEDIN_CLIENT_SECRET"];
  const redirectUri = process.env["LINKEDIN_REDIRECT_URI"] || DEFAULT_REDIRECT;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Nur relative Pfade innerhalb der App – kein Open Redirect. */
export function safeReturn(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  if (raw.length > 200) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\r\n\t]/.test(raw) || raw.includes("\\")) return "/";
  const hash = raw.indexOf("#");
  return hash === -1 ? raw : raw.slice(0, hash) || "/";
}

export function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

export function appError(code: "cancelled" | "state" | "unreachable" | "noemail" | "config" | "failed", ret = "/") {
  return redirect(`${ret}#li_error=${code}`);
}

export async function consumeState(state: string) {
  const db = await admin();
  const { data } = await db.from("oauth_states").delete().eq("state", state).select("nonce, return_path, created_at").maybeSingle();
  // Aufräumen abgelaufener Einträge
  await db.from("oauth_states").delete().lt("created_at", new Date(Date.now() - STATE_TTL_MS).toISOString());
  if (!data) return null;
  if (Date.now() - new Date(data.created_at).getTime() > STATE_TTL_MS) return null;
  return data;
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const p = jwt.split(".")[1];
    if (!p) return null;
    const s = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(s)));
  } catch {
    return null;
  }
}
