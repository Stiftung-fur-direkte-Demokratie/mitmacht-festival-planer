import { createFileRoute } from "@tanstack/react-router";
import { admin, json, readJson, subscribeSchema } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = subscribeSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const field = issue?.path.join(".") || "unbekannt";
          return json({ ok: false, error: `Anmeldung beim Server fehlgeschlagen (Feld: ${field})`, detail: issue?.message ?? "ungültig" }, 400);
        }
        const { subscription, sessionIds, leadMinutes, platform } = parsed.data;
        const db = await admin();
        // Optional: Gerät mit dem angemeldeten Konto verknüpfen (für Nachrichten-Push)
        let userId: string | null = null;
        const authH = request.headers.get("authorization") ?? "";
        const token = authH.startsWith("Bearer ") ? authH.slice(7) : "";
        if (token && token.length < 4000) {
          const { data: u } = await db.auth.getUser(token);
          userId = u.user?.id ?? null;
        }
        const { error } = await db.from("push_subscriptions").upsert(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            session_ids: [...new Set(sessionIds)],
            lead_minutes: leadMinutes,
            platform,
            enabled: true,
            user_id: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        );
        if (error) return json({ ok: false, error: "Speichern fehlgeschlagen" }, 500);
        return json({ ok: true, sessions: sessionIds.length });
      },
    },
  },
});
