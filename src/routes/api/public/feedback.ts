import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/push.server";
import { BY_ID } from "@/lib/festival";
import { canRateAt } from "@/lib/feedback-rules";

const Body = z.object({
  sessionId: z.string().min(1).max(40),
  clientId: z.string().uuid(),
  q_overall: z.number().int().min(1).max(5),
  q_content: z.number().int().min(1).max(5),
  q_interaction: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable(),
  shareName: z.boolean().optional(),
});

type Db = Awaited<ReturnType<typeof admin>>;

async function userFromRequest(db: Db, request: Request): Promise<{ id: string | null; bad: boolean }> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth) return { id: null, bad: false };
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length > 4000) return { id: null, bad: true };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { id: null, bad: true };
  return { id: data.user.id, bad: false };
}

const COLS = "session_id, q_overall, q_content, q_interaction, comment, share_name, updated_at";

export const Route = createFileRoute("/api/public/feedback")({
  server: {
    handlers: {
      // Eigene Bewertungen (nur angemeldet)
      GET: async ({ request }) => {
        const db = await admin();
        const u = await userFromRequest(db, request);
        if (!u.id) return json({ ok: false, error: "nicht angemeldet" }, 401);
        const { data, error } = await db.from("session_feedback").select(COLS).eq("user_id", u.id);
        if (error) return json({ ok: false, error: "Laden fehlgeschlagen" }, 500);
        return json({ ok: true, items: data ?? [] });
      },
      POST: async ({ request }) => {
        const raw = await readJson(request);
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return json({ ok: false, error: "Ungültige Angaben" }, 400);
        const b = parsed.data;
        const s = BY_ID[b.sessionId];
        if (!s) return json({ ok: false, error: "Unbekannte Session" }, 400);
        if (!canRateAt(s, Date.now())) return json({ ok: false, error: "Diese Session kann gerade nicht bewertet werden" }, 409);

        const db = await admin();
        const u = await userFromRequest(db, request);
        if (u.bad) return json({ ok: false, error: "Anmeldung abgelaufen" }, 401);

        // Rate-Limit: 60 Schreibvorgänge pro Stunde je Geräte-ID und je IP-Hash
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
        const keys = [`c:${b.clientId}`];
        if (ip) keys.push(`i:${createHash("sha256").update("mm-fb:" + ip).digest("hex").slice(0, 32)}`);
        const since = new Date(Date.now() - 3600000).toISOString();
        for (const k of keys) {
          const { count } = await db.from("feedback_writes").select("id", { count: "exact", head: true }).eq("key", k).gte("at", since);
          if ((count ?? 0) >= 60) return json({ ok: false, error: "Zu viele Bewertungen – bitte später erneut versuchen" }, 429);
        }
        await db.from("feedback_writes").insert(keys.map((key) => ({ key })));
        void db.from("feedback_writes").delete().lt("at", new Date(Date.now() - 86400000).toISOString());

        const comment = b.comment?.trim().slice(0, 1000) || null;
        const row = {
          session_id: s.id,
          user_id: u.id,
          client_id: b.clientId,
          q_overall: b.q_overall,
          q_content: b.q_content,
          q_interaction: b.q_interaction,
          comment,
          share_name: !!u.id && !!b.shareName,
          updated_at: new Date().toISOString(),
        };
        let q = db.from("session_feedback").select("id").eq("session_id", s.id);
        q = u.id ? q.eq("user_id", u.id) : q.is("user_id", null).eq("client_id", b.clientId);
        const { data: existing, error: selErr } = await q.maybeSingle();
        if (selErr) return json({ ok: false, error: "Speichern fehlgeschlagen" }, 500);
        const { error } = existing
          ? await db.from("session_feedback").update(row).eq("id", existing.id)
          : await db.from("session_feedback").insert(row);
        if (error) return json({ ok: false, error: "Speichern fehlgeschlagen" }, 500);
        return json({ ok: true, updated: !!existing });
      },
    },
  },
});
