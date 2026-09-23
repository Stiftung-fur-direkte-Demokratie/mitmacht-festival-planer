import { z } from "zod";
import { PUSH_BY_ID, type PushSession } from "./push-schedule";
import { sendWebPush, vapidFromEnv } from "./webpush.server";

export const FESTIVAL_OVER_DATE = "2026-09-27";

export const endpointSchema = z
  .string()
  .url()
  .max(1024)
  .refine((u) => u.startsWith("https://"), "endpoint muss https sein");

export const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: endpointSchema,
    keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  }),
  sessionIds: z
    .array(z.string().max(40))
    .max(100)
    .refine((ids) => ids.every((id) => !!PUSH_BY_ID[id]), "unbekannte Session-id"),
  leadMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  platform: z.enum(["ios", "android", "desktop"]),
});

export const endpointBody = z.object({ endpoint: endpointSchema });

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export type BerlinNow = { date: string; time: string };
export function berlinNow(d = new Date()): BerlinNow {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  f.formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, time: `${p["hour"] === "24" ? "00" : p["hour"]}:${p["minute"]}` };
}
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export function minutesUntil(s: PushSession, n: BerlinNow) {
  const dayDiff = Math.round((Date.parse(s.date + "T00:00:00Z") - Date.parse(n.date + "T00:00:00Z")) / 86400000);
  return dayDiff * 1440 + mins(s.start) - mins(n.time);
}
export function skipSession(s: PushSession) {
  return s.id === "mi00" || mins(s.end) - mins(s.start) >= 180;
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; session_ids: string[]; lead_minutes: number };

export async function runSendReminders(now: BerlinNow) {
  const db = await admin();
  const result = { now, sent: 0, tests: 0, removed: 0, errors: [] as string[], purged: false };

  if (now.date >= FESTIVAL_OVER_DATE) {
    await db.from("push_subscriptions").delete().not("id", "is", null);
    result.purged = true;
    return result;
  }
  const keys = vapidFromEnv();
  if (!keys) {
    result.errors.push("VAPID-Schlüssel fehlen");
    return result;
  }

  const gone = new Set<string>();
  const deliver = async (sub: SubRow, payload: object) => {
    const r = await sendWebPush(sub, payload, keys);
    if (r.status === 404 || r.status === 410) {
      gone.add(sub.id);
      return false;
    }
    if (!r.ok) result.errors.push(`${r.status} ${r.text}`.trim());
    return r.ok;
  };

  // Test-Pushes
  const { data: tests } = await db
    .from("push_tests")
    .select("id, subscription_id, push_subscriptions(id, endpoint, p256dh, auth, session_ids, lead_minutes)")
    .lte("due_at", new Date().toISOString())
    .limit(200);
  for (const t of tests ?? []) {
    const sub = t.push_subscriptions as unknown as SubRow | null;
    if (sub && !gone.has(sub.id)) {
      const ok = await deliver(sub, {
        title: "Test: Push im Hintergrund funktioniert",
        body: "Diese Nachricht kam vom Server – auch bei geschlossener App.",
        tag: "mm-push-test",
        url: "/#einstellungen",
      });
      if (ok) result.tests++;
    }
    await db.from("push_tests").delete().eq("id", t.id);
  }

  // Erinnerungen
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, session_ids, lead_minutes")
    .eq("enabled", true)
    .limit(5000);
  for (const sub of (subs ?? []) as SubRow[]) {
    if (gone.has(sub.id)) continue;
    const due = sub.session_ids
      .map((id) => PUSH_BY_ID[id])
      .filter((s): s is PushSession => !!s && !skipSession(s))
      .map((s) => ({ s, m: minutesUntil(s, now) }))
      .filter(({ m }) => m > 0 && m <= sub.lead_minutes);
    for (const { s, m } of due) {
      // Erst reservieren (unique), dann senden → nie doppelt.
      const { error: claimErr } = await db.from("push_sent").insert({ subscription_id: sub.id, session_id: s.id });
      if (claimErr) continue;
      const ok = await deliver(sub, {
        title: `In ${m} Min: ${s.title}`,
        body: `${s.start}–${s.end}${s.room ? " · " + s.room : ""}`,
        tag: s.id,
        url: `/?s=${encodeURIComponent(s.id)}#mein`,
      });
      if (ok) result.sent++;
      else if (!gone.has(sub.id)) await db.from("push_sent").delete().eq("subscription_id", sub.id).eq("session_id", s.id);
      if (gone.has(sub.id)) break;
    }
  }

  if (gone.size) {
    await db.from("push_subscriptions").delete().in("id", [...gone]);
    result.removed = gone.size;
  }
  return result;
}
