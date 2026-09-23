import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { admin, berlinNow, json, readJson, runSendReminders } from "@/lib/push.server";

const body = z
  .object({
    // Nur für Tests: simulierte Berliner Uhrzeit (erfordert ohnehin das Cron-Secret).
    now: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
  })
  .passthrough();

export const Route = createFileRoute("/api/public/push/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          // Zweiter Weg: Token aus der geschützten Tabelle push_config (vom Datenbank-Zeitplan gesendet).
          const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
          if (!token) return denied;
          const db = await admin();
          const { data } = await db.from("push_config").select("id").eq("id", 1).eq("cron_token", token).maybeSingle();
          if (!data) return new Response("Unauthorized", { status: 401 });
        }
        const parsed = body.safeParse((await readJson(request)) ?? {});
        const now = (parsed.success && parsed.data.now) || berlinNow();
        const result = await runSendReminders(now);
        return json(result);
      },
    },
  },
});
