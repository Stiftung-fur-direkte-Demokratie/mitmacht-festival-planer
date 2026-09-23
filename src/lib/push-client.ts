// Browser-Seite der Server-Push-Erinnerungen.
import { getSwRegistration } from "./pwa";

export const VAPID_PUBLIC_KEY =
  "BOL3Qqiz9dmRce293RVzx8HYXk-l2rfNUAYqgb1r6XLgP1nhERl28Y5dp24xWVp2JdcD5eGaKjvnqaJy_JwdjHc";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(b64u: string) {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const bin = atob((b64u + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await getSwRegistration(2000);
  if (!reg) return null;
  return (await reg.pushManager.getSubscription().catch(() => null)) ?? null;
}

export async function ensureSubscription(): Promise<PushSubscription> {
  const reg = await getSwRegistration(3000);
  if (!reg) throw new Error("Service Worker nicht aktiv");
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource,
  });
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* leer */
  }
  if (!res.ok || !data.ok) throw new Error(data.error || `Server ${res.status}`);
  return data;
}

export async function syncSubscription(
  sub: PushSubscription,
  sessionIds: string[],
  leadMinutes: number,
  platform: "ios" | "android" | "desktop",
) {
  const j = sub.toJSON();
  return post("/api/public/push/subscribe", {
    subscription: { endpoint: j.endpoint, keys: j.keys },
    sessionIds: sessionIds.slice(0, 100),
    leadMinutes,
    platform,
  });
}

export async function removeSubscription() {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  await post("/api/public/push/unsubscribe", { endpoint });
}

export async function requestTestPush() {
  const sub = await currentSubscription();
  if (!sub) throw new Error("Keine Push-Anmeldung auf diesem Gerät");
  return post("/api/public/push/test", { endpoint: sub.endpoint });
}

export function pushHost(sub: PushSubscription | null) {
  try {
    return sub ? new URL(sub.endpoint).host : null;
  } catch {
    return null;
  }
}
