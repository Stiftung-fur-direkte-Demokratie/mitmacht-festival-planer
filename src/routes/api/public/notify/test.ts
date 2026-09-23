import { createFileRoute } from "@tanstack/react-router";
import { admin, berlinNow, json } from "@/lib/push.server";
import { maskEmail, morningContent, recipientFor, sendEmail, sendPushToUser, smtpConfig, testDay } from "@/lib/notify.server";
import { BY_ID, type Item } from "@/lib/festival";

async function auth(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || token.length > 4000) return null;
  const db = await admin();
  const { data } = await db.auth.getUser(token);
  return data.user ? { db, uid: data.user.id } : null;
}

export const Route = createFileRoute("/api/public/notify/test")({
  server: {
    handlers: {
      // Status für die Einstellungen
      GET: async ({ request }) => {
        const a = await auth(request);
        if (!a) return json({ ok: false }, 401);
        const { data: p } = await a.db.from("profiles").select("id, contact_email").eq("id", a.uid).maybeSingle();
        const to = p ? await recipientFor(a.db, p) : null;
        const { count } = await a.db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", a.uid).eq("enabled", true);
        return json({ ok: true, smtp: !!smtpConfig(), recipient: to ? maskEmail(to) : null, pushDevices: count ?? 0 });
      },
      POST: async ({ request }) => {
        const a = await auth(request);
        if (!a) return json({ ok: false, error: "nicht angemeldet" }, 401);
        const { db, uid } = a;
        const since = new Date(Date.now() - 3600000).toISOString();
        const { count } = await db.from("notification_log").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("kind", "test").gte("sent_at", since);
        if ((count ?? 0) >= 3) return json({ ok: false, error: "Höchstens 3 Tests pro Stunde – bitte später erneut versuchen." }, 429);
        const { data: p } = await db
          .from("profiles")
          .select("id, display_name, contact_email, notify_morning_push, notify_morning_email")
          .eq("id", uid)
          .maybeSingle();
        if (!p) return json({ ok: false, error: "Profil fehlt" }, 404);
        const { data: att } = await db.from("attendance").select("session_id").eq("user_id", uid);
        const sessions = (att ?? []).map((x) => BY_ID[x.session_id]).filter(Boolean) as Item[];
        const day = testDay(berlinNow().date);
        const c = morningContent({ userId: uid, name: p.display_name, day, sessions });
        const result: { push: string; email: string; day: string } = { push: "aus", email: "aus", day };
        if (!c) return json({ ok: false, error: "Für diesen Festivaltag ist nichts in deiner Agenda.", ...result }, 200);
        await db.from("notification_log").insert({ user_id: uid, kind: "test", day: new Date().toISOString(), channel: "test", status: "ok" });
        if (p.notify_morning_push) result.push = await sendPushToUser(db, uid, { ...c, push: { ...c.push, tag: "mm-morning-test" } });
        if (p.notify_morning_email) {
          const to = await recipientFor(db, p);
          result.email = to ? await sendEmail(to, c, uid) : "nicht eingerichtet";
        }
        return json({ ok: true, ...result });
      },
    },
  },
});
