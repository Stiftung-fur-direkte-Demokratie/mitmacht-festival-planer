import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BY_ID, DAYS, mins, type Item, type NowInfo } from "@/lib/festival";
import { detectCc, formatNational, formatPhone, initials, normalizeEmail, normalizeLinkedIn, normalizePhone, PHONE_CODES, loadNotifyStatus, sendNotifyTest, type NotifyStatus, type CommunityPerson, type MyProfile } from "@/lib/community";
import { Icon } from "./Icons";
import { MessageIcon } from "./Inbox";

const LI_URL_ERR =
  "Bitte den Link zu deinem LinkedIn-Profil einfügen (z. B. https://www.linkedin.com/in/dein-name). Kurzlinks (lnkd.in) funktionieren nicht.";
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
  currentUserId?: string | null;
  mySessionIds?: string[];
  sub: "leute" | "postfach";
  onSub: (s: "leute" | "postfach") => void;
  unread: number;
  inbox: ReactNode;
  blockedIds: Set<string>;
  onMessage: (person: CommunityPerson) => void;
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

  const mine = useMemo(() => new Set(p.mySessionIds ?? []), [p.mySessionIds]);
  const sorted = useMemo(
    () =>
      list
        .map((x) => {
          const w = whereNow(x.session_ids, p.now);
          const sameNow = x.user_id !== p.currentUserId && w.kind === "now" && !!w.s && mine.has(w.s.id);
          const shared = x.session_ids.filter((id) => mine.has(id)).length;
          return { x, w, sameNow, shared };
        })
        .sort((a, b) => Number(b.sameNow) - Number(a.sameNow) || b.shared - a.shared),
    [list, p.now, mine, p.currentUserId],
  );

  const filterItem = p.sessionFilter ? BY_ID[p.sessionFilter] : null;
  const standText = p.stand
    ? new Date(p.stand).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })
    : null;

  return (
    <section className="community">
      <div className="subtabs" role="tablist" aria-label="Community-Bereich">
        <button type="button" role="tab" aria-selected={p.sub === "leute"} onClick={() => p.onSub("leute")}>
          Leute
        </button>
        <button type="button" role="tab" aria-selected={p.sub === "postfach"} onClick={() => p.onSub("postfach")}>
          Postfach {p.unread > 0 && <span className="count" aria-label={`${p.unread} ungelesen`}>{p.unread}</span>}
        </button>
      </div>
      {p.sub === "postfach" ? (
        p.inbox
      ) : (
      <>
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
        <>
        {list.some((x) => x.linkedin_url) && (
          <p className="sub">Öffnet das LinkedIn-Profil – dort kannst du eine Nachricht schreiben oder dich vernetzen.</p>
        )}
        <div className="cm-list">
          {sorted.map(({ x, w, sameNow, shared }) => {
            const open = !!openIds[x.user_id];
            const canMsg = x.accept_messages && x.user_id !== p.currentUserId && !p.blockedIds.has(x.user_id);
            return (
              <article
                className={`cm-bubble${x.hidden ? " hidden-admin" : ""}${sameNow ? " same" : ""}${open ? " open" : ""}`}
                key={x.user_id}
              >
                <button
                  type="button"
                  className="cm-face"
                  aria-expanded={open}
                  aria-label={`${x.display_name} – Details ${open ? "schliessen" : "anzeigen"}`}
                  onClick={(e) => {
                    const willOpen = !openIds[x.user_id];
                    setOpenIds(willOpen ? { [x.user_id]: true } : {});
                    if (willOpen) {
                      const el = e.currentTarget.closest(".cm-bubble");
                      setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
                    }
                  }}
                >
                  <span className="cm-ring">
                    <Avatar name={x.display_name} url={x.avatar_url} size={76} />
                  </span>
                  {sameNow && <span className="cm-badge">Gleiche Session</span>}
                </button>
                <h3>
                  {x.display_name}
                  {x.user_id === p.currentUserId && <span className="cm-you"> (Du)</span>}
                </h3>
                {x.role_title && <p className="cm-role">{x.role_title}</p>}
                {x.organisation && <p className="cm-org">{x.organisation}</p>}
                {x.hidden && <p className="cm-org">Ausgeblendet (nur Admins)</p>}
                {w.kind === "now" && w.s && (
                  <p className="cm-now"><span className="dot" aria-hidden="true" />Jetzt: {w.s.title}</p>
                )}
                {w.kind === "next" && w.s && (
                  <p className="cm-next">Als Nächstes: {dayLabel(w.s.date)} {w.s.start}</p>
                )}
                {shared > 0 && x.user_id !== p.currentUserId && (
                  <p className="cm-shared">{shared} gemeinsame Session{shared > 1 ? "s" : ""}</p>
                )}
                <div className="cm-icons">
                  {canMsg && (
                    <button type="button" className="cm-ico" onClick={() => p.onMessage(x)} aria-label={`${x.display_name} eine Nachricht schreiben`} title="Nachricht">
                      <MessageIcon size={18} />
                    </button>
                  )}
                  {x.linkedin_url && (
                    <a className="cm-ico li" href={x.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={`${x.display_name} auf LinkedIn kontaktieren`} title="LinkedIn">
                      <LinkedInIcon size={18} />
                    </a>
                  )}
                  {x.contact_email && (
                    <a className="cm-ico" href={`mailto:${x.contact_email}`} aria-label={`${x.display_name} eine E-Mail schreiben`} title="E-Mail">
                      <MailIcon />
                    </a>
                  )}
                  {x.phone && (
                    <a className="cm-ico" href={`tel:${x.phone}`} aria-label={`${x.display_name} anrufen (${formatPhone(x.phone)})`} title="Anrufen">
                      <PhoneIcon />
                    </a>
                  )}
                </div>
                {!x.linkedin_url && x.user_id === p.currentUserId && (
                  <button type="button" className="linkbtn" onClick={p.onOpenProfile}>LinkedIn-Link ergänzen</button>
                )}
                {open && (
                  <div className="cm-detail">
                    {w.items.length > 0 ? (
                      <>
                        <p className="lbl">Sessions ({w.items.length})</p>
                        <ul>
                          {w.items.map((s) => (
                            <li key={s.id} className={mine.has(s.id) ? "mine" : undefined}>
                              {dayLabel(s.date)} {s.start} · {s.title}
                              {s.room ? ` · ${s.room}` : ""}
                              {mine.has(s.id) && <span className="sr-only"> (auch in deiner Agenda)</span>}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="lbl">Keine Sessions freigegeben.</p>
                    )}
                    {p.isAdmin && (
                      <button type="button" className="linkbtn" onClick={() => p.onHide(x.user_id, !x.hidden)} disabled={!p.online}>
                        {x.hidden ? "Wieder einblenden" : "Ausblenden"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        </>
      )}
      </>
      )}
    </section>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
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
  onNotify?: (msg: string) => void;
  blocks?: { user_id: string; display_name: string; avatar_url: string | null }[];
  onUnblock?: (uid: string) => void;
  pushHere?: boolean;
  onEnablePush?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [li, setLi] = useState("");
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState<string>("+41");
  const [phoneNum, setPhoneNum] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prof = p.profile;
  const [nst, setNst] = useState<NotifyStatus | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testRes, setTestRes] = useState<string | null>(null);
  useEffect(() => {
    if (!p.open || !p.online) return;
    setTestRes(null);
    void loadNotifyStatus().then(setNst);
  }, [p.open, p.online]);

  useEffect(() => {
    if (!p.open || !prof) return;
    setName(prof.display_name);
    setRole(prof.role_title ?? "");
    setOrg(prof.organisation ?? "");
    setLi(prof.linkedin_url ?? "");
    setEmail(prof.contact_email ?? "");
    if (prof.phone) {
      const d = detectCc(prof.phone);
      setCc(d ?? "other");
      setPhoneNum(d ? formatNational(prof.phone.slice(d.length), d) : prof.phone);
    } else {
      setCc("+41");
      setPhoneNum("");
    }
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
    const raw = li.trim();
    if (!n) return setErr("Bitte einen Namen angeben.");
    const url = raw ? normalizeLinkedIn(raw) : "";
    if (url === null) return setErr(LI_URL_ERR);
    const mail = normalizeEmail(email);
    if (mail === null) return setErr("Bitte eine gültige E-Mail-Adresse eingeben.");
    const tel = normalizePhone(phoneNum, cc);
    if (tel === null) return setErr("Bitte eine gültige Mobilnummer eingeben, z. B. 079 123 45 67.");
    setLi(url);
    setEmail(mail);
    if (tel) {
      const d = detectCc(tel);
      setCc(d ?? "other");
      setPhoneNum(d ? formatNational(tel.slice(d.length), d) : formatPhone(tel));
    }
    setErr(null);
    await p.onSave({
      contact_email: mail || null,
      phone: tel || null,
      display_name: n.slice(0, 80),
      role_title: role.trim().slice(0, 80) || null,
      organisation: org.trim().slice(0, 80) || null,
      linkedin_url: url || null,
    });
  };

  const onPhoneInput = (val: string) => {
    const t = val.replace(/[\s\-().\/]/g, "");
    if (/^(\+|00)/.test(t)) {
      const full = normalizePhone(t, cc);
      const d = full ? detectCc(full) : null;
      if (full && d) {
        setCc(d);
        setPhoneNum(formatNational(full.slice(d.length), d));
        return;
      }
      if (cc !== "other" && t.length > 3) setCc("other");
    }
    setPhoneNum(val);
  };

  const off = !p.online;
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
  const pasteLi = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const u = normalizeLinkedIn(t);
      if (!u) return setErr(LI_URL_ERR);
      setLi(u);
      setErr(null);
    } catch {
      setErr(LI_URL_ERR);
    }
  };

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
                <p className="sub">
                  So findest du ihn: LinkedIn-App → dein Profil → ··· → „Profil teilen“ → „Link kopieren“ – und hier einfügen.
                </p>
                <div className="li-help">
                  <a className="btn small" href="https://www.linkedin.com/in/me/" target="_blank" rel="noopener noreferrer">
                    Mein LinkedIn-Profil öffnen
                  </a>
                  {canPaste && (
                    <button type="button" className="btn small" onClick={() => void pasteLi()} disabled={off}>
                      Aus Zwischenablage einfügen
                    </button>
                  )}
                </div>
                <div className="pubwarn" role="note">
                  Achtung: E-Mail und Mobilnummer sind öffentlich – alle Besucher:innen dieser Website sehen sie (auch ohne
                  Anmeldung), solange du in der Community sichtbar bist. Trag sie nur ein, wenn du so kontaktiert werden möchtest.
                </div>
                <label className="field">
                  E-Mail <span className="opt">(freiwillig)</span>
                  <input
                    value={email}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="name@beispiel.ch"
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={off}
                  />
                </label>
                <div className="field">
                  <label htmlFor="prof-phone">
                    Mobilnummer <span className="opt">(freiwillig)</span>
                  </label>
                  <div className="phonerow">
                    <select aria-label="Ländervorwahl" value={cc} onChange={(e) => setCc(e.target.value)} disabled={off}>
                      {PHONE_CODES.map((c) => (
                        <option key={c.cc} value={c.cc}>
                          {c.label}
                        </option>
                      ))}
                      <option value="other">Andere</option>
                    </select>
                    <input
                      id="prof-phone"
                      value={phoneNum}
                      type="tel"
                      inputMode="tel"
                      autoComplete={cc === "other" ? "tel" : "tel-national"}
                      maxLength={24}
                      placeholder={cc === "other" ? "+…" : "79 123 45 67"}
                      onChange={(e) => onPhoneInput(e.target.value)}
                      disabled={off}
                    />
                  </div>
                </div>
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
                {prof.visible && !prof.linkedin_url && (
                  <p className="statusline caution">Andere können dich noch nicht kontaktieren – ergänze oben deinen LinkedIn-Link.</p>
                )}
                {!prof.visible && (
                  <label className="consent">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={off} />
                    <span>
                      Ich willige ein, dass mein Name, Profilbild, Funktion/Organisation, LinkedIn-Link, E-Mail-Adresse und Mobilnummer (falls angegeben) und die von mir
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
                    onChange={async (e) => {
                      const on = e.target.checked;
                      const ok = await p.onSave(
                        on ? { visible: true, consent_at: new Date().toISOString() } : { visible: false, consent_at: null },
                      );
                      if (ok && on && !prof.linkedin_url) p.onNotify?.("Sichtbar ✓ – ergänze noch deinen LinkedIn-Link, damit man dich kontaktieren kann");
                    }}
                  />
                  In der Community sichtbar sein
                </label>
                {prof.visible && (
                  <>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={prof.accept_messages}
                        disabled={off}
                        onChange={(e) => void p.onSave({ accept_messages: e.target.checked })}
                      />
                      Nachrichten von anderen Teilnehmenden empfangen
                    </label>
                    <p className="sub">Andere angemeldete Personen können dir im Postfach schreiben. Deine E-Mail-Adresse sieht niemand.</p>
                  </>
                )}
                <p className="sub">
                  {p.publicCount} von {p.selCount} gemerkten Sessions freigegeben. Einzeln freigeben kannst du sie in „Mein Programm".
                </p>
                <div className="btnrow">
                  <button type="button" className="btn small" onClick={p.onShareAll} disabled={off || !p.selCount}>
                    Alle meine Sessions freigeben
                  </button>
                </div>
              </section>

              <section className="setblock" aria-labelledby="prof-notify">
                <h3 id="prof-notify">Benachrichtigungen</h3>
                {([
                  ["morning", "Tagesübersicht am Morgen (07:30)"],
                  ["evening", "Erinnerung zur Bewertung am Abend (20:00)"],
                ] as const).map(([k, label]) => (
                  <fieldset className="notifyrow" key={k}>
                    <legend>{label}</legend>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={prof[`notify_${k}_push`]}
                        disabled={off}
                        onChange={(e) => void p.onSave({ [`notify_${k}_push`]: e.target.checked })}
                      />
                      <span>Push</span>
                    </label>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={prof[`notify_${k}_email`]}
                        disabled={off}
                        onChange={(e) => void p.onSave({ [`notify_${k}_email`]: e.target.checked })}
                      />
                      <span>E-Mail</span>
                    </label>
                  </fieldset>
                ))}
                {(prof.notify_morning_email || prof.notify_evening_email) && (
                  <>
                    {nst && !nst.smtp && <p className="statusline caution">E-Mail-Versand ist noch nicht eingerichtet.</p>}
                    {nst?.recipient && <p className="statusline">Geht an: {nst.recipient}</p>}
                    <p className="sub">Die Login-E-Mail bleibt privat; öffentlich ist nur, was du oben als E-Mail einträgst.</p>
                  </>
                )}
                {(prof.notify_morning_push || prof.notify_evening_push) && (!p.pushHere || nst?.pushDevices === 0) && (
                  <div className="notice small">
                    <div className="row">
                      <p>Auf diesem Gerät sind Push-Benachrichtigungen noch nicht aktiv.</p>
                      <button type="button" className="btn small" onClick={p.onEnablePush} disabled={off}>
                        Push aktivieren
                      </button>
                    </div>
                  </div>
                )}
                <div className="btnrow">
                  <button
                    type="button"
                    className="btn small"
                    disabled={off || testBusy}
                    onClick={async () => {
                      setTestBusy(true);
                      const r = await sendNotifyTest();
                      setTestBusy(false);
                      setTestRes(r.ok ? `Push: ${r.push ?? "aus"} · E-Mail: ${r.email ?? "aus"}` : r.error ?? "Fehler");
                      void loadNotifyStatus().then(setNst);
                    }}
                  >
                    {testBusy ? "Wird gesendet …" : "Test senden"}
                  </button>
                </div>
                {testRes && <p className="statusline" role="status">{testRes}</p>}
              </section>

              {!!p.blocks?.length && (
                <section className="setblock">
                  <h3>Blockierte Personen</h3>
                  <ul className="blocklist">
                    {p.blocks.map((b) => (
                      <li key={b.user_id}>
                        <Avatar name={b.display_name} url={b.avatar_url} size={32} />
                        <span>{b.display_name}</span>
                        <button type="button" className="linkbtn" disabled={off} onClick={() => p.onUnblock?.(b.user_id)}>
                          Blockierung aufheben
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

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
        Entdecke die Mitmacht-Community
      </button>
    </div>
  );
}
