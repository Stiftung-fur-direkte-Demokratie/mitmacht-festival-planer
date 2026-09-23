import { createFileRoute } from "@tanstack/react-router";
import { admin, json } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/auth/account")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.length > 4000) return json({ ok: false, error: "nicht angemeldet" }, 401);
        const db = await admin();
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) return json({ ok: false, error: "nicht angemeldet" }, 401);
        const id = data.user.id;
        await db.from("attendance").delete().eq("user_id", id);
        await db.from("user_roles").delete().eq("user_id", id);
        await db.from("profiles").delete().eq("id", id);
        const { error: dErr } = await db.auth.admin.deleteUser(id);
        if (dErr) return json({ ok: false, error: "Löschen fehlgeschlagen" }, 500);
        return json({ ok: true });
      },
    },
  },
});
