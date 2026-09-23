import { createFileRoute } from "@tanstack/react-router";
import { admin } from "@/lib/push.server";
import { esc, verifyUnsubToken } from "@/lib/notify.server";

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f1ea;color:#0B3A2A">
<main style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;padding:24px;line-height:1.5">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}
<p style="margin-top:20px"><a href="/" style="color:#0B3A2A">Zum Mitmacht-Planer</a></p></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

async function disable(uid: string) {
  const db = await admin();
  const { error } = await db.from("profiles").update({ notify_morning_email: false, notify_evening_email: false }).eq("id", uid);
  return !error;
}

export const Route = createFileRoute("/api/public/notify/unsubscribe")({
  server: {
    handlers: {
      // Link aus der E-Mail: Bestätigungsseite (kein Abmelden durch Link-Vorschau von Mailprogrammen)
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        if (!verifyUnsubToken(t)) return page("Link ungültig", "<p>Dieser Abmelde-Link ist ungültig. Du kannst die E-Mails auch im Planer unter „Mein Profil“ abschalten.</p>");
        return page(
          "E-Mails abbestellen?",
          `<p>Du bekommst dann keine Tagesübersichten und Bewertungs-Erinnerungen mehr per E-Mail. Push-Benachrichtigungen bleiben unverändert.</p>
<form method="post"><input type="hidden" name="t" value="${esc(t)}"><button type="submit" style="font:inherit;font-weight:700;background:#E63B2E;color:#fff;border:0;border-radius:999px;padding:12px 20px;cursor:pointer">Abmelden</button></form>`,
        );
      },
      // Formular und RFC-8058-One-Click (List-Unsubscribe-Post)
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let t = url.searchParams.get("t") ?? "";
        try {
          const f = await request.formData();
          const v = f.get("t");
          if (typeof v === "string" && v) t = v;
        } catch {
          /* One-Click-Body ohne t */
        }
        const uid = verifyUnsubToken(t);
        if (!uid) return page("Link ungültig", "<p>Dieser Abmelde-Link ist ungültig.</p>");
        const ok = await disable(uid);
        return ok
          ? page("Abgemeldet ✓", "<p>Du bekommst keine E-Mails vom Mitmacht-Planer mehr. Du kannst sie jederzeit in deinem Profil wieder einschalten.</p>")
          : page("Das hat nicht geklappt", "<p>Bitte später noch einmal versuchen.</p>");
      },
    },
  },
});
