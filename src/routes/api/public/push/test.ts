import { createFileRoute } from "@tanstack/react-router";
import { admin, endpointBody, json, readJson } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/push/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = endpointBody.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: "ungültiger endpoint" }, 400);
        const db = await admin();
        const { data: sub } = await db
          .from("push_subscriptions")
          .select("id")
          .eq("endpoint", parsed.data.endpoint)
          .maybeSingle();
        if (!sub) return json({ ok: false, error: "Gerät nicht angemeldet" }, 404);
        await db.from("push_tests").delete().eq("subscription_id", sub.id);
        const dueAt = new Date(Date.now() + 60000).toISOString();
        const { error } = await db.from("push_tests").insert({ subscription_id: sub.id, due_at: dueAt });
        if (error) return json({ ok: false, error: "Speichern fehlgeschlagen" }, 500);
        return json({ ok: true, dueAt });
      },
    },
  },
});
