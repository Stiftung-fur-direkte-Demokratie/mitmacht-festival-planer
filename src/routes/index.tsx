import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL,
  BY_ID,
  DAYS,
  FESTIVAL,
  FORMATS,
  FORMAT_LABEL,
  buildIcs,
  bySchedule,
  clashesFor,
  dayOf,
  gLink,
  matchesQuery,
  nowBerlin,
  timeLabel,
  type Item,
  type NowInfo,
} from "@/lib/festival";
import { Icon, IconSprite } from "@/components/festival/Icons";
import { SessionCard } from "@/components/festival/SessionCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mitmacht 2026 Programmplaner" },
      {
        name: "description",
        content:
          "Stell dir dein persönliches Programm für das Demokratiefestival Mitmacht 2026 × reCampaign zusammen und übernimm es in deinen Kalender.",
      },
      { property: "og:title", content: "Mitmacht 2026 Programmplaner" },
      {
        property: "og:description",
        content:
          "Persönliches Festivalprogramm für Mitmacht 2026 × reCampaign, 23.–26. September 2026 in Berlin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Planner,
});

const LS_KEY = "mitmacht26-programm-v1";
const LS_UI = LS_KEY + "-ui";

type Stored = { sel: string[]; gcal: Record<string, { v: string; t: number }> };

function Planner() {
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [gcal, setGcal] = useState<Record<string, { v: string; t: number }>>({});
  const [view, setView] = useState<"all" | "mine">("all");
  const [day, setDay] = useState<string>(DAYS[0]!.date);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState<NowInfo>({ date: "", time: "" });
  const [toast, setToast] = useState("");
  const [shareIds, setShareIds] = useState<string[] | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  /* ---- Laden ---- */
  useEffect(() => {
    const n = nowBerlin();
    setNow(n);
    if (DAYS.some((d) => d.date === n.date)) setDay(n.date);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        if (s && Array.isArray(s.sel)) {
          setSel(s.sel.filter((id) => BY_ID[id]));
          if (s.gcal && typeof s.gcal === "object") setGcal(s.gcal);
        }
      }
      const rawUi = localStorage.getItem(LS_UI);
      if (rawUi) {
        const u = JSON.parse(rawUi) as { types?: string[] };
        if (Array.isArray(u.types)) setTypes(u.types.filter((t) => FORMAT_LABEL[t]));
      }
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) {
      const ids = p.split(",").map((x) => x.trim()).filter((id) => BY_ID[id]);
      if (ids.length) setShareIds(ids);
    }
    if (window.location.hash === "#mein") setView("mine");
    setReady(true);
  }, []);

  /* ---- Speichern ---- */
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ sel, gcal, updatedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [sel, gcal, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_UI, JSON.stringify({ types }));
    } catch {
      /* ignore */
    }
  }, [types, ready]);

  /* ---- Uhrzeit-Status jede Minute ---- */
  useEffect(() => {
    const t = setInterval(() => setNow(nowBerlin()), 60000);
    return () => clearInterval(t);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  const selected = useMemo(
    () => sel.map((id) => BY_ID[id]).filter(Boolean).sort(bySchedule) as Item[],
    [sel],
  );
  const clashesOf = useCallback((s: Item) => clashesFor(s, selected), [selected]);

  const togglePick = (id: string) => {
    const s = BY_ID[id];
    if (!s) return;
    if (sel.includes(id)) {
      setSel(sel.filter((x) => x !== id));
      showToast("Aus deinem Programm entfernt");
    } else {
      const cl = clashesFor(s, selected);
      setSel([...sel, id]);
      showToast(cl.length ? "Gemerkt – mit Überschneidung" : "Zu deinem Programm hinzugefügt");
    }
  };
  const toggleOpen = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const toggleType = (t: string) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const matches = useCallback(
    (s: Item) => {
      if (types.length && !types.includes(s.format)) return false;
      return matchesQuery(s, q);
    },
    [types, q],
  );

  const scrollToBar = () => {
    const top = barRef.current?.offsetTop ?? 0;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "auto" });
  };

  /* ---- Gruppierung ---- */
  const renderDay = (date: string, filtered: boolean) => {
    const rows = ALL.filter((s) => s.date === date);
    const out: React.ReactNode[] = [];
    let group: { label: string; items: Item[] } | null = null;
    let cardCount = 0;
    const flush = () => {
      if (!group) return;
      const g = group;
      out.push(
        <section className="slot" key={`slot-${date}-${out.length}`}>
          <div className="time">{g.label}</div>
          <div className="items">
            {g.items.map((s) => (
              <SessionCard
                key={s.id}
                s={s}
                now={now}
                selected={sel.includes(s.id)}
                clashes={clashesOf(s)}
                open={!!open[s.id]}
                onToggleOpen={toggleOpen}
                onPick={togglePick}
              />
            ))}
          </div>
        </section>,
      );
      group = null;
    };
    rows.forEach((s) => {
      if (s.format === "pause" || s.format === "ende") {
        if (filtered) return;
        flush();
        out.push(
          <div className="pause" key={s.id}>
            <div className="time">{timeLabel(s)}</div>
            <span>{s.title}</span>
          </div>,
        );
        return;
      }
      if (!matches(s)) return;
      cardCount++;
      const label = timeLabel(s);
      if (!group || group.label !== label) {
        flush();
        group = { label, items: [] };
      }
      group.items.push(s);
    });
    flush();
    return { nodes: out, count: cardCount };
  };

  /* ---- Export-Status ---- */
  const pendingAdd = selected.filter((s) => !gcal[s.id]);
  const pendingRemove = Object.keys(gcal)
    .filter((id) => !sel.includes(id) && BY_ID[id])
    .map((id) => BY_ID[id] as Item)
    .sort(bySchedule);
  const doneCount = selected.length - pendingAdd.length;
  const next = pendingAdd[0];

  const markOpened = (id: string) => {
    setTimeout(() => {
      setGcal((g) => (g[id] ? g : { ...g, [id]: { v: "link", t: Date.now() } }));
      const left = pendingAdd.length - 1;
      showToast(
        left > 0
          ? "Termin in Google speichern – danach ist der nächste dran"
          : "Letzter Termin – danach ist alles übernommen",
      );
    }, 80);
  };

  const downloadIcs = () => {
    if (!selected.length) return;
    const blob = new Blob([buildIcs(selected)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitmacht-2026-mein-programm.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Kalenderdatei geladen");
  };

  const copyShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?p=${sel.join(",")}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMsg("Link kopiert – öffne ihn auf deinem Handy.");
    } catch {
      setCopyMsg(url);
    }
  };

  const nowCount = (date: string) => sel.filter((id) => BY_ID[id]?.date === date).length;

  return (
    <div className="mm">
      <IconSprite />

      <header className="hero">
        <div className="hero-circle" aria-hidden="true" />
        <div className="hero-dots" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow">
            Das Demokratiefestival · <b>×reCampaign</b>
          </p>
          <h1>Mitmacht 2026</h1>
          <p className="lede">
            Stell dir dein persönliches Festivalprogramm zusammen und übernimm es in deinen Google
            Kalender.
          </p>
          <p className="facts">
            <span>23.–26. September 2026</span>
            <span>SRH Hochschule Berlin</span>
            <span>Sonnenallee 221</span>
          </p>
        </div>
      </header>

      <nav className="bar" aria-label="Ansicht und Tag" ref={barRef}>
        <div className="wrap">
          <div className="views" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              role="tab"
              aria-selected={view === "all"}
              onClick={() => {
                setView("all");
                setConfirmClear(false);
              }}
            >
              Programm
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "mine"}
              onClick={() => {
                setView("mine");
                setConfirmClear(false);
              }}
            >
              Mein Programm <span className="count">{sel.length}</span>
            </button>
          </div>
          {view === "all" && (
            <div className="days" role="tablist" aria-label="Festivaltag">
              {DAYS.map((d) => {
                const n = nowCount(d.date);
                const active = day === d.date && !q;
                return (
                  <button
                    type="button"
                    role="tab"
                    key={d.date}
                    aria-selected={active}
                    onClick={() => {
                      setDay(d.date);
                      setQ("");
                      scrollToBar();
                    }}
                  >
                    {now.date === d.date && <span className="today">Heute</span>}
                    <span className="d1">
                      {d.short} {d.label.slice(0, 3)}
                    </span>
                    <span className="d2">{n ? `${n} gemerkt` : d.long}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <main className="wrap">
        {shareIds && (
          <div className="share" role="status">
            <p>{shareIds.length} Sessions übernehmen?</p>
            <div className="btnrow">
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
                  setSel(shareIds);
                  setShareIds(null);
                  showToast("Programm übernommen");
                }}
              >
                Ersetzen
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setSel((cur) => Array.from(new Set([...cur, ...shareIds])));
                  setShareIds(null);
                  showToast("Sessions hinzugefügt");
                }}
              >
                Hinzufügen
              </button>
              <button type="button" className="linkbtn" onClick={() => setShareIds(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {view === "all" ? (
          <section>
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
                  placeholder="Thema, Titel, Person, Organisation oder Raum"
                  autoComplete="off"
                  aria-label="Programm durchsuchen"
                />
                {q && (
                  <button
                    type="button"
                    className="clear"
                    aria-label="Suche löschen"
                    onClick={() => setQ("")}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="chips" aria-label="Nach Format filtern">
                {FORMATS.map((f) => (
                  <button
                    type="button"
                    key={f.key}
                    className="chip"
                    aria-pressed={types.includes(f.key)}
                    onClick={() => toggleType(f.key)}
                  >
                    <Icon name={f.key} />
                    {f.label}
                  </button>
                ))}
                {types.length > 0 && (
                  <button type="button" className="chip reset" onClick={() => setTypes([])}>
                    Alle Formate
                  </button>
                )}
              </div>
              {q &&
                (() => {
                  const total = DAYS.reduce(
                    (acc, d) => acc + renderDay(d.date, true).count,
                    0,
                  );
                  return (
                    <p className="hint">
                      {total ? (
                        <>
                          <b>{total}</b> Treffer an allen Festivaltagen
                        </>
                      ) : (
                        <>Keine Treffer für „{q.trim()}“.</>
                      )}
                    </p>
                  );
                })()}
            </div>

            <div className="list">
              {q
                ? DAYS.map((d) => {
                    const r = renderDay(d.date, true);
                    if (!r.count) return null;
                    return (
                      <div key={d.date}>
                        <h2 className="dayhead">
                          {d.long} {d.label}2026
                        </h2>
                        {r.nodes}
                      </div>
                    );
                  })
                : (() => {
                    const d = dayOf(day);
                    const filtered = types.length > 0;
                    const r = renderDay(d.date, filtered);
                    return (
                      <>
                        <h2 className="dayhead">
                          {d.long} {d.label}2026
                        </h2>
                        {r.nodes}
                        {filtered && !r.count && (
                          <p className="none">
                            An diesem Tag gibt es kein Angebot in den gewählten Formaten.
                          </p>
                        )}
                      </>
                    );
                  })()}
            </div>
          </section>
        ) : (
          <section>
            {!selected.length ? (
              <div className="empty">
                <h2>Noch nichts gemerkt</h2>
                <p>
                  Tippe im Programm auf <b>+</b> bei allem, was du sehen willst. Hier erscheint dann
                  dein persönlicher Ablauf – mit Hinweisen auf Überschneidungen und Export in deinen
                  Kalender.
                </p>
                <div className="btnrow" style={{ marginTop: 14 }}>
                  <button type="button" className="btn primary" onClick={() => setView("all")}>
                    Zum Programm
                  </button>
                </div>
              </div>
            ) : (
              <>
                <section className="export" aria-labelledby="exp-h">
                  <h2 id="exp-h">
                    <Icon name="cal" className="" />
                    In den Kalender übernehmen
                  </h2>
                  <p className="sub">
                    {selected.length} Termin{selected.length === 1 ? "" : "e"} in deinem Programm
                    {selected.filter((s) => clashesOf(s).length).length > 0 && (
                      <>
                        {" · "}
                        <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                          {selected.filter((s) => clashesOf(s).length).length} mit Überschneidung
                        </span>
                      </>
                    )}
                  </p>

                  <div className="block">
                    <p className="status">
                      Alles auf einmal – als Kalenderdatei für Apple Kalender, Outlook und Google
                      Kalender:
                    </p>
                    <div className="btnrow">
                      <button type="button" className="btn" onClick={downloadIcs}>
                        Kalenderdatei (.ics) laden
                      </button>
                    </div>
                    <p className="fine">
                      Auf iPhone und Mac öffnet sich die Datei direkt im Kalender. Für Google
                      Kalender am Computer: Einstellungen → Importieren &amp; exportieren →{" "}
                      <b>mitmacht-2026-mein-programm.ics</b> auswählen.
                    </p>
                  </div>

                  <div className="block">
                    <div
                      className="progress"
                      role="img"
                      aria-label={`${doneCount} von ${selected.length} Terminen in Google Kalender geöffnet`}
                    >
                      <i style={{ width: `${Math.round((doneCount / selected.length) * 100)}%` }} />
                    </div>
                    {next ? (
                      <>
                        <p className="status">
                          {doneCount ? (
                            <>
                              <b>
                                {doneCount} von {selected.length}
                              </b>{" "}
                              Terminen in Google geöffnet.
                            </>
                          ) : (
                            <>Google nimmt pro Link genau einen Termin an.</>
                          )}{" "}
                          Tippe auf den Button, tippe in Google Kalender auf <b>Speichern</b> und komm
                          hierher zurück – dann ist der nächste Termin dran.
                        </p>
                        <a
                          className="btn primary next"
                          href={gLink(next)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markOpened(next.id)}
                        >
                          <span className="n1">
                            Termin {doneCount + 1} von {selected.length} in Google Kalender öffnen ↗
                          </span>
                          <span className="n2">
                            {dayOf(next.date).short} {dayOf(next.date).label}, {next.start} ·{" "}
                            {next.title}
                          </span>
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="status" style={{ color: "var(--ok)", fontWeight: 600 }}>
                          Alle {selected.length} Termine wurden in Google Kalender geöffnet.
                        </p>
                        <p className="fine">
                          Nimmst du etwas Neues ins Programm, erscheint es hier wieder zum
                          Übernehmen.{" "}
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => setGcal({})}
                          >
                            Alle Markierungen zurücksetzen
                          </button>
                        </p>
                      </>
                    )}
                    {pendingRemove.length > 0 && (
                      <div className="confirm">
                        <p>
                          Nicht mehr in deinem Programm, aber schon an Google übergeben:{" "}
                          {pendingRemove.map((s) => `„${s.title}“`).join(", ")}. Falls du{" "}
                          {pendingRemove.length === 1 ? "ihn" : "sie"} gespeichert hast, lösch{" "}
                          {pendingRemove.length === 1 ? "ihn" : "sie"} bitte direkt in Google
                          Kalender.
                        </p>
                        <div className="btnrow">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() =>
                              setGcal((g) => {
                                const c = { ...g };
                                pendingRemove.forEach((s) => delete c[s.id]);
                                return c;
                              })
                            }
                          >
                            Erledigt
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="block">
                    <p className="status">Programm aufs Handy übertragen:</p>
                    <div className="btnrow">
                      <button type="button" className="btn" onClick={copyShareLink}>
                        Link zu meinem Programm kopieren
                      </button>
                    </div>
                    {copyMsg && <p className="msg ok">{copyMsg}</p>}
                  </div>
                </section>

                {DAYS.map((d) => {
                  const items = selected.filter((s) => s.date === d.date);
                  if (!items.length) return null;
                  return (
                    <div key={d.date}>
                      <h2 className="dayhead">
                        {d.long} {d.label}2026
                      </h2>
                      <div className="items">
                        {items.map((s) => (
                          <SessionCard
                            key={s.id}
                            s={s}
                            now={now}
                            selected
                            clashes={clashesOf(s)}
                            open={!!open[s.id]}
                            onToggleOpen={toggleOpen}
                            onPick={togglePick}
                            showTime
                            showLinks
                            gcalOpened={!!gcal[s.id]}
                            onOpenGcal={markOpened}
                            onUnmarkGcal={(id) =>
                              setGcal((g) => {
                                const c = { ...g };
                                delete c[id];
                                return c;
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="foot" style={{ paddingTop: 26 }}>
                  {confirmClear ? (
                    <div className="confirm">
                      <p>
                        Dein ganzes Programm leeren? Termine in deinem Kalender bleiben dort stehen.
                      </p>
                      <div className="btnrow">
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => {
                            setSel([]);
                            setConfirmClear(false);
                            showToast("Programm geleert");
                          }}
                        >
                          Ja, leeren
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setConfirmClear(false)}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button type="button" className="linkbtn" onClick={() => setConfirmClear(true)}>
                        Programm leeren
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        <details className="info">
          <summary>Anreise, Orte &amp; Räume</summary>
          <div className="grid">
            <div>
              <h4>Adresse</h4>
              <p>
                {FESTIVAL.venue}
                <br />
                {FESTIVAL.entrance}
              </p>
              <p style={{ marginTop: 6 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(FESTIVAL.venue)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  In Google Maps öffnen ↗
                </a>
              </p>
            </div>
            <div>
              <h4>Veranstaltungsbereiche</h4>
              <ul>
                {FESTIVAL.areas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Räume finden</h4>
              <ul>
                {FESTIVAL.rooms.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Gut zu wissen</h4>
              <ul>
                {FESTIVAL.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        <div className="foot">
          <div className="sync">
            <span className="dot" />
            <span>Deine Auswahl wird in diesem Browser gespeichert.</span>
          </div>
          <div>
            {FESTIVAL.sources}.{" "}
            <a href={FESTIVAL.programUrl} target="_blank" rel="noopener noreferrer">
              Programm auf faktor-d.org ↗
            </a>
          </div>
        </div>
      </main>

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
