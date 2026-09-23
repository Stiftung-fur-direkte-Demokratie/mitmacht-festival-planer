import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { berlinNow, json, readJson, runSendReminders } from "@/lib/push.server";

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
        if (denied) return denied;
        const parsed = body.safeParse((await readJson(request)) ?? {});
        const now = (parsed.success && parsed.data.now) || berlinNow();
        const result = await runSendReminders(now);
        return json(result);
      },
    },
  },
});
