import { createFileRoute } from "@tanstack/react-router";
import { admin, endpointBody, json, readJson } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/push/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = endpointBody.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: "ungültiger endpoint" }, 400);
        const db = await admin();
        // push_sent und push_tests werden per ON DELETE CASCADE mitgelöscht.
        const { error } = await db.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
        if (error) return json({ ok: false, error: "Löschen fehlgeschlagen" }, 500);
        return json({ ok: true });
      },
    },
  },
});
