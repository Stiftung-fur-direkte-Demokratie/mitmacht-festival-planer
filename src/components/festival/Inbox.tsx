import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, LinkedInIcon } from "./Community";
import { Icon } from "./Icons";
import { dayHeading, MSG_MAX, relTime, timeHM, type AdminReport, type InboxItem, type Message } from "@/lib/inbox";

export type ConvPartner = {
  id: string;
  name: string;
  avatar: string | null;
  role: string | null;
  org: string | null;
  linkedin: string | null;
};

export function MessageIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

/* Nur http(s)-Links verlinken, Rest als reiner Text */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function useSheetFocus(open: boolean, panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void, initial?: () => HTMLElement | null) {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const last = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    const t = setTimeout(() => (initial?.() ?? focusables()[0] ?? panel)?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0]!;
      const lastEl = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      last?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export function InboxList(p: {
  loggedIn: boolean;
  online: boolean;
  items: InboxItem[];
  loginReason: boolean;
  configured: boolean | null;
  pushHint: ReactNode;
  onOpen: (i: InboxItem) => void;
  onLogin: () => void;
}) {
  if (!p.loggedIn) {
    return (
      <div className="cm-cta">
        {p.loginReason && <p className="statusline">Zum Schreiben mit LinkedIn anmelden</p>}
        <p>Melde dich mit LinkedIn an, um Nachrichten zu schreiben und zu empfangen.</p>
        <button type="button" className="btn small" onClick={p.onLogin} disabled={!p.online}>
          <LinkedInIcon size={16} /> Mit LinkedIn anmelden
        </button>
        {!p.online && <p className="sub">Anmelden ist offline nicht möglich.</p>}
        {p.online && p.configured === false && <p className="sub">Die LinkedIn-Anmeldung wird gerade eingerichtet.</p>}
      </div>
    );
  }
  return (
    <div className="inbox">
      {p.pushHint}
      {!p.online && <p className="offline small">Offline – Senden ist erst mit Internet möglich.</p>}
      {p.items.length === 0 ? (
        <p className="empty-cm">Noch keine Nachrichten. Schreib jemandem aus der Community!</p>
      ) : (
        <ul className="ib-list">
          {p.items.map((i) => {
            const meta = [i.role_title, i.organisation].filter(Boolean).join(" · ");
            return (
              <li key={i.conversation_id}>
                <button type="button" className={`ib-row${i.unread ? " unread" : ""}`} onClick={() => p.onOpen(i)}>
                  <Avatar name={i.display_name} url={i.avatar_url} size={44} />
                  <span className="ib-txt">
                    <span className="ib-top">
                      <b>{i.display_name}</b>
                      <span className="ib-time">{relTime(i.last_message_at)}</span>
                    </span>
                    {meta && <span className="ib-meta">{meta}</span>}
                    <span className="ib-prev">{i.last_body}</span>
                  </span>
                  {i.unread > 0 && (
                    <span className="ib-dot" aria-label={`${i.unread} ungelesen`} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AdminReports({ reports, online, onHide }: { reports: AdminReport[]; online: boolean; onHide: (uid: string, hidden: boolean) => void }) {
  if (!reports.length) return null;
  return (
    <details className="ib-reports">
      <summary>Meldungen ({reports.length}) – nur für Admins</summary>
      <ul>
        {reports.map((r) => (
          <li key={r.id}>
            <p className="sub">
              {new Date(r.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })} ·{" "}
              <b>{r.reporter_name}</b> meldet <b>{r.reported_name}</b>
              {r.reported_hidden ? " (ausgeblendet)" : ""}
            </p>
            {r.reason && <p>Grund: {r.reason}</p>}
            {r.message_body_snapshot && <blockquote>{r.message_body_snapshot}</blockquote>}
            {r.reported_user_id && (
              <button type="button" className="linkbtn" disabled={!online} onClick={() => onHide(r.reported_user_id!, !r.reported_hidden)}>
                {r.reported_hidden ? "Wieder einblenden" : "Person ausblenden"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ConversationSheet(p: {
  open: boolean;
  onClose: () => void;
  partner: ConvPartner;
  conversationId: string | null;
  messages: Message[];
  userId: string;
  online: boolean;
  canReply: boolean;
  partnerGone: boolean;
  blockedMe: boolean;
  onSend: (body: string) => Promise<{ ok: boolean; error?: string }>;
  onBlock: () => Promise<boolean>;
  onReport: (reason: string) => Promise<{ ok: boolean; error: string | null }>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<null | "menu" | "block" | "report">(null);
  const [reason, setReason] = useState("");
  const [live, setLive] = useState("");
  const seen = useRef<number>(0);
  useSheetFocus(p.open, panelRef, p.onClose, () => taRef.current);

  useEffect(() => {
    if (!p.open) return;
    setText("");
    setErr(null);
    setMenu(null);
    setReason("");
    seen.current = p.messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.partner.id]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    const newer = p.messages.slice(seen.current).filter((m) => m.sender_id !== p.userId);
    if (newer.length) setLive(`Neue Nachricht von ${p.partner.name}: ${newer[newer.length - 1]!.body.slice(0, 140)}`);
    seen.current = p.messages.length;
  }, [p.messages, p.userId, p.partner.name]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [text]);

  if (!p.open) return null;

  const trimmed = text.trim();
  const disabled = !p.online || !p.canReply || busy;
  const submit = async () => {
    if (disabled || !trimmed || trimmed.length > MSG_MAX) return;
    setBusy(true);
    setErr(null);
    const r = await p.onSend(trimmed);
    setBusy(false);
    if (r.ok) setText("");
    else setErr(r.error ?? "Senden fehlgeschlagen.");
  };
  const meta = [p.partner.role, p.partner.org].filter(Boolean).join(" · ");
  const isNew = !p.conversationId && p.messages.length === 0;

  let lastDay = "";
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sheet conv" role="dialog" aria-modal="true" aria-labelledby="conv-h" tabIndex={-1} ref={panelRef}>
        <div className="sheet-head conv-head">
          <button type="button" className="iconbtn" aria-label="Zurück zum Postfach" onClick={p.onClose}>
            <Icon name="close" />
          </button>
          <Avatar name={p.partner.name} url={p.partner.avatar} size={38} />
          <div className="conv-who">
            <h2 id="conv-h">{p.partner.name}</h2>
            {meta && <p className="sub">{meta}</p>}
          </div>
          {p.partner.linkedin && (
            <a className="iconbtn" href={p.partner.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${p.partner.name} auf LinkedIn`}>
              <LinkedInIcon size={18} />
            </a>
          )}
          {!p.partnerGone && (
            <button
              type="button"
              className="iconbtn"
              aria-label="Weitere Aktionen"
              aria-expanded={menu !== null}
              onClick={() => setMenu((m) => (m ? null : "menu"))}
            >
              <span aria-hidden="true" className="dots">···</span>
            </button>
          )}
        </div>
        {menu && (
          <div className="conv-menu">
            {menu === "menu" && (
              <div className="btnrow">
                <button type="button" className="btn small" onClick={() => setMenu("block")}>
                  Blockieren
                </button>
                <button type="button" className="btn small" onClick={() => setMenu("report")}>
                  Melden
                </button>
              </div>
            )}
            {menu === "block" && (
              <div className="confirm" role="alert">
                <p>{p.partner.name} blockieren? Ihr könnt euch dann gegenseitig nicht mehr schreiben, und die Unterhaltung verschwindet aus deinem Postfach. Aufheben kannst du das unter „Mein Profil“.</p>
                <div className="btnrow">
                  <button
                    type="button"
                    className="btn small danger"
                    disabled={!p.online}
                    onClick={async () => {
                      if (await p.onBlock()) p.onClose();
                    }}
                  >
                    Blockieren
                  </button>
                  <button type="button" className="linkbtn" onClick={() => setMenu(null)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
            {menu === "report" && (
              <div className="confirm">
                <label className="field">
                  Warum meldest du diese Unterhaltung? <span className="opt">(max. 500 Zeichen)</span>
                  <textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
                </label>
                <p className="sub">Das Team sieht deine Meldung und die letzten Nachrichten dieser Person an dich.</p>
                <div className="btnrow">
                  <button
                    type="button"
                    className="btn small danger"
                    disabled={!p.online}
                    onClick={async () => {
                      const r = await p.onReport(reason);
                      if (r.ok) setMenu(null);
                      else setErr(r.error);
                    }}
                  >
                    Meldung senden
                  </button>
                  <button type="button" className="linkbtn" onClick={() => setMenu(null)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="sheet-body conv-body">
          {isNew && <p className="statusline sub2">Die Person sieht deinen Namen, dein Profilbild und deine Angaben aus dem Profil.</p>}
          {p.messages.map((m) => {
            const d = dayHeading(m.created_at);
            const head = d !== lastDay ? d : null;
            lastDay = d;
            const mine = m.sender_id === p.userId;
            return (
              <Fragment key={m.id}>
                {head && <p className="conv-day">{head}</p>}
                <div className={`bubble${mine ? " mine" : ""}`}>
                  <p>
                    <Linkified text={m.body} />
                  </p>
                  <time dateTime={m.created_at}>{timeHM(m.created_at)}</time>
                </div>
              </Fragment>
            );
          })}
          <div ref={endRef} />
          <p className="sr-only" aria-live="polite">
            {live}
          </p>
        </div>
        <div className="conv-foot">
          {p.partnerGone ? (
            <p className="sub">Konto gelöscht – Antworten ist nicht mehr möglich.</p>
          ) : p.blockedMe || !p.canReply ? (
            <p className="sub">In dieser Unterhaltung kannst du keine Nachrichten mehr senden.</p>
          ) : !p.online ? (
            <p className="sub">Offline – Senden ist erst mit Internet möglich.</p>
          ) : null}
          {err && (
            <p className="clash" role="alert">
              {err}
            </p>
          )}
          <div className="conv-input">
            <textarea
              ref={taRef}
              value={text}
              rows={1}
              maxLength={MSG_MAX + 200}
              placeholder="Nachricht schreiben …"
              aria-label="Nachricht"
              disabled={disabled && !busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <button type="button" className="btn primary small" onClick={() => void submit()} disabled={disabled || !trimmed || trimmed.length > MSG_MAX}>
              Senden
            </button>
          </div>
          {trimmed.length > MSG_MAX - 150 && (
            <p className={`sub conv-count${trimmed.length > MSG_MAX ? " over" : ""}`}>
              {trimmed.length} / {MSG_MAX}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
