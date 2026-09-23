import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { admin, json, readJson } from "@/lib/push.server";
import { runDaily } from "@/lib/notify.server";

const body = z.object({
  kind: z.enum(["morning", "evening"]),
  dryRun: z.boolean().optional(),
  // Nur für Tests: simulierte Berliner Zeit (erfordert ohnehin das Cron-Token)
  now: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
});

export const Route = createFileRoute("/api/public/notify/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
          if (!token) return denied;
          const db = await admin();
          const { data } = await db.from("push_config").select("id").eq("id", 1).eq("cron_token", token).maybeSingle();
          if (!data) return new Response("Unauthorized", { status: 401 });
        }
        const parsed = body.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: "kind fehlt" }, 400);
        const b = parsed.data;
        return json(await runDaily(b.kind, { ...(b.dryRun ? { dryRun: true } : {}), ...(b.now ? { now: b.now } : {}) }));
      },
    },
  },
});
