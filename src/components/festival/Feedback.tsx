import { useEffect, useRef, useState } from "react";
import { dayOf, timeLabel, type Item } from "@/lib/festival";
import { FEEDBACK_QUESTIONS } from "@/lib/feedback-rules";
import { adminFeedbackSummary, downloadFeedbackCsv, type Rating } from "@/lib/feedback";
import { Icon } from "./Icons";

function Stars({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="fb-q">
      <legend>{label}</legend>
      <div className="fb-stars" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={n <= value ? "on" : ""}>
            <input type="radio" name={id} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n} von 5`} />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
      <p className="fb-scale">1 = schwach, 5 = sehr gut</p>
    </fieldset>
  );
}

export function FeedbackSheet(p: {
  session: Item | null;
  initial: Rating | undefined;
  loggedIn: boolean;
  online: boolean;
  onClose: () => void;
  onSubmit: (r: Rating) => Promise<{ ok: boolean; queued?: boolean; error?: string }>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [v, setV] = useState<Rating>({ q_overall: 0, q_content: 0, q_interaction: 0, comment: "", share_name: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = p.session;

  useEffect(() => {
    if (!s) return;
    setV(p.initial ?? { q_overall: 0, q_content: 0, q_interaction: 0, comment: "", share_name: false });
    setErr(null);
    const panel = panelRef.current;
    const last = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel?.querySelector<HTMLElement>("input,button")?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        p.onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const list = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),textarea")).filter(
        (el) => el.getClientRects().length > 0 && !(el instanceof HTMLInputElement && el.type === "radio" && !el.checked && panel.querySelector(`input[name="${el.name}"]:checked`)),
      );
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
  }, [s?.id]);

  if (!s) return null;
  const complete = v.q_overall > 0 && v.q_content > 0 && v.q_interaction > 0;
  const send = async () => {
    if (!complete) return setErr("Bitte alle drei Fragen beantworten.");
    setBusy(true);
    const r = await p.onSubmit({ ...v, comment: v.comment.slice(0, 1000), share_name: p.loggedIn && v.share_name });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Senden fehlgeschlagen");
  };

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="fb-h" tabIndex={-1} ref={panelRef}>
        <div className="sheet-head">
          <span className="grabber" aria-hidden="true" />
          <h2 id="fb-h">{p.initial ? "Bewertung ändern" : "Session bewerten"}</h2>
          <button type="button" className="iconbtn" aria-label="Schließen" onClick={p.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <div className="fb-head">
            <h3>{s.title}</h3>
            <p className="sub">
              {dayOf(s.date).short} · {timeLabel(s)}
              {s.room ? ` · ${s.room}` : ""}
            </p>
          </div>
          {FEEDBACK_QUESTIONS.map((q) => (
            <Stars key={q.key} id={`fb-${q.key}`} label={q.label} value={v[q.key]} onChange={(n) => setV((c) => ({ ...c, [q.key]: n }))} />
          ))}
          <label className="field">
            Was nimmst du mit? Was könnte besser sein? <span className="opt">(freiwillig)</span>
            <textarea
              value={v.comment}
              maxLength={1000}
              rows={4}
              onChange={(e) => setV((c) => ({ ...c, comment: e.target.value }))}
            />
            <span className="fb-count">{v.comment.length}/1000</span>
          </label>
          {p.loggedIn && (
            <label className="consent">
              <input type="checkbox" checked={v.share_name} onChange={(e) => setV((c) => ({ ...c, share_name: e.target.checked }))} />
              <span>Meinen Namen an die Organisation weitergeben</span>
            </label>
          )}
          <p className="sub">
            {p.loggedIn && v.share_name
              ? "Deine Bewertung geht mit deinem Namen an die Organisation der Session."
              : "Deine Bewertung geht anonym an die Organisation der Session."}
          </p>
          {!p.online && <p className="statusline caution">Wird gesendet, sobald du online bist.</p>}
          {err && <p className="clash" role="alert">{err}</p>}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn primary" onClick={() => void send()} disabled={busy} aria-disabled={!complete}>
            Bewertung senden
          </button>
        </div>
      </div>
    </div>
  );
}

type Summary = Awaited<ReturnType<typeof adminFeedbackSummary>>;

export function AdminFeedback({ online }: { online: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    setErr(null);
    adminFeedbackSummary()
      .then(setData)
      .catch(() => setErr("Auswertung konnte nicht geladen werden."));
  };
  useEffect(() => {
    if (online) load();
  }, [online]);
  const dl = (id?: string) => downloadFeedbackCsv(id).catch(() => setErr("Download fehlgeschlagen."));
  const f = (n: number | null) => (n == null ? "–" : n.toFixed(1).replace(".", ","));
  return (
    <section className="setblock" aria-labelledby="set-fb">
      <h3 id="set-fb">Feedback-Auswertung (Admin)</h3>
      {err && <p className="clash">{err}</p>}
      {!data ? (
        !err && <p className="sub">Wird geladen …</p>
      ) : (
        <>
          <p className="statusline">{data.total} Bewertungen insgesamt</p>
          {data.sessions.length > 0 && (
            <div className="fb-table-wrap">
              <table className="fb-table">
                <thead>
                  <tr>
                    <th scope="col">Session</th>
                    <th scope="col" title="Anzahl">n</th>
                    <th scope="col" title="Gesamteindruck">Ges.</th>
                    <th scope="col" title="Inhalt & Relevanz">Inh.</th>
                    <th scope="col" title="Interaktion & Moderation">Int.</th>
                    <th scope="col"><span className="sr-only">CSV</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="fb-when">{s.day} {s.start}</span> {s.title}
                      </td>
                      <td>{s.count}</td>
                      <td>{f(s.overall)}</td>
                      <td>{f(s.content)}</td>
                      <td>{f(s.interaction)}</td>
                      <td>
                        <button type="button" className="iconbtn small" aria-label={`CSV für „${s.title}“ herunterladen`} title="CSV herunterladen" onClick={() => void dl(s.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="btnrow">
        <button type="button" className="btn small" onClick={() => void dl()} disabled={!online}>
          Alle Feedbacks als CSV herunterladen
        </button>
      </div>
    </section>
  );
}
