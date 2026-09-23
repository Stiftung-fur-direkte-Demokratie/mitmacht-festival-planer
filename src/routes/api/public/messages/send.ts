import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/push.server";
import { sendWebPush, vapidFromEnv } from "@/lib/webpush.server";

const bodySchema = z
  .object({
    conversationId: z.string().uuid().nullable().optional(),
    to: z.string().uuid().nullable().optional(),
    body: z.string().max(4000),
  })
  .refine((d) => !!d.conversationId || !!d.to, "Ziel fehlt");

/* Sendet eine Nachricht im Namen der angemeldeten Person (alle Regeln prüft die Datenbank)
   und verschickt danach sofort einen Push an die Empfänger*in. */
export const Route = createFileRoute("/api/public/messages/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.length > 4000) return json({ ok: false, code: "auth" }, 401);
        const parsed = bodySchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, code: "body" }, 400);
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"]!;
        const userDb = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { conversationId, to, body } = parsed.data;
        const res = conversationId
          ? await userDb.rpc("send_message", { _conversation_id: conversationId, _body: body })
          : await userDb.rpc("start_conversation", { _other: to!, _body: body });
        if (res.error) {
          const m = /mm:([a-z_]+)/.exec(res.error.message);
          return json({ ok: false, code: m?.[1] ?? "failed" }, m ? 400 : 500);
        }
        const out = res.data as { conversation_id: string; message_id: string; recipient: string; push: boolean };
        if (out.push) {
          try {
            await pushNewMessage(out.recipient, out.conversation_id, token);
          } catch (e) {
            console.error("[mm-msg] push failed", e);
          }
        }
        return json({ ok: true, conversationId: out.conversation_id, messageId: out.message_id });
      },
    },
  },
});

async function pushNewMessage(recipient: string, conversationId: string, token: string) {
  const keys = vapidFromEnv();
  if (!keys) return;
  const db = await admin();
  const { data: u } = await db.auth.getUser(token);
  const senderId = u.user?.id;
  if (!senderId) return;
  const [{ data: sender }, { data: blocked }, { data: subs }] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", senderId).maybeSingle(),
    db.from("blocks").select("blocker_id").eq("blocker_id", recipient).eq("blocked_id", senderId).maybeSingle(),
    db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", recipient).eq("enabled", true),
  ]);
  if (blocked || !subs?.length) return;
  const name = sender?.display_name?.trim() || "Jemand";
  const payload = {
    title: "Neue Nachricht",
    body: `${name} hat dir geschrieben`,
    tag: `mm-msg-${conversationId}`,
    url: `/?inbox=${conversationId}`,
  };
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendWebPush(s, payload, keys, 86400);
      if (r.status === 404 || r.status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }),
  );
}
