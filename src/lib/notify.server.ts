// Tägliche Benachrichtigungen (Morgen-Übersicht, Abend-Bewertung) per Push und E-Mail.
import { createHmac, timingSafeEqual } from "crypto";
import { BY_ID, bySchedule, clashesFor, dayOf, FORMAT_LABEL, isLong, type Item } from "@/lib/festival";
import { admin, berlinNow } from "@/lib/push.server";
import { sendWebPush, vapidFromEnv } from "@/lib/webpush.server";

export const APP_URL = "https://mitmacht.demokratie.ch";
export const FESTIVAL_DAYS = ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];
const PRIVACY = "https://www.demokratie.ch/datenschutz";

export type Kind = "morning" | "evening";
export type ChannelResult = "gesendet" | "nicht eingerichtet" | "aus" | "nichts zu senden" | "schon gesendet" | "Fehler";

type Db = Awaited<ReturnType<typeof admin>>;
type Prof = {
  id: string;
  display_name: string;
  contact_email: string | null;
  notify_morning_push: boolean;
  notify_morning_email: boolean;
  notify_evening_push: boolean;
  notify_evening_email: boolean;
};
const PROF_COLS = "id, display_name, contact_email, notify_morning_push, notify_morning_email, notify_evening_push, notify_evening_email";

/* ---------- Hilfen ---------- */
export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  return `${u[0]}***@${d}`;
}
function firstName(n: string) {
  return n.trim().split(/\s+/)[0] || "";
}
function dayTitle(date: string) {
  const d = dayOf(date);
  return `${d.long}, ${Number(date.slice(8, 10))}. September`;
}

export function smtpConfig() {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASSWORD"];
  const from = process.env["SMTP_FROM"];
  if (!host || !user || !pass || !from) return null;
  const port = Number(process.env["SMTP_PORT"] || 587);
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return { host, port, user, pass, fromName: m ? m[1]!.replace(/^"|"$/g, "") : "", fromEmail: m ? m[2]! : from.trim() };
}

/* ---------- Abmelde-Token ---------- */
function unsubSecret() {
  return process.env["NOTIFY_UNSUB_SECRET"] ?? "";
}
export function unsubToken(userId: string) {
  const sig = createHmac("sha256", unsubSecret()).update("unsub:" + userId).digest("base64url").slice(0, 32);
  return `${userId}.${sig}`;
}
export function verifyUnsubToken(t: string): string | null {
  const [uid, sig] = t.split(".");
  if (!uid || !sig || !/^[0-9a-f-]{36}$/i.test(uid) || !unsubSecret()) return null;
  const exp = unsubToken(uid).split(".")[1]!;
  const a = Buffer.from(sig);
  const b = Buffer.from(exp);
  return a.length === b.length && timingSafeEqual(a, b) ? uid : null;
}
export const unsubUrl = (userId: string) => `${APP_URL}/api/public/notify/unsubscribe?t=${encodeURIComponent(unsubToken(userId))}`;

/* ---------- Inhalte ---------- */
export type Content = { push: { title: string; body: string; url: string; tag: string }; subject: string; html: string; text: string };

function layout(title: string, inner: string, userId: string) {
  const u = esc(unsubUrl(userId));
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B3A2A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0B3A2A;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#E63B2E;margin-right:8px;vertical-align:middle"></span>Mitmacht 2026</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5">${inner}</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;line-height:1.5;color:#5b6b63;border-top:1px solid #e6e1d6">
Du bekommst diese E-Mail, weil du sie im Mitmacht-Planer aktiviert hast. <a href="${u}" style="color:#0B3A2A">Abmelden</a><br>
© 2026 – Stiftung für direkte Demokratie – <a href="${PRIVACY}" style="color:#0B3A2A">Datenschutzerklärung</a>
</td></tr></table></td></tr></table></body></html>`;
}
function button(href: string, label: string) {
  return `<a href="${esc(href)}" style="display:inline-block;background:#E63B2E;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;margin:6px 0">${esc(label)}</a>`;
}
function textFooter(userId: string) {
  return `\n\n--\nDu bekommst diese E-Mail, weil du sie im Mitmacht-Planer aktiviert hast.\nAbmelden: ${unsubUrl(userId)}\n© 2026 – Stiftung für direkte Demokratie – Datenschutzerklärung: ${PRIVACY}\n`;
}

export function morningContent(p: { userId: string; name: string; day: string; sessions: Item[] }): Content | null {
  const list = p.sessions.filter((s) => s.date === p.day).sort(bySchedule);
  if (!list.length) return null;
  const first = list.find((s) => !isLong(s)) ?? list[0]!;
  const n = list.length;
  const nWord = n === 1 ? "1 Session" : `${n} Sessions`;
  const subject = `Dein Mitmacht-Tag: ${dayTitle(p.day)} – ${nWord}`;
  const hi = firstName(p.name) ? `Guten Morgen ${firstName(p.name)}!` : "Guten Morgen!";
  const rows = list
    .map((s) => {
      const clash = clashesFor(s, list).length > 0;
      return `<tr><td style="padding:8px 10px 8px 0;vertical-align:top;white-space:nowrap;font-weight:700">${esc(s.start)}–${esc(s.end)}</td>
<td style="padding:8px 0;vertical-align:top"><div style="font-weight:700">${esc(s.title)}</div>
<div style="font-size:14px;color:#5b6b63">${esc([s.room, FORMAT_LABEL[s.format]].filter(Boolean).join(" · "))}</div>
${clash ? `<div style="font-size:14px;color:#C23225;font-weight:700">⚠ Überschneidung</div>` : ""}</td></tr>`;
    })
    .join("");
  const inner = `<p style="margin:0 0 12px">${esc(hi)} Heute stehen ${esc(nWord)} in deiner Agenda:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">${rows}</table>
<p style="margin:18px 0 6px">${button(`${APP_URL}/#mein`, "Agenda in der App öffnen")}</p>
<p style="margin:12px 0 0;font-size:14px;color:#5b6b63">SRH Hochschule Berlin, Sonnenallee 221</p>`;
  const text =
    `${hi} Heute stehen ${nWord} in deiner Agenda:\n\n` +
    list
      .map((s) => `${s.start}–${s.end}  ${s.title}${s.room ? " · " + s.room : ""}${FORMAT_LABEL[s.format] ? " · " + FORMAT_LABEL[s.format] : ""}${clashesFor(s, list).length ? "  (Überschneidung)" : ""}`)
      .join("\n") +
    `\n\nAgenda in der App öffnen: ${APP_URL}/#mein\nSRH Hochschule Berlin, Sonnenallee 221` +
    textFooter(p.userId);
  return {
    push: { title: "Dein Mitmacht-Tag", body: `${nWord} heute – los geht's um ${first.start}: ${first.title}`, url: "/#mein", tag: `mm-morning-${p.day}` },
    subject,
    html: layout(subject, inner, p.userId),
    text,
  };
}

export function eveningContent(p: { userId: string; name: string; day: string; time: string; sessions: Item[]; rated: Set<string> }): Content | null {
  const list = p.sessions
    .filter((s) => s.date === p.day && !isLong(s) && s.end <= p.time && !p.rated.has(s.id))
    .sort(bySchedule);
  if (!list.length) return null;
  const k = list.length;
  const subject = "Wie waren deine Sessions heute?";
  const hi = firstName(p.name) ? `Hallo ${firstName(p.name)},` : "Hallo,";
  const inner = `<p style="margin:0 0 12px">${esc(hi)} danke, dass du heute dabei warst! Wie fandest du diese Sessions? Jede Bewertung dauert etwa 10 Sekunden.</p>
${list.map((s) => `<div style="margin:0 0 10px"><div style="font-size:14px;color:#5b6b63">${esc(s.start)}–${esc(s.end)}${s.room ? " · " + esc(s.room) : ""}</div>${button(`${APP_URL}/?rate=${encodeURIComponent(s.id)}`, `„${s.title}“ bewerten`)}</div>`).join("")}
<p style="margin:14px 0 0;font-size:14px;color:#5b6b63">Dein Feedback geht anonym an die Organisationen der Sessions.</p>`;
  const text =
    `${hi} danke, dass du heute dabei warst! Wie fandest du diese Sessions?\n\n` +
    list.map((s) => `${s.start}–${s.end}  ${s.title}\nBewerten: ${APP_URL}/?rate=${encodeURIComponent(s.id)}`).join("\n\n") +
    `\n\nDein Feedback geht anonym an die Organisationen der Sessions.` +
    textFooter(p.userId);
  return {
    push: {
      title: "Wie waren deine Sessions heute?",
      body: `${k} ${k === 1 ? "wartet" : "warten"} auf deine Bewertung – dauert 10 Sekunden pro Session`,
      url: `/?rate=${encodeURIComponent(list[0]!.id)}`,
      tag: `mm-evening-${p.day}`,
    },
    subject,
    html: layout(subject, inner, p.userId),
    text,
  };
}

/* ---------- Versand ---------- */
export async function sendEmail(to: string, c: Content, userId: string): Promise<"gesendet" | "nicht eingerichtet" | "Fehler"> {
  const cfg = smtpConfig();
  if (!cfg) return "nicht eingerichtet";
  try {
    const { WorkerMailer } = await import("worker-mailer");
    const u = unsubUrl(userId);
    await WorkerMailer.send(
      {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        startTls: cfg.port !== 465,
        credentials: { username: cfg.user, password: cfg.pass },
        authType: ["plain", "login"],
      },
      {
        from: cfg.fromName ? { name: cfg.fromName, email: cfg.fromEmail } : cfg.fromEmail,
        to,
        subject: c.subject,
        text: c.text,
        html: c.html,
        headers: { "List-Unsubscribe": `<${u}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      },
    );
    return "gesendet";
  } catch (e) {
    console.error("[mm-notify] SMTP-Fehler", e instanceof Error ? e.message : e);
    return "Fehler";
  }
}

export async function sendPushToUser(db: Db, userId: string, c: Content): Promise<"gesendet" | "nicht eingerichtet" | "Fehler"> {
  const keys = vapidFromEnv();
  if (!keys) return "nicht eingerichtet";
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).eq("enabled", true);
  if (!subs?.length) return "nicht eingerichtet";
  let ok = 0;
  for (const s of subs) {
    const r = await sendWebPush(s, c.push, keys, 43200);
    if (r.status === 404 || r.status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    else if (r.ok) ok++;
  }
  return ok ? "gesendet" : "Fehler";
}

async function loginEmail(db: Db, userId: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}
export async function recipientFor(db: Db, p: { id: string; contact_email: string | null }) {
  return p.contact_email || (await loginEmail(db, p.id));
}

async function agendaOf(db: Db, userIds: string[]) {
  const map: Record<string, Item[]> = {};
  if (!userIds.length) return map;
  const { data } = await db.from("attendance").select("user_id, session_id").in("user_id", userIds);
  (data ?? []).forEach((a) => {
    const s = BY_ID[a.session_id];
    if (s) (map[a.user_id] ??= []).push(s);
  });
  return map;
}
async function ratedOf(db: Db, userIds: string[], day: string) {
  const map: Record<string, Set<string>> = {};
  if (!userIds.length) return map;
  const { data } = await db.from("session_feedback").select("user_id, session_id").in("user_id", userIds);
  (data ?? []).forEach((r) => {
    if (r.user_id && BY_ID[r.session_id]?.date === day) (map[r.user_id] ??= new Set()).add(r.session_id);
  });
  return map;
}

/** Nächster Festivaltag ab heute (für den Test-Versand) */
export function testDay(today: string) {
  return FESTIVAL_DAYS.find((d) => d >= today) ?? FESTIVAL_DAYS[FESTIVAL_DAYS.length - 1]!;
}

/* ---------- Tageslauf (Cron) ---------- */
export async function runDaily(kind: Kind, opts: { dryRun?: boolean; now?: { date: string; time: string } } = {}) {
  const now = opts.now ?? berlinNow();
  const result = {
    kind,
    day: now.date,
    dryRun: !!opts.dryRun,
    users: 0,
    push: { sent: 0, failed: 0, skipped: 0 },
    email: { sent: 0, failed: 0, skipped: 0, notConfigured: 0 },
    preview: [] as { user: string; push: boolean; email: string | null; title: string; body: string; subject: string }[],
    note: "" as string,
  };
  if (!FESTIVAL_DAYS.includes(now.date)) {
    result.note = "Kein Festivaltag – nichts zu tun";
    return result;
  }
  const db = await admin();
  const pushCol = kind === "morning" ? "notify_morning_push" : "notify_evening_push";
  const mailCol = kind === "morning" ? "notify_morning_email" : "notify_evening_email";
  const smtp = !!smtpConfig();
  const PAGE = 200;
  for (let from = 0; ; from += PAGE) {
    const { data: profs, error } = await db
      .from("profiles")
      .select(PROF_COLS)
      .or(`${pushCol}.eq.true,${mailCol}.eq.true`)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      result.note = "Profile konnten nicht geladen werden";
      break;
    }
    const batch = (profs ?? []) as Prof[];
    if (!batch.length) break;
    const ids = batch.map((p) => p.id);
    const [agenda, rated] = await Promise.all([agendaOf(db, ids), kind === "evening" ? ratedOf(db, ids, now.date) : Promise.resolve({} as Record<string, Set<string>>)]);
    for (const p of batch) {
      try {
        const sessions = agenda[p.id] ?? [];
        const c =
          kind === "morning"
            ? morningContent({ userId: p.id, name: p.display_name, day: now.date, sessions })
            : eveningContent({ userId: p.id, name: p.display_name, day: now.date, time: now.time, sessions, rated: rated[p.id] ?? new Set() });
        if (!c) continue;
        result.users++;
        const wantPush = p[pushCol];
        const wantMail = p[mailCol];
        if (opts.dryRun) {
          const to = wantMail ? await recipientFor(db, p) : null;
          result.preview.push({ user: p.display_name, push: wantPush, email: to ? maskEmail(to) : null, title: c.push.title, body: c.push.body, subject: c.subject });
          continue;
        }
        for (const ch of ["push", "email"] as const) {
          if (ch === "push" ? !wantPush : !wantMail) continue;
          if (ch === "email" && !smtp) {
            result.email.notConfigured++;
            continue;
          }
          // Erst reservieren (unique) → nie doppelt
          const { data: claim, error: cErr } = await db
            .from("notification_log")
            .insert({ user_id: p.id, kind, day: now.date, channel: ch, status: "pending" })
            .select("id")
            .maybeSingle();
          if (cErr || !claim) {
            result[ch].skipped++;
            continue;
          }
          let st: string;
          if (ch === "push") st = await sendPushToUser(db, p.id, c);
          else {
            const to = await recipientFor(db, p);
            st = to ? await sendEmail(to, c, p.id) : "nicht eingerichtet";
          }
          await db.from("notification_log").update({ status: st }).eq("id", claim.id);
          if (st === "gesendet") result[ch].sent++;
          else if (st === "Fehler") result[ch].failed++;
          else result[ch].skipped++;
        }
      } catch (e) {
        console.error("[mm-notify] Fehler bei Empfänger", p.id, e instanceof Error ? e.message : e);
      }
    }
    if (batch.length < PAGE) break;
  }
  console.info("[mm-notify]", JSON.stringify({ ...result, preview: result.preview.length }));
  return result;
}
