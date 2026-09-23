import { createFileRoute } from "@tanstack/react-router";
import { admin, json } from "@/lib/push.server";
import { BY_ID, bySchedule, dayOf, FORMAT_LABEL, type Item } from "@/lib/festival";

type Row = {
  session_id: string;
  user_id: string | null;
  q_overall: number;
  q_content: number;
  q_interaction: number;
  comment: string | null;
  share_name: boolean;
  created_at: string;
  updated_at: string;
};

function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV-Injection verhindern
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function berlin(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
function contributors(s: Item) {
  if (s.speakers?.length) {
    return s.speakers.map((p) => [p.name, p.organisation].filter(Boolean).join(" (") + (p.organisation ? ")" : "")).join(", ");
  }
  return s.people ?? "";
}
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export const Route = createFileRoute("/api/public/feedback/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.length > 4000) return json({ ok: false, error: "nicht angemeldet" }, 401);
        const db = await admin();
        const { data: u, error: uErr } = await db.auth.getUser(token);
        if (uErr || !u.user) return json({ ok: false, error: "nicht angemeldet" }, 401);
        const { data: roles } = await db.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin");
        if (!roles?.length) return json({ ok: false, error: "nicht erlaubt" }, 403);

        const url = new URL(request.url);
        const only = url.searchParams.get("session");
        let q = db.from("session_feedback").select("session_id, user_id, q_overall, q_content, q_interaction, comment, share_name, created_at, updated_at").order("created_at");
        if (only) q = q.eq("session_id", only);
        const { data, error } = await q.limit(20000);
        if (error) return json({ ok: false, error: "Laden fehlgeschlagen" }, 500);
        const rows = (data ?? []) as Row[];

        if (url.searchParams.get("format") === "json") {
          const by: Record<string, Row[]> = {};
          rows.forEach((r) => (by[r.session_id] ??= []).push(r));
          const sessions = Object.keys(by)
            .map((id) => BY_ID[id])
            .filter(Boolean)
            .sort((a, b) => bySchedule(a as Item, b as Item))
            .map((s) => {
              const rs = by[s!.id]!;
              return {
                id: s!.id,
                title: s!.title,
                day: dayOf(s!.date).short,
                start: s!.start,
                count: rs.length,
                overall: avg(rs.map((r) => r.q_overall)),
                content: avg(rs.map((r) => r.q_content)),
                interaction: avg(rs.map((r) => r.q_interaction)),
              };
            });
          return json({ ok: true, total: rows.length, sessions });
        }

        const ids = [...new Set(rows.filter((r) => r.share_name && r.user_id).map((r) => r.user_id!))];
        const names: Record<string, string> = {};
        if (ids.length) {
          const { data: ps } = await db.from("profiles").select("id, display_name").in("id", ids);
          (ps ?? []).forEach((p) => (names[p.id] = p.display_name));
        }
        const sorted = [...rows].sort((a, b) => {
          const sa = BY_ID[a.session_id];
          const sb = BY_ID[b.session_id];
          return (sa && sb ? bySchedule(sa, sb) : 0) || a.created_at.localeCompare(b.created_at);
        });
        const head = ["Tag", "Zeit", "Session-ID", "Titel", "Format", "Raum", "Mitwirkende/Organisationen", "Gesamteindruck", "Inhalt & Relevanz", "Interaktion & Moderation", "Kommentar", "Name", "Angemeldet", "Erstellt", "Geändert"];
        const lines = [head.map(cell).join(";")];
        for (const r of sorted) {
          const s = BY_ID[r.session_id];
          lines.push(
            [
              s ? `${dayOf(s.date).long} ${dayOf(s.date).label}`.trim() : "",
              s ? `${s.start}–${s.end}` : "",
              r.session_id,
              s?.title ?? "",
              s ? FORMAT_LABEL[s.format] ?? s.format : "",
              s?.room ?? "",
              s ? contributors(s) : "",
              r.q_overall,
              r.q_content,
              r.q_interaction,
              r.comment ?? "",
              r.share_name && r.user_id ? names[r.user_id] ?? "" : "",
              r.user_id ? "ja" : "nein",
              berlin(r.created_at),
              berlin(r.updated_at),
            ]
              .map(cell)
              .join(";"),
          );
        }
        const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
        const name = `mitmacht-2026-feedback-${only ? only + "-" : ""}${date}.csv`;
        return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${name}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
