import { createFileRoute } from "@tanstack/react-router";
import { admin, json, readJson, subscribeSchema } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = subscribeSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: parsed.error.issues[0]?.message ?? "ungültig" }, 400);
        const { subscription, sessionIds, leadMinutes, platform } = parsed.data;
        const db = await admin();
        const { error } = await db.from("push_subscriptions").upsert(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            session_ids: [...new Set(sessionIds)],
            lead_minutes: leadMinutes,
            platform,
            enabled: true,
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
