import { createFileRoute } from "@tanstack/react-router";
import teamImg from "@/assets/team.png.asset.json";
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
  isLong,
  matchesQuery,
  minutesUntilEnd,
  minutesUntilStart,
  nowBerlin,
  timeLabel,
  type Item,
  type NowInfo,
} from "@/lib/festival";
import {
  checkForUpdate,
  isIos,
  isStandalone,
  offlineStatus,
  registerServiceWorker,
  resetOffline,
  swDisabled,
  type OfflineStatus,
} from "@/lib/pwa";
import { Icon, IconSprite } from "@/components/festival/Icons";
import { SettingsDialog } from "@/components/festival/SettingsDialog";
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
const LS_PWA = "mitmacht26-pwa-v1";
const LS_REM = "mitmacht26-reminders-v1";

type Stored = { sel: string[]; gcal: Record<string, { v: string; t: number }> };
type RemStore = { on: boolean; lead: number; notified: string[] };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

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

  /* ---- PWA ---- */
  const [swUpdate, setSwUpdate] = useState<{ apply: () => void } | null>(null);
  const [online, setOnline] = useState(true);
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [iosHintOff, setIosHintOff] = useState(false);
  const [rem, setRem] = useState<RemStore>({ on: false, lead: 10, notified: [] });
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [offline, setOffline] = useState<OfflineStatus>("disabled");

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
    try {
      const rawPwa = localStorage.getItem(LS_PWA);
      if (rawPwa) {
        const u = JSON.parse(rawPwa) as { iosHintOff?: boolean };
        if (u.iosHintOff) setIosHintOff(true);
      }
      const rawRem = localStorage.getItem(LS_REM);
      if (rawRem) {
        const r = JSON.parse(rawRem) as Partial<RemStore>;
        setRem({
          on: !!r.on,
          lead: [5, 10, 15].includes(Number(r.lead)) ? Number(r.lead) : 10,
          notified: Array.isArray(r.notified) ? r.notified : [],
        });
      }
    } catch {
      /* ignore */
    }
    setStandalone(isStandalone());
    setIos(isIos());
    setOnline(navigator.onLine);
    if ("Notification" in window) setPerm(Notification.permission);
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) {
      const ids = p.split(",").map((x) => x.trim()).filter((id) => BY_ID[id]);
      if (ids.length) setShareIds(ids);
    }
    const focusId = params.get("s");
    if (window.location.hash === "#einstellungen") setSettingsOpen(true);
    if (window.location.hash === "#mein" || focusId) setView("mine");
    if (focusId) {
      setTimeout(() => {
        document.getElementById("c-" + focusId)?.scrollIntoView({ block: "center" });
      }, 400);
    }
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

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_REM, JSON.stringify(rem));
    } catch {
      /* ignore */
    }
  }, [rem, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_PWA, JSON.stringify({ iosHintOff }));
    } catch {
      /* ignore */
    }
  }, [iosHintOff, ready]);

  /* ---- Uhrzeit-Status jede Minute ---- */
  useEffect(() => {
    const t = setInterval(() => setNow(nowBerlin()), 60000);
    return () => clearInterval(t);
  }, []);

  /* ---- Service Worker, Offline, Installation ---- */
  useEffect(() => {
    registerServiceWorker((apply) => setSwUpdate({ apply }));
    setOffline(offlineStatus());
    const offTick = setInterval(() => setOffline(offlineStatus()), 3000);
    const onHash = () => {
      if (window.location.hash === "#einstellungen") setSettingsOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const bip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    const installed = () => {
      setInstallEvt(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", bip);
    window.addEventListener("appinstalled", installed);
    const mq = window.matchMedia("(display-mode: standalone)");
    const mqChange = () => setStandalone(isStandalone());
    mq.addEventListener?.("change", mqChange);
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; id?: string } | null;
      if (data && data.type === "open-session") {
        setView("mine");
        if (data.id) {
          setTimeout(
            () => document.getElementById("c-" + data.id)?.scrollIntoView({ block: "center" }),
            250,
          );
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => {
      clearInterval(offTick);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", bip);
      window.removeEventListener("appinstalled", installed);
      mq.removeEventListener?.("change", mqChange);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  const selected = useMemo(
    () => (sel.map((id) => BY_ID[id]).filter(Boolean) as Item[]).sort(bySchedule),
    [sel],
  );
  const clashesOf = useCallback((s: Item) => clashesFor(s, selected), [selected]);

  /* ---- Lokale Erinnerungen ---- */
  const remRef = useRef(rem);
  remRef.current = rem;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const checkReminders = useCallback(() => {
    const n = nowBerlin();
    setNow(n);
    const r = remRef.current;
    if (!r.on || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const due = selectedRef.current.filter((s) => {
      if (isLong(s) || r.notified.includes(s.id)) return false;
      const u = minutesUntilStart(s, n);
      return u <= r.lead && u > -1;
    });
    if (!due.length) return;
    void (async () => {
      for (const s of due) {
        const u = Math.max(0, Math.round(minutesUntilStart(s, n)));
        const title = u <= 0 ? `Jetzt: ${s.title}` : `In ${u} Min: ${s.title}`;
        const opts: NotificationOptions = {
          body: `${s.start}–${s.end}${s.room ? " · " + s.room : ""}`,
          tag: s.id,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        };
        try {
          const reg = await navigator.serviceWorker?.ready;
          if (reg) await reg.showNotification(title, opts);
          else new Notification(title, opts);
        } catch {
          try {
            new Notification(title, opts);
          } catch {
            /* ignore */
          }
        }
      }
      setRem((cur) => ({
        ...cur,
        notified: Array.from(new Set([...cur.notified, ...due.map((s) => s.id)])),
      }));
    })();
  }, []);

  useEffect(() => {
    checkReminders();
    const t = setInterval(checkReminders, 30000);
    const vis = () => {
      if (!document.hidden) checkReminders();
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", checkReminders);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", checkReminders);
    };
  }, [checkReminders]);

  // Sofort prüfen, wenn sich Einstellungen oder Auswahl ändern
  useEffect(() => {
    if (!ready) return;
    checkReminders();
  }, [ready, rem.on, rem.lead, sel, perm, checkReminders]);


  const upcoming = useMemo(() => {
    if (!now.date) return null;
    const live = selected.find(
      (s) => !isLong(s) && minutesUntilStart(s, now) <= 0 && minutesUntilEnd(s, now) > 0,
    );
    if (live) return { s: live, live: true, mins: 0 };
    const soon = selected
      .filter((s) => !isLong(s))
      .map((s) => ({ s, u: minutesUntilStart(s, now) }))
      .filter((x) => x.u > 0 && x.u <= 60)
      .sort((a, b) => a.u - b.u)[0];
    return soon ? { s: soon.s, live: false, mins: soon.u } : null;
  }, [selected, now]);

  const remStats = useMemo(() => {
    const list = selected.filter((s) => !isLong(s));
    const next = now.date
      ? list.find((s) => minutesUntilStart(s, now) > 0)
      : list[0];
    const d = next ? dayOf(next.date) : null;
    return {
      count: list.length,
      next: next ? `${d ? d.short + " " : ""}${next.start} Uhr · ${next.title}` : null,
    };
  }, [selected, now]);

  const askPermission = async () => {
    if (typeof Notification === "undefined") {
      showToast("Benachrichtigungen werden hier nicht unterstützt");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p === "granted") {
        setRem((r) => ({ ...r, on: true }));
        showToast("Erinnerungen aktiviert");
      } else {
        showToast("Benachrichtigungen nicht erlaubt");
      }
    } catch {
      showToast("Benachrichtigungen nicht möglich");
    }
  };

  const installApp = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  const openSettings = () => {
    setUpdateMsg(null);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    if (window.location.hash === "#einstellungen") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const doCheckUpdate = async () => {
    setUpdateMsg("Suche nach Updates …");
    const res = await checkForUpdate();
    setUpdateMsg(
      res === "updated"
        ? "Neue Version gefunden – die App lädt gleich neu."
        : res === "current"
          ? "Du hast bereits die neueste Version."
          : "Offline-Speicher ist hier nicht aktiv.",
    );
  };

  const doResetOffline = () => {
    void resetOffline();
  };

  const testNotification = async () => {
    const title = "Test: Erinnerungen funktionieren";
    const opts: NotificationOptions = {
      body: `So sieht eine Erinnerung ${rem.lead} Minuten vor einer Session aus.`,
      tag: "mm-test",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    };
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);
      showToast("Test-Benachrichtigung gesendet");
    } catch {
      showToast("Test-Benachrichtigung nicht möglich");
    }
  };

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
    const blob = new Blob([buildIcs(selected, rem.lead)], {
      type: "text/calendar;charset=utf-8",
    });
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
          <button type="button" className="settingsbtn" onClick={openSettings} aria-label="Einstellungen">
            <Icon name="gear" />
            <span className="lbl">Einstellungen</span>
          </button>
          <p className="eyebrow">Online-Planer:in [Beta 2.1]</p>
          <h1>Mitmacht 2026</h1>
          <p className="lede">
            {"Festival-Programm 🚀 zusammenstellen & in Kalender eintragen. Läuft sogar offline als App 🤩"}
          </p>
          <p className="facts">
            <span>23.–26. September 2026</span>
            <span>
              <a
                href="https://www.google.com/maps/search/?api=1&query=SRH%20Hochschule%20Berlin%2C%20Sonnenallee%20221%2C%2012059%20Berlin"
                target="_blank"
                rel="noopener noreferrer"
              >
                SRH Hochschule Berlin, Sonnenallee 221 ↗
              </a>
            </span>
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
        {swUpdate && (
          <div className="notice" role="status">
            <div className="row">
              <p>Neue Version verfügbar.</p>
              <button type="button" className="btn small primary" onClick={swUpdate.apply}>
                Neu laden
              </button>
              <button type="button" className="linkbtn close" onClick={() => setSwUpdate(null)}>
                Später
              </button>
            </div>
          </div>
        )}

        {!online && (
          <p className="offline" role="status">
            <span className="dot" aria-hidden="true" />
            Offline – dein Programm ist auf diesem Gerät gespeichert.
          </p>
        )}

        {upcoming && (
          <div className={`nextup${upcoming.live ? " live" : ""}`} role="status">
            {upcoming.live ? (
              <>
                Läuft gerade: <b>{upcoming.s.title}</b> · {upcoming.s.start}–{upcoming.s.end}
                {upcoming.s.room ? ` · ${upcoming.s.room}` : ""}
              </>
            ) : (
              <>
                Als Nächstes: <b>{upcoming.s.title}</b> · {upcoming.s.start} Uhr
                {upcoming.s.room ? ` · ${upcoming.s.room}` : ""} (in {upcoming.mins} Min)
              </>
            )}
          </div>
        )}

        {!standalone && !iosHintOff && (installEvt || (ios && !swDisabled())) && (
          <div className="notice small">
            <div className="row">
              <p>
                <button type="button" className="linkbtn" onClick={openSettings}>
                  Als App installieren – so geht&#39;s
                </button>
              </p>
              <button
                type="button"
                className="linkbtn close"
                aria-label="Hinweis schließen"
                onClick={() => setIosHintOff(true)}
              >
                Verstanden
              </button>
            </div>
          </div>
        )}

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
                <p className="remline">
                  <Icon name="bell" />
                  {rem.on ? (
                    <>
                      <span>
                        Erinnerungen: <b>an</b> · {rem.lead} Min vorher
                      </span>
                      <button type="button" className="linkbtn" onClick={openSettings}>
                        Einstellungen ändern
                      </button>
                    </>
                  ) : (
                    <>
                      <span>
                        Erinnerungen: <b>aus</b>
                      </span>
                      <button type="button" className="linkbtn" onClick={openSettings}>
                        einschalten
                      </button>
                    </>
                  )}
                </p>

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
                      Die Datei enthält Erinnerungen ({rem.lead} Minuten vorher) – Apple Kalender
                      und Outlook übernehmen sie, Google Kalender nutzt beim Import meist seine
                      eigenen Standard-Erinnerungen. Auf iPhone und Mac öffnet sich die Datei direkt
                      im Kalender. Für Google Kalender am Computer: Einstellungen → Importieren
                      &amp; exportieren → <b>mitmacht-2026-mein-programm.ics</b> auswählen.
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
        <div className="teamblock">
          <p>
            Wir freuen uns aufs Festival mit euch, Team{" "}
            <a href="https://www.demokratie.ch" target="_blank" rel="noopener noreferrer">SDD</a>
          </p>
          <img className="teamimg" src={teamImg.url} alt="Sandro, Sophie, Lisa, Daniel und Niklaus" loading="lazy" />
        </div>

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
          <div>
            Das ist ein Online-Tool der Stiftung für Direkte Demokratie mit Inhalten von{" "}
            <a
              href="https://www.faktor-d.org/mitmachen/mitmacht-festival/2026/programm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Mitmacht-Festival 2026
            </a>
            .
          </div>
          <div>
            © 2026 – Stiftung für direkte Demokratie –{" "}
            <a
              href="https://www.demokratie.ch/datenschutz"
              target="_blank"
              rel="noopener noreferrer"
            >
              Datenschutzerklärung
            </a>
          </div>
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        standalone={standalone}
        ios={ios}
        canInstall={!!installEvt}
        onInstall={() => void installApp()}
        offline={offline}
        online={online}
        onCheckUpdate={() => void doCheckUpdate()}
        updateMsg={updateMsg}
        onResetOffline={doResetOffline}
        remOn={rem.on}
        remLead={rem.lead}
        onRemOn={(v) => setRem((r) => ({ ...r, on: v }))}
        onRemLead={(v) => setRem((r) => ({ ...r, lead: v }))}
        perm={perm}
        onAskPermission={() => void askPermission()}
        onTestNotification={() => void testNotification()}
        remCount={remStats.count}
        remNext={remStats.next}
      />

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
