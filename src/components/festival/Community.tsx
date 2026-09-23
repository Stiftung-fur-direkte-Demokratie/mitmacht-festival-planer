import { useEffect, useMemo, useRef, useState } from "react";
import { BY_ID, DAYS, mins, type Item, type NowInfo } from "@/lib/festival";
import { initials, LINKEDIN_URL_RE, type CommunityPerson, type MyProfile } from "@/lib/community";
import { Icon } from "./Icons";

const PRIVACY = "https://www.demokratie.ch/datenschutz";

export function LinkedInIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {url && !broken ? (
        <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function AvatarStack({ people, onClick }: { people: CommunityPerson[]; onClick: () => void }) {
  if (!people.length) return null;
  return (
    <button type="button" className="avstack" onClick={onClick}>
      <span className="avs">
        {people.slice(0, 3).map((p) => (
          <Avatar key={p.user_id} name={p.display_name} url={p.avatar_url} size={22} />
        ))}
      </span>
      {people.length} aus der Community dabei
    </button>
  );
}

function dayLabel(date: string) {
  const d = DAYS.find((x) => x.date === date);
  return d ? d.long.slice(0, 2) : date;
}

function whereNow(ids: string[], now: NowInfo) {
  const items = ids.map((id) => BY_ID[id]).filter(Boolean) as Item[];
  items.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const t = now.time ? mins(now.time) : -1;
  const live = items.find((s) => s.date === now.date && mins(s.start) <= t && t < mins(s.end));
  if (live) return { kind: "now" as const, s: live, items };
  const next = items.find((s) => s.date > now.date || (s.date === now.date && mins(s.start) > t));
  return { kind: next ? ("next" as const) : ("none" as const), s: next, items };
}

export function CommunityView(p: {
  people: CommunityPerson[];
  now: NowInfo;
  stand: number | null;
  online: boolean;
  loggedIn: boolean;
  isAdmin: boolean;
  configured: boolean | null;
  sessionFilter: string | null;
  onClearSessionFilter: () => void;
  onLogin: () => void;
  onOpenProfile: () => void;
  onHide: (uid: string, hidden: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [today, setToday] = useState(false);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return p.people.filter((x) => {
      if (p.sessionFilter && !x.session_ids.includes(p.sessionFilter)) return false;
      if (today && !x.session_ids.some((id) => BY_ID[id]?.date === p.now.date)) return false;
      if (!needle) return true;
      const hay = [x.display_name, x.organisation, x.role_title, ...x.session_ids.map((id) => BY_ID[id]?.title ?? "")]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [p.people, p.sessionFilter, p.now.date, q, today]);

  const filterItem = p.sessionFilter ? BY_ID[p.sessionFilter] : null;
  const standText = p.stand
    ? new Date(p.stand).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })
    : null;

  return (
    <section className="community">
      <p className="hint">Hier erscheinen nur Personen, die das ausdrücklich freigegeben haben.</p>
      {!p.online && standText && <p className="offline small">Offline – Stand: {standText} Uhr</p>}

      {!p.loggedIn && (
        <div className="cm-cta">
          <p>Mit LinkedIn anmelden und selbst sichtbar werden – freiwillig.</p>
          <button type="button" className="btn small" onClick={p.onLogin} disabled={!p.online}>
            <LinkedInIcon size={16} /> Mit LinkedIn anmelden
          </button>
          {!p.online && <p className="sub">Anmelden ist offline nicht möglich.</p>}
          {p.online && p.configured === false && <p className="sub">Die LinkedIn-Anmeldung wird gerade eingerichtet.</p>}
        </div>
      )}
      {p.loggedIn && (
        <p className="sub">
          <button type="button" className="linkbtn" onClick={p.onOpenProfile}>
            Mein Profil & Sichtbarkeit
          </button>
        </p>
      )}

      <div className="tools">
        <div className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, Organisation oder Session"
            autoComplete="off"
            aria-label="Community durchsuchen"
          />
          {q && (
            <button type="button" className="clear" aria-label="Suche löschen" onClick={() => setQ("")}>
              ×
            </button>
          )}
        </div>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={today} onClick={() => setToday((v) => !v)}>
            Heute dabei
          </button>
          {filterItem && (
            <button type="button" className="chip" aria-pressed="true" onClick={p.onClearSessionFilter}>
              {filterItem.title.length > 34 ? filterItem.title.slice(0, 32) + "…" : filterItem.title} ×
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="empty-cm">
          {p.people.length ? "Keine Treffer." : "Noch hat niemand die Teilnahme öffentlich freigegeben."}
        </p>
      ) : (
        <div className="cm-list">
          {list.map((x) => {
            const w = whereNow(x.session_ids, p.now);
            const meta = [x.role_title, x.organisation].filter(Boolean).join(" · ");
            return (
              <article className={`cm-card${x.hidden ? " hidden-admin" : ""}`} key={x.user_id}>
                <div className="cm-top">
                  <Avatar name={x.display_name} url={x.avatar_url} size={48} />
                  <div className="cm-txt">
                    <h3>{x.display_name}</h3>
                    {meta && <p className="sub">{meta}</p>}
                    {x.hidden && <p className="sub">Ausgeblendet (nur für Admins sichtbar)</p>}
                  </div>
                </div>
                <div className="cm-actions">
                  {x.linkedin_url && (
                    <a className="btn small" href={x.linkedin_url} target="_blank" rel="noopener noreferrer">
                      LinkedIn-Profil ↗
                    </a>
                  )}
                  {p.isAdmin && (
                    <button type="button" className="linkbtn" onClick={() => p.onHide(x.user_id, !x.hidden)} disabled={!p.online}>
                      {x.hidden ? "Wieder einblenden" : "Ausblenden"}
                    </button>
                  )}
                </div>
                {w.items.length > 0 && (
                  <div className="cm-where">
                    <p className="lbl">Wo finde ich sie/ihn?</p>
                    {w.kind === "now" && w.s && (
                      <p>
                        <b>Jetzt:</b> {w.s.title}
                        {w.s.room ? ` · ${w.s.room}` : ""}
                      </p>
                    )}
                    {w.kind === "next" && w.s && (
                      <p>
                        <b>Als Nächstes:</b> {dayLabel(w.s.date)} {w.s.start} · {w.s.title}
                        {w.s.room ? ` · ${w.s.room}` : ""}
                      </p>
                    )}
                    <button
                      type="button"
                      className="more"
                      aria-expanded={!!openIds[x.user_id]}
                      onClick={() => setOpenIds((o) => ({ ...o, [x.user_id]: !o[x.user_id] }))}
                    >
                      {openIds[x.user_id] ? "Weniger" : `Alle ${w.items.length} Sessions`}
                      <Icon name="chev" className="" />
                    </button>
                    {openIds[x.user_id] && (
                      <ul>
                        {w.items.map((s) => (
                          <li key={s.id}>
                            {dayLabel(s.date)} {s.start} · {s.title}
                            {s.room ? ` · ${s.room}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ProfileSheet(p: {
  open: boolean;
  onClose: () => void;
  profile: MyProfile | null;
  online: boolean;
  firstLogin: boolean;
  selCount: number;
  publicCount: number;
  onSave: (patch: Partial<MyProfile>) => Promise<boolean>;
  onShareAll: () => void;
  onLogout: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [li, setLi] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prof = p.profile;

  useEffect(() => {
    if (!p.open || !prof) return;
    setName(prof.display_name);
    setRole(prof.role_title ?? "");
    setOrg(prof.organisation ?? "");
    setLi(prof.linkedin_url ?? "");
    setConsent(false);
    setConfirmDel(false);
    setErr(null);
  }, [p.open, prof?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p.open) return;
    const panel = panelRef.current;
    const last = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    const t = setTimeout(() => (focusables()[0] ?? panel)?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        p.onClose();
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
  }, [p.open]);

  if (!p.open) return null;

  const saveForm = async () => {
    const n = name.trim();
    const url = li.trim();
    if (!n) return setErr("Bitte einen Namen angeben.");
    if (url && !LINKEDIN_URL_RE.test(url)) return setErr("Die LinkedIn-URL muss mit https://www.linkedin.com/in/ beginnen.");
    setErr(null);
    await p.onSave({
      display_name: n.slice(0, 80),
      role_title: role.trim().slice(0, 80) || null,
      organisation: org.trim().slice(0, 80) || null,
      linkedin_url: url || null,
    });
  };

  const off = !p.online;

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="prof-h" tabIndex={-1} ref={panelRef}>
        <div className="sheet-head">
          <span className="grabber" aria-hidden="true" />
          <h2 id="prof-h">Mein Profil & Sichtbarkeit</h2>
          <button type="button" className="iconbtn" aria-label="Schließen" onClick={p.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          {!prof ? (
            <p className="sub">Profil wird geladen …</p>
          ) : (
            <>
              {off && <p className="offline small">Offline – Änderungen sind erst mit Internet möglich.</p>}
              <section className="setblock">
                {p.firstLogin && <p className="statusline ok">Willkommen! Ergänze kurz dein Profil – alles außer dem Namen ist freiwillig.</p>}
                <div className="cm-top">
                  <Avatar name={name || prof.display_name} url={prof.avatar_url} size={56} />
                  <p className="sub">Das Foto kommt von LinkedIn und wird bei jedem Login aktualisiert. Deine E-Mail wird nie angezeigt.</p>
                </div>
                <label className="field">
                  Name
                  <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={off} />
                </label>
                <label className="field">
                  Funktion <span className="opt">(freiwillig)</span>
                  <input value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} disabled={off} />
                </label>
                <label className="field">
                  Organisation <span className="opt">(freiwillig)</span>
                  <input value={org} maxLength={80} onChange={(e) => setOrg(e.target.value)} disabled={off} />
                </label>
                <label className="field">
                  LinkedIn-Profil-URL <span className="opt">(freiwillig)</span>
                  <input
                    value={li}
                    type="url"
                    inputMode="url"
                    maxLength={200}
                    placeholder="https://www.linkedin.com/in/…"
                    onChange={(e) => setLi(e.target.value)}
                    disabled={off}
                  />
                </label>
                {err && <p className="clash" role="alert">{err}</p>}
                <div className="btnrow">
                  <button type="button" className="btn primary small" onClick={() => void saveForm()} disabled={off}>
                    Profil speichern
                  </button>
                </div>
              </section>

              <section className="setblock">
                <h3>Sichtbarkeit</h3>
                <p className={`statusline${prof.visible ? " ok" : ""}`}>
                  {prof.visible ? "In der Community sichtbar ✓" : "Nicht öffentlich sichtbar"}
                </p>
                {!prof.visible && (
                  <label className="consent">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={off} />
                    <span>
                      Ich willige ein, dass mein Name, Profilbild, Funktion/Organisation, LinkedIn-Link und die von mir
                      freigegebenen Sessions öffentlich auf dieser Seite angezeigt werden. Ich kann das jederzeit widerrufen.{" "}
                      <a href={PRIVACY} target="_blank" rel="noopener noreferrer">
                        Datenschutzerklärung ↗
                      </a>
                    </span>
                  </label>
                )}
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prof.visible}
                    disabled={off || (!prof.visible && !consent)}
                    onChange={(e) =>
                      void p.onSave(
                        e.target.checked
                          ? { visible: true, consent_at: new Date().toISOString() }
                          : { visible: false, consent_at: null },
                      )
                    }
                  />
                  In der Community sichtbar sein
                </label>
                <p className="sub">
                  {p.publicCount} von {p.selCount} gemerkten Sessions freigegeben. Einzeln freigeben kannst du sie in „Mein Programm".
                </p>
                <div className="btnrow">
                  <button type="button" className="btn small" onClick={p.onShareAll} disabled={off || !p.selCount}>
                    Alle meine Sessions freigeben
                  </button>
                </div>
              </section>

              <section className="setblock">
                <h3>Konto</h3>
                <div className="btnrow">
                  <button type="button" className="btn small" onClick={p.onLogout}>
                    Abmelden
                  </button>
                </div>
                {!confirmDel ? (
                  <button type="button" className="linkbtn danger" onClick={() => setConfirmDel(true)} disabled={off}>
                    Konto und alle Daten löschen
                  </button>
                ) : (
                  <div className="confirm" role="alert">
                    <p>Profil, Zusagen und Konto werden endgültig gelöscht. Dein Programm auf diesem Gerät bleibt erhalten.</p>
                    <div className="btnrow">
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={async () => {
                          if (await p.onDelete()) p.onClose();
                        }}
                      >
                        Endgültig löschen
                      </button>
                      <button type="button" className="linkbtn" onClick={() => setConfirmDel(false)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn primary" onClick={p.onClose}>
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}

export function HeroFaces({ people, onOpen }: { people: CommunityPerson[]; onOpen: () => void }) {
  const pool = people.filter((p) => !p.hidden);
  const [offset, setOffset] = useState(0);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    if (pool.length <= 5) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = window.setInterval(() => {
      if (reduce) return setOffset((o) => (o + 5) % pool.length);
      setFade(true);
      window.setTimeout(() => {
        setOffset((o) => (o + 5) % pool.length);
        setFade(false);
      }, 350);
    }, 4000);
    return () => window.clearInterval(t);
  }, [pool.length]);
  if (!pool.length) return null;
  const shown = Array.from({ length: Math.min(5, pool.length) }, (_, i) => pool[(offset + i) % pool.length]!);
  return (
    <div className="herofaces">
      <span className={`hf-row${fade ? " fade" : ""}`}>
        {shown.map((p) =>
          p.linkedin_url ? (
            <a key={p.user_id} href={p.linkedin_url} target="_blank" rel="noopener noreferrer" title={p.display_name} aria-label={`${p.display_name} auf LinkedIn`}>
              <Avatar name={p.display_name} url={p.avatar_url} size={32} />
            </a>
          ) : (
            <button key={p.user_id} type="button" onClick={onOpen} title={p.display_name} aria-label={`${p.display_name} in der Community`}>
              <Avatar name={p.display_name} url={p.avatar_url} size={32} />
            </button>
          ),
        )}
      </span>
      <button type="button" className="hf-more" onClick={onOpen}>
        Mitmacht-Community
      </button>
    </div>
  );
}
